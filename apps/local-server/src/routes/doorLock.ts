// Door Lock & Access Control (Blueprint Part 6): FD-09 Key Card Management,
// FD-12 Room Access Management, FD-13 Key Card Log, FD-14 PIN Management,
// ST-04 Settings, plus Check-In Step 7 and the 6.10 Lock Command Queue
// Monitor. See server/src/services/locks/ for the Lock Provider Interface,
// the real TTLock Adapter, and the offline queue -- this file is the HTTP
// layer over those.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  accessCredentials, keyCardEvents, lockSyncQueue, doorLockConfig, roomLockMappings,
  rooms, guests, reservations, users,
} from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { TTLockAdapter } from "../services/locks/ttlockAdapter.js";
import { processQueueOnce } from "../services/locks/queue.js";
import {
  issueCardCredential, issuePinCredential, issuePhysicalKeyCredential,
  revokeCredential, revokeCredentialsForRoom, getDoorLockConfig,
} from "../services/locks/access.js";
import { logAudit } from "../services/audit.js";

const router = Router();


// ─── ST-04 Settings ─────────────────────────────────────────────────────────
function serializeConfig(cfg: typeof doorLockConfig.$inferSelect | null) {
  if (!cfg) {
    return {
      provider: "ttlock", clientId: null, hasClientSecret: false, username: null, hasPassword: false,
      autoRevokeOnCheckout: true, queueWhenOffline: true, notifyMgtOnOfflineRevoke: true,
      maxCardsPerCheckIn: 3, queueExpiryBufferHours: 1,
    };
  }
  // Same discipline as PIN codes -- secrets go in, never come back out.
  return {
    provider: cfg.provider, clientId: cfg.clientId, hasClientSecret: !!cfg.clientSecret,
    username: cfg.username, hasPassword: !!cfg.password,
    autoRevokeOnCheckout: cfg.autoRevokeOnCheckout, queueWhenOffline: cfg.queueWhenOffline,
    notifyMgtOnOfflineRevoke: cfg.notifyMgtOnOfflineRevoke, maxCardsPerCheckIn: cfg.maxCardsPerCheckIn,
    queueExpiryBufferHours: cfg.queueExpiryBufferHours,
  };
}

router.get("/config", requireAuth, requirePermission("doorlock:configure"), (req: AuthedRequest, res) => {
  res.json(serializeConfig(getDoorLockConfig(req.auth!.branchId)));
});

const configSchema = z.object({
  provider: z.string().optional(),
  clientId: z.string().optional(), clientSecret: z.string().optional(),
  username: z.string().optional(), password: z.string().optional(),
  autoRevokeOnCheckout: z.boolean().optional(), queueWhenOffline: z.boolean().optional(),
  notifyMgtOnOfflineRevoke: z.boolean().optional(), maxCardsPerCheckIn: z.number().int().min(1).max(10).optional(),
  queueExpiryBufferHours: z.number().min(0).max(24).optional(),
});

router.post("/config", requireAuth, requirePermission("doorlock:configure"), (req: AuthedRequest, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const branchId = req.auth!.branchId;
  const existing = getDoorLockConfig(branchId);
  // Blank string means "leave unchanged" for secrets -- the frontend never
  // has the real value to send back (see serializeConfig), so an empty
  // field on save must not overwrite a real stored credential with "".
  const next = { ...parsed.data };
  if (next.clientSecret === "") delete next.clientSecret;
  if (next.password === "") delete next.password;
  if (existing) {
    db.update(doorLockConfig).set(next).where(eq(doorLockConfig.branchId, branchId)).run();
  } else {
    db.insert(doorLockConfig).values({ branchId, ...next }).run();
  }
  // Field names only, never values -- this endpoint's payload can include
  // clientSecret/password.
  logAudit({ userId: req.auth!.userId, branchId, action: "doorlock_config_updated", module: "IT & Settings", details: Object.keys(next).join(", "), ipAddress: req.ip });
  res.json(serializeConfig(getDoorLockConfig(branchId)));
});

router.post("/config/test-connection", requireAuth, requirePermission("doorlock:configure"), async (req: AuthedRequest, res) => {
  const cfg = getDoorLockConfig(req.auth!.branchId);
  if (!cfg?.clientId || !cfg?.clientSecret || !cfg?.username || !cfg?.password) {
    return res.status(400).json({ ok: false, error: "Enter Client ID, Client Secret, Username, and Password first." });
  }
  const adapter = new TTLockAdapter(req.auth!.branchId);
  const result = await adapter.testConnection();
  res.json(result);
});

router.get("/room-mapping", requireAuth, requirePermission("doorlock:configure"), (req: AuthedRequest, res) => {
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, req.auth!.branchId)).all();
  const mappings = db.select().from(roomLockMappings).all();
  const byRoom = new Map(mappings.map(m => [m.roomId, m]));
  res.json(branchRooms.map(r => ({ roomId: r.id, roomNumber: r.number, ttlockLockId: byRoom.get(r.id)?.ttlockLockId ?? null, lockName: byRoom.get(r.id)?.lockName ?? null })));
});

const mappingSchema = z.object({ roomId: z.string(), ttlockLockId: z.string().min(1), lockName: z.string().min(1) });
router.post("/room-mapping", requireAuth, requirePermission("doorlock:configure"), (req: AuthedRequest, res) => {
  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const room = db.select().from(rooms).where(and(eq(rooms.id, parsed.data.roomId), eq(rooms.branchId, req.auth!.branchId))).get();
  if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });
  const existing = db.select().from(roomLockMappings).where(eq(roomLockMappings.roomId, parsed.data.roomId)).get();
  if (existing) db.update(roomLockMappings).set(parsed.data).where(eq(roomLockMappings.roomId, parsed.data.roomId)).run();
  else db.insert(roomLockMappings).values(parsed.data).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "room_lock_mapping_updated", module: "IT & Settings", recordId: room.id, details: `Room ${room.number} -> ${parsed.data.lockName}`, ipAddress: req.ip });
  res.json({ ok: true });
});

// Blueprint 6.11 "Auto-map by Name": calls TTLock, fuzzy-matches lock names
// to room numbers, saves matches, reports what couldn't be matched.
router.post("/room-mapping/auto-map", requireAuth, requirePermission("doorlock:configure"), async (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const adapter = new TTLockAdapter(branchId);
  let locks;
  try { locks = await adapter.listLocks(); }
  catch (err) { return res.status(502).json({ error: "TTLOCK_UNREACHABLE", message: err instanceof Error ? err.message : "Unknown error" }); }

  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const matched: Array<{ roomNumber: string; lockName: string }> = [];
  const unmatched: string[] = [];
  for (const room of branchRooms) {
    const lock = locks.find(l => l.lockName.toLowerCase().includes(room.number.toLowerCase()));
    if (lock) {
      const existing = db.select().from(roomLockMappings).where(eq(roomLockMappings.roomId, room.id)).get();
      const row = { roomId: room.id, ttlockLockId: lock.lockId, lockName: lock.lockName };
      if (existing) db.update(roomLockMappings).set(row).where(eq(roomLockMappings.roomId, room.id)).run();
      else db.insert(roomLockMappings).values(row).run();
      matched.push({ roomNumber: room.number, lockName: lock.lockName });
    } else {
      unmatched.push(room.number);
    }
  }
  logAudit({ userId: req.auth!.userId, branchId, action: "room_lock_auto_mapped", module: "IT & Settings", details: `${matched.length} matched, ${unmatched.length} unmatched`, ipAddress: req.ip });
  res.json({ matched, unmatched });
});

// ─── Credentials (FD-09, FD-12, FD-14 all read this, filtered client-side) ──
router.get("/credentials", requireAuth, requirePermission("doorlock:use"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const statusFilter = typeof req.query.status === "string" ? req.query.status : "active";
  let rows = db.select({
    id: accessCredentials.id, roomId: accessCredentials.roomId, guestId: accessCredentials.guestId,
    reservationId: accessCredentials.reservationId,
    credentialType: accessCredentials.credentialType, credentialReference: accessCredentials.credentialReference,
    validFrom: accessCredentials.validFrom, validTo: accessCredentials.validTo, status: accessCredentials.status,
    isDuplicate: accessCredentials.isDuplicate, issuedBy: accessCredentials.issuedBy, issuedAt: accessCredentials.issuedAt,
  }).from(accessCredentials).where(eq(accessCredentials.branchId, branchId)).all();
  if (statusFilter !== "all") rows = rows.filter(r => r.status === statusFilter);

  const roomIds = new Set(rows.map(r => r.roomId));
  const guestIds = new Set(rows.map(r => r.guestId));
  const staffIds = new Set(rows.map(r => r.issuedBy));
  const roomMap = new Map(db.select().from(rooms).where(eq(rooms.branchId, branchId)).all().filter(r => roomIds.has(r.id)).map(r => [r.id, r.number]));
  const guestMap = new Map(db.select().from(guests).all().filter(g => guestIds.has(g.id)).map(g => [g.id, `${g.firstName} ${g.lastName}`]));
  const staffMap = new Map(db.select().from(users).all().filter(u => staffIds.has(u.id)).map(u => [u.id, `${u.firstName} ${u.lastName}`]));

  res.json(rows.map(r => ({
    ...r,
    roomNumber: roomMap.get(r.roomId) ?? "—",
    guestName: guestMap.get(r.guestId) ?? "—",
    issuedByName: staffMap.get(r.issuedBy) ?? "—",
  })));
});

// ─── FD-13 Key Card Log ─────────────────────────────────────────────────────
router.get("/events", requireAuth, requirePermission("doorlock:use"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const branchCredIds = new Set(db.select({ id: accessCredentials.id }).from(accessCredentials).where(eq(accessCredentials.branchId, branchId)).all().map(c => c.id));
  const events = db.select().from(keyCardEvents).orderBy(desc(keyCardEvents.performedAt)).all().filter(e => branchCredIds.has(e.credentialId)).slice(0, 500);

  const credIds = new Set(events.map(e => e.credentialId));
  const creds = db.select().from(accessCredentials).all().filter(c => credIds.has(c.id));
  const credMap = new Map(creds.map(c => [c.id, c]));
  const roomMap = new Map(db.select().from(rooms).where(eq(rooms.branchId, branchId)).all().map(r => [r.id, r.number]));
  const guestMap = new Map(db.select().from(guests).all().map(g => [g.id, `${g.firstName} ${g.lastName}`]));
  const staffIds = new Set(events.map(e => e.performedBy).filter((x): x is string => !!x));
  const staffMap = new Map(db.select().from(users).all().filter(u => staffIds.has(u.id)).map(u => [u.id, `${u.firstName} ${u.lastName}`]));

  res.json(events.map(e => {
    const cred = credMap.get(e.credentialId);
    return {
      id: e.id, eventType: e.eventType, performedAt: e.performedAt,
      room: cred ? roomMap.get(cred.roomId) ?? "—" : "—",
      guest: cred ? guestMap.get(cred.guestId) ?? "—" : "—",
      credentialType: cred?.credentialType ?? "—", credentialReference: cred?.credentialReference ?? "—",
      staff: e.performedBy ? staffMap.get(e.performedBy) ?? "—" : "System",
      details: e.details,
    };
  }));
});

// ─── 6.10 Lock Command Queue Monitor ────────────────────────────────────────
router.get("/queue", requireAuth, requirePermission("doorlock:use"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const items = db.select().from(lockSyncQueue).where(and(eq(lockSyncQueue.branchId, branchId), eq(lockSyncQueue.status, "pending"))).all();
  const roomMap = new Map(db.select().from(rooms).where(eq(rooms.branchId, branchId)).all().map(r => [r.id, r.number]));
  const credIds = new Set(items.map(i => i.credentialId));
  const creds = db.select().from(accessCredentials).all().filter(c => credIds.has(c.id));
  const credMap = new Map(creds.map(c => [c.id, c]));
  res.json(items.map(i => {
    const cred = credMap.get(i.credentialId);
    return {
      id: i.id, commandType: i.commandType, room: cred ? roomMap.get(cred.roomId) ?? "—" : "—",
      createdAt: i.createdAt, expiresAt: i.expiresAt, retryCount: i.retryCount, lastRetryAt: i.lastRetryAt, errorLog: i.errorLog,
    };
  }));
});

router.post("/queue/retry-now", requireAuth, requirePermission("doorlock:use"), async (_req: AuthedRequest, res) => {
  const result = await processQueueOnce();
  res.json(result);
});

// ─── Issue credentials (Check-In Step 7, FD-12 replacement/new PIN, FD-14 new PIN) ──
const issueSchema = z.object({
  reservationId: z.string(), credentialType: z.enum(["card", "pin"]),
  isDuplicate: z.boolean().optional(), parentCredentialId: z.string().optional(),
});
router.post("/issue", requireAuth, requirePermission("doorlock:use"), async (req: AuthedRequest, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const reservation = db.select().from(reservations).where(and(eq(reservations.id, parsed.data.reservationId), eq(reservations.branchId, req.auth!.branchId))).get();
  if (!reservation) return res.status(404).json({ error: "RESERVATION_NOT_FOUND" });
  if (!reservation.roomId) return res.status(400).json({ error: "NO_ROOM_ASSIGNED" });

  const cfg = getDoorLockConfig(req.auth!.branchId);
  if (parsed.data.credentialType === "card" && !parsed.data.isDuplicate) {
    const activeCards = db.select().from(accessCredentials).where(and(eq(accessCredentials.reservationId, reservation.id), eq(accessCredentials.credentialType, "card"), eq(accessCredentials.status, "active"))).all();
    const max = cfg?.maxCardsPerCheckIn ?? 3;
    if (activeCards.length >= max) return res.status(409).json({ error: "MAX_CARDS_REACHED", max });
  }

  const commonParams = {
    organizationId: req.auth!.orgId, branchId: req.auth!.branchId, reservationId: reservation.id,
    guestId: reservation.guestId, roomId: reservation.roomId, validFrom: reservation.checkInDate,
    validTo: reservation.checkOutDate, issuedBy: req.auth!.userId,
  };
  const result = parsed.data.credentialType === "card"
    ? await issueCardCredential({ ...commonParams, isDuplicate: parsed.data.isDuplicate, parentCredentialId: parsed.data.parentCredentialId })
    : await issuePinCredential(commonParams);
  res.status(201).json(result);
});

const physicalKeySchema = z.object({ reservationId: z.string(), keyReference: z.string().min(1), notes: z.string().optional() });
router.post("/physical-key", requireAuth, requirePermission("doorlock:use"), (req: AuthedRequest, res) => {
  const parsed = physicalKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const reservation = db.select().from(reservations).where(and(eq(reservations.id, parsed.data.reservationId), eq(reservations.branchId, req.auth!.branchId))).get();
  if (!reservation) return res.status(404).json({ error: "RESERVATION_NOT_FOUND" });
  if (!reservation.roomId) return res.status(400).json({ error: "NO_ROOM_ASSIGNED" });
  const result = issuePhysicalKeyCredential({
    organizationId: req.auth!.orgId, branchId: req.auth!.branchId, reservationId: reservation.id,
    guestId: reservation.guestId, roomId: reservation.roomId, validFrom: reservation.checkInDate,
    validTo: reservation.checkOutDate, issuedBy: req.auth!.userId, notes: `${parsed.data.keyReference}${parsed.data.notes ? " — " + parsed.data.notes : ""}`,
  });
  res.status(201).json(result);
});

// ─── Revoke ──────────────────────────────────────────────────────────────────
const revokeReasonSchema = z.object({ reason: z.enum(["checkout", "lost", "expired", "manual", "emergency"]) });
router.post("/revoke/:credentialId", requireAuth, requirePermission("doorlock:use"), async (req: AuthedRequest, res) => {
  const parsed = revokeReasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const cred = db.select().from(accessCredentials).where(and(eq(accessCredentials.id, req.params.credentialId), eq(accessCredentials.branchId, req.auth!.branchId))).get();
  if (!cred) return res.status(404).json({ error: "NOT_FOUND" });
  const result = await revokeCredential(cred.id, parsed.data.reason, req.auth!.userId);
  if (result === "not_found") return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ result });
});

// Blueprint 6.8 Emergency Revoke -- entry points: FD-12 "Revoke All", FD-06
// In-House Guest List row action, FD-13 row action. All funnel here.
const emergencyRevokeSchema = z.object({ reason: z.string().min(1) });
router.post("/revoke-room/:roomId", requireAuth, requirePermission("doorlock:use"), async (req: AuthedRequest, res) => {
  const parsed = emergencyRevokeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const room = db.select().from(rooms).where(and(eq(rooms.id, req.params.roomId), eq(rooms.branchId, req.auth!.branchId))).get();
  if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });
  const result = await revokeCredentialsForRoom(req.auth!.branchId, room.id, "emergency", req.auth!.userId);
  res.json(result);
});

export default router;
