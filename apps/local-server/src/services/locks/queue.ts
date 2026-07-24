// Offline queue (Blueprint 6.1 "lock_sync_queue", 6.10 Lock Command Queue
// Monitor). When the TTLock API is unreachable (the default state in this
// environment -- no live account exists here, see ttlockAdapter.ts), an
// activate/revoke command gets queued here instead of failing outright,
// and this module retries it every 2 minutes until it succeeds or the
// guest's stay ends (expiresAt), matching 6.10 exactly.
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { lockSyncQueue, accessCredentials, keyCardEvents } from "../../db/schema.js";
import { TTLockAdapter } from "./ttlockAdapter.js";
import { LockProviderError } from "./provider.js";

const RETRY_INTERVAL_MS = 2 * 60 * 1000; // Blueprint 6.10: "Retrying every 2 min..."

export function logEvent(credentialId: string, eventType: string, performedBy: string | null, details?: string) {
  db.insert(keyCardEvents).values({
    id: nanoid(), credentialId, eventType, performedBy, performedAt: new Date(), details: details ?? null, ipAddress: null,
  }).run();
}

export function enqueue(branchId: string, commandType: "activate_card" | "activate_pin" | "revoke_card" | "revoke_pin", credentialId: string, payload: unknown, expiresAt: Date) {
  db.insert(lockSyncQueue).values({
    id: nanoid(), branchId, commandType, credentialId, payload: JSON.stringify(payload),
    createdAt: new Date(), retryCount: 0, expiresAt, status: "pending",
  }).run();
  logEvent(credentialId, "queued_offline", null, `${commandType} queued for retry`);
}

async function processItem(item: typeof lockSyncQueue.$inferSelect) {
  const cred = db.select().from(accessCredentials).where(eq(accessCredentials.id, item.credentialId)).get();
  if (!cred) { db.update(lockSyncQueue).set({ status: "failed_permanent", errorLog: "Credential no longer exists" }).where(eq(lockSyncQueue.id, item.id)).run(); return; }

  if (item.expiresAt.getTime() < Date.now()) {
    db.update(lockSyncQueue).set({ status: "expired" }).where(eq(lockSyncQueue.id, item.id)).run();
    db.update(accessCredentials).set({ status: "failed" }).where(eq(accessCredentials.id, item.id)).run();
    logEvent(item.credentialId, "sync_failed", null, "Lock activation expired before internet returned -- see 6.10");
    return;
  }

  const payload = JSON.parse(item.payload);
  const adapter = new TTLockAdapter(item.branchId);
  try {
    if (item.commandType === "activate_card") {
      const result = await adapter.activateCardAccess({ ...payload, validFrom: new Date(payload.validFrom), validTo: new Date(payload.validTo) });
      db.update(accessCredentials).set({ status: "active", syncStatus: "synced", ttlockCardId: result.ttlockCardId }).where(eq(accessCredentials.id, item.credentialId)).run();
    } else if (item.commandType === "activate_pin") {
      const result = await adapter.generatePIN({ ...payload, validFrom: new Date(payload.validFrom), validTo: new Date(payload.validTo) });
      db.update(accessCredentials).set({ status: "active", syncStatus: "synced", ttlockKeyboardPwdId: result.ttlockKeyboardPwdId }).where(eq(accessCredentials.id, item.credentialId)).run();
    } else {
      await adapter.revokeAccess(payload);
      db.update(accessCredentials).set({ status: "revoked", syncStatus: "synced" }).where(eq(accessCredentials.id, item.credentialId)).run();
    }
    db.update(lockSyncQueue).set({ status: "success", lastRetryAt: new Date() }).where(eq(lockSyncQueue.id, item.id)).run();
    logEvent(item.credentialId, "sync_success", null, `${item.commandType} succeeded on retry`);
  } catch (err) {
    const message = err instanceof LockProviderError ? err.message : (err instanceof Error ? err.message : "Unknown error");
    db.update(lockSyncQueue).set({ retryCount: item.retryCount + 1, lastRetryAt: new Date(), errorLog: message }).where(eq(lockSyncQueue.id, item.id)).run();
  }
}

export async function processQueueOnce(): Promise<{ processed: number }> {
  const pending = db.select().from(lockSyncQueue).where(eq(lockSyncQueue.status, "pending")).all();
  for (const item of pending) await processItem(item);
  return { processed: pending.length };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
export function startQueueProcessor() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => { processQueueOnce().catch(() => {}); }, RETRY_INTERVAL_MS);
}
