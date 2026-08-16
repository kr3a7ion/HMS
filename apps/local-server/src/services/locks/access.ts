// Shared issue/revoke logic for access_credentials -- used by
// routes/doorLock.ts (Check-In Step 7, FD-12/13/14) AND routes/
// reservations.ts (auto-revoke at check-out, Blueprint 6.9), so both paths
// share one real implementation instead of two that could drift apart.
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { accessCredentials, roomLockMappings, doorLockConfig } from "../../db/schema.js";
import { TTLockAdapter } from "./ttlockAdapter.js";
import { LockProviderError } from "./provider.js";
import { enqueue, logEvent } from "./queue.js";
import { getDoorLockConfig } from "./config.js";

// Door-lock config access lives in ./config.ts so ttlockAdapter.ts can read
// decrypted credentials without importing this file (which imports the
// adapter). Re-exported here so existing callers keep working.
export { getDoorLockConfig, readDoorLockConfigWithSecrets } from "./config.js";

export function getRoomLock(roomId: string) {
  return db.select().from(roomLockMappings).where(eq(roomLockMappings.roomId, roomId)).get() ?? null;
}

// The Card Encoder Agent (Blueprint 6.1: "background service on FD PC,
// interfaces with USB card encoder hardware") is real hardware that
// doesn't exist in this environment. What it would normally do is read a
// blank card's serial number off the USB reader; this generates a
// realistic-shaped placeholder serial in its place so the rest of the
// pipeline (TTLock registration, DB record, audit log) is exercised for
// real. Swap this for an actual Card Encoder Agent call once that hardware
// exists -- everything downstream of it is unaffected.
export function readCardSerialFromEncoder(): string {
  const hex = () => crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `${hex()}-${hex()}`;
}

export function generateRandomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
export function maskPin(pin: string): string {
  return `${pin.slice(0, 2)}**${pin.slice(-2)}`;
}

interface IssueCardParams {
  organizationId: string; branchId: string; reservationId: string; guestId: string; roomId: string;
  validFrom: Date; validTo: Date; issuedBy: string; isDuplicate?: boolean; parentCredentialId?: string | null;
}
interface IssueResult { credentialId: string; status: string; queued: boolean; pin?: string }

export async function issueCardCredential(params: IssueCardParams): Promise<IssueResult> {
  const lock = getRoomLock(params.roomId);
  const id = nanoid();
  const cardNumber = readCardSerialFromEncoder();
  db.insert(accessCredentials).values({
    id, organizationId: params.organizationId, branchId: params.branchId, reservationId: params.reservationId,
    guestId: params.guestId, roomId: params.roomId, credentialType: "card", credentialReference: cardNumber,
    validFrom: params.validFrom, validTo: params.validTo, status: "pending_sync",
    isDuplicate: params.isDuplicate ?? false, parentCredentialId: params.parentCredentialId ?? null,
    issuedBy: params.issuedBy, issuedAt: new Date(), syncStatus: "pending",
  }).run();

  if (!lock) {
    logEvent(id, "encode_failed", params.issuedBy, "Room has no lock mapped -- configure Room → Lock Mapping in Settings");
    db.update(accessCredentials).set({ status: "failed" }).where(eq(accessCredentials.id, id)).run();
    return { credentialId: id, status: "failed", queued: false };
  }

  const config = getDoorLockConfig(params.branchId);
  const cfg = config as any;
  const payload = { lockId: lock.ttlockLockId, cardNumber, cardName: `${params.roomId}-${cardNumber}`, validFrom: params.validFrom, validTo: params.validTo };
  try {
    const adapter = new TTLockAdapter(params.branchId);
    const result = await adapter.activateCardAccess(payload);
    db.update(accessCredentials).set({ status: "active", syncStatus: "synced", ttlockCardId: result.ttlockCardId }).where(eq(accessCredentials.id, id)).run();
    logEvent(id, params.isDuplicate ? "duplicate_issued" : "issued", params.issuedBy, `Card ${cardNumber} activated on lock ${lock.ttlockLockId}`);
    return { credentialId: id, status: "active", queued: false };
  } catch (err) {
    const retryable = err instanceof LockProviderError ? err.retryable : true;
    if (retryable && (cfg?.queueWhenOffline ?? true)) {
      enqueue(params.branchId, "activate_card", id, payload, params.validTo);
      return { credentialId: id, status: "pending_sync", queued: true };
    }
    logEvent(id, "api_failed", params.issuedBy, err instanceof Error ? err.message : "Unknown error");
    db.update(accessCredentials).set({ status: "failed" }).where(eq(accessCredentials.id, id)).run();
    return { credentialId: id, status: "failed", queued: false };
  }
}

interface IssuePinParams extends Omit<IssueCardParams, "isDuplicate" | "parentCredentialId"> {}

export async function issuePinCredential(params: IssuePinParams): Promise<IssueResult> {
  const lock = getRoomLock(params.roomId);
  const id = nanoid();
  const pin = generateRandomPin();
  db.insert(accessCredentials).values({
    id, organizationId: params.organizationId, branchId: params.branchId, reservationId: params.reservationId,
    guestId: params.guestId, roomId: params.roomId, credentialType: "pin", credentialReference: maskPin(pin),
    validFrom: params.validFrom, validTo: params.validTo, status: "pending_sync",
    issuedBy: params.issuedBy, issuedAt: new Date(), syncStatus: "pending",
  }).run();

  if (!lock) {
    logEvent(id, "encode_failed", params.issuedBy, "Room has no lock mapped -- configure Room → Lock Mapping in Settings");
    db.update(accessCredentials).set({ status: "failed" }).where(eq(accessCredentials.id, id)).run();
    return { credentialId: id, status: "failed", queued: false };
  }

  const config = getDoorLockConfig(params.branchId);
  const cfg = config as any;
  const payload = { lockId: lock.ttlockLockId, pin, pinName: `${params.roomId}-pin`, validFrom: params.validFrom, validTo: params.validTo };
  try {
    const adapter = new TTLockAdapter(params.branchId);
    const result = await adapter.generatePIN(payload);
    db.update(accessCredentials).set({ status: "active", syncStatus: "synced", ttlockKeyboardPwdId: result.ttlockKeyboardPwdId }).where(eq(accessCredentials.id, id)).run();
    logEvent(id, "issued", params.issuedBy, `PIN activated on lock ${lock.ttlockLockId}`);
    // The plaintext PIN is returned exactly once, here, to the caller that
    // just generated it -- never persisted, never returned by any other
    // endpoint again (Blueprint 6.4: "Cannot be retrieved after this screen").
    return { credentialId: id, status: "active", queued: false, pin };
  } catch (err) {
    const retryable = err instanceof LockProviderError ? err.retryable : true;
    if (retryable && (cfg?.queueWhenOffline ?? true)) {
      enqueue(params.branchId, "activate_pin", id, payload, params.validTo);
      return { credentialId: id, status: "pending_sync", queued: true, pin };
    }
    logEvent(id, "api_failed", params.issuedBy, err instanceof Error ? err.message : "Unknown error");
    db.update(accessCredentials).set({ status: "failed" }).where(eq(accessCredentials.id, id)).run();
    return { credentialId: id, status: "failed", queued: false };
  }
}

export function issuePhysicalKeyCredential(params: IssueCardParams & { notes?: string }): IssueResult {
  const id = nanoid();
  db.insert(accessCredentials).values({
    id, organizationId: params.organizationId, branchId: params.branchId, reservationId: params.reservationId,
    guestId: params.guestId, roomId: params.roomId, credentialType: "physical_key", credentialReference: params.notes ?? "Physical key",
    validFrom: params.validFrom, validTo: params.validTo, status: "pending_sync",
    issuedBy: params.issuedBy, issuedAt: new Date(), syncStatus: "pending", notes: params.notes ?? null,
  }).run();
  logEvent(id, "issued", params.issuedBy, "Physical key fallback logged (offline)");
  return { credentialId: id, status: "pending_sync", queued: false };
}

// Blueprint 6.8 (Emergency Revoke) and 6.9 (auto-revoke at check-out) both
// end up here -- parallel TTLock calls per credential, "speed matters" per
// 6.8, so Promise.all rather than a sequential loop.
export async function revokeCredentialsForRoom(branchId: string, roomId: string, reason: string, performedBy: string | null): Promise<{ revoked: number; queued: number; failed: number }> {
  const active = db.select().from(accessCredentials).where(and(eq(accessCredentials.roomId, roomId), eq(accessCredentials.branchId, branchId), eq(accessCredentials.status, "active"))).all();
  const results = await Promise.all(active.map(cred => revokeOne(cred, reason, performedBy)));
  return {
    revoked: results.filter(r => r === "revoked").length,
    queued: results.filter(r => r === "queued").length,
    failed: results.filter(r => r === "failed").length,
  };
}

export async function revokeCredential(credentialId: string, reason: string, performedBy: string | null): Promise<"revoked" | "queued" | "failed" | "not_found"> {
  const cred = db.select().from(accessCredentials).where(eq(accessCredentials.id, credentialId)).get();
  if (!cred) return "not_found";
  return revokeOne(cred, reason, performedBy);
}

export async function revokeCredentialsForReservation(reservationId: string, reason: string, performedBy: string | null): Promise<{ revoked: number; queued: number; failed: number }> {
  const active = db.select().from(accessCredentials).where(and(eq(accessCredentials.reservationId, reservationId), eq(accessCredentials.status, "active"))).all();
  const results = await Promise.all(active.map(cred => revokeOne(cred, reason, performedBy)));
  return {
    revoked: results.filter(r => r === "revoked").length,
    queued: results.filter(r => r === "queued").length,
    failed: results.filter(r => r === "failed").length,
  };
}

async function revokeOne(cred: typeof accessCredentials.$inferSelect, reason: string, performedBy: string | null): Promise<"revoked" | "queued" | "failed"> {
  const lock = getRoomLock(cred.roomId);
  if (!lock || cred.credentialType === "physical_key") {
    db.update(accessCredentials).set({ status: "revoked", revokedBy: performedBy, revokedAt: new Date(), revokeReason: reason }).where(eq(accessCredentials.id, cred.id)).run();
    logEvent(cred.id, reason === "emergency" ? "emergency_revoked" : "revoked", performedBy, `Revoked (${reason})`);
    return "revoked";
  }
  const config = getDoorLockConfig(cred.branchId) as any;
  const payload = { lockId: lock.ttlockLockId, credentialType: cred.credentialType as "card" | "pin", ttlockCardId: cred.ttlockCardId ?? undefined, ttlockKeyboardPwdId: cred.ttlockKeyboardPwdId ?? undefined };
  try {
    const adapter = new TTLockAdapter(cred.branchId);
    await adapter.revokeAccess(payload);
    db.update(accessCredentials).set({ status: "revoked", syncStatus: "synced", revokedBy: performedBy, revokedAt: new Date(), revokeReason: reason }).where(eq(accessCredentials.id, cred.id)).run();
    logEvent(cred.id, reason === "emergency" ? "emergency_revoked" : "revoked", performedBy, `Revoked (${reason})`);
    return "revoked";
  } catch (err) {
    const retryable = err instanceof LockProviderError ? err.retryable : true;
    if (retryable && (config?.queueWhenOffline ?? true)) {
      const bufferHours = config?.queueExpiryBufferHours ?? 1;
      const expiresAt = new Date(cred.validTo.getTime() + bufferHours * 60 * 60 * 1000);
      enqueue(cred.branchId, cred.credentialType === "card" ? "revoke_card" : "revoke_pin", cred.id, payload, expiresAt);
      db.update(accessCredentials).set({ status: "pending_sync", revokedBy: performedBy, revokedAt: new Date(), revokeReason: reason }).where(eq(accessCredentials.id, cred.id)).run();
      return "queued";
    }
    logEvent(cred.id, "api_failed", performedBy, err instanceof Error ? err.message : "Unknown error");
    return "failed";
  }
}
