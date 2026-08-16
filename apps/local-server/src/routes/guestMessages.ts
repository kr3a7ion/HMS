// CO-02 Guest Messaging. Real, but honestly scoped: this is a staff-facing
// guest-communication LOG and coordination tool, not an outbound WhatsApp/
// SMS sending gateway -- there's no real third-party messaging account in
// this codebase (same class of gap as TTLock/Docker, needs credentials this
// environment doesn't have), and no guest-facing portal exists anywhere in
// this system for an "internal portal" message to actually be delivered to.
// Staff record what was really said to (or heard from) a guest -- over a
// phone call, their own WhatsApp, in person -- so the whole team has one
// shared, threaded record instead of none at all. `channel` is metadata
// about how that real-world conversation happened, not a delivery promise.
// See db/schema.ts's guestMessageThreads/guestMessages comment for the full
// reasoning. One thread per guest (not per-reservation), so a repeat
// guest's history carries across stays.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { guestMessageThreads, guestMessages, guests, reservations, rooms, users, chatChannels, chatMessages } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import { transaction } from "../db/tx.js";
import { getOrCreateDmChannel } from "./chat.js";

const router = Router();

function currentRoomForGuest(guestId: string, branchId: string) {
  const now = new Date();
  const active = db.select({ roomId: reservations.roomId }).from(reservations)
    .where(and(eq(reservations.guestId, guestId), eq(reservations.branchId, branchId), eq(reservations.status, "checked_in")))
    .get();
  if (!active?.roomId) return null;
  const room = db.select({ number: rooms.number }).from(rooms).where(eq(rooms.id, active.roomId)).get();
  return room?.number ?? null;
}

// GET /guest-messages/in-house -- the guest picker for starting a new thread.
router.get("/in-house", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const rows = db.select({
    guestId: guests.id, firstName: guests.firstName, lastName: guests.lastName,
    roomNumber: rooms.number, checkOutDate: reservations.checkOutDate,
  })
    .from(reservations)
    .innerJoin(guests, eq(reservations.guestId, guests.id))
    .leftJoin(rooms, eq(reservations.roomId, rooms.id))
    .where(and(eq(reservations.branchId, req.auth!.branchId), eq(reservations.status, "checked_in")))
    .all();
  res.json(rows);
});

// GET /guest-messages/threads -- every thread this branch has ever had,
// newest activity first, with a real last-message preview and whether the
// guest is currently in-house (vs. a past-stay history thread).
router.get("/threads", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const threadRows = db.select({
    id: guestMessageThreads.id, guestId: guestMessageThreads.guestId, status: guestMessageThreads.status,
    forwardedToDepartment: guestMessageThreads.forwardedToDepartment, escalatedAt: guestMessageThreads.escalatedAt,
    resolvedAt: guestMessageThreads.resolvedAt, lastMessageAt: guestMessageThreads.lastMessageAt,
    guestFirstName: guests.firstName, guestLastName: guests.lastName,
  })
    .from(guestMessageThreads)
    .innerJoin(guests, eq(guestMessageThreads.guestId, guests.id))
    .where(eq(guestMessageThreads.branchId, req.auth!.branchId))
    .orderBy(desc(guestMessageThreads.lastMessageAt))
    .all();

  const result = threadRows.map(t => {
    const last = db.select({ body: guestMessages.body, channel: guestMessages.channel })
      .from(guestMessages).where(eq(guestMessages.threadId, t.id)).orderBy(desc(guestMessages.createdAt)).limit(1).get();
    const roomNumber = currentRoomForGuest(t.guestId, req.auth!.branchId);
    return { ...t, lastMessagePreview: last?.body ?? null, lastMessageChannel: last?.channel ?? null, roomNumber, inHouse: roomNumber != null };
  });
  res.json(result);
});

function loadOrCreateThread(guestId: string, branchId: string) {
  const existing = db.select().from(guestMessageThreads).where(and(eq(guestMessageThreads.guestId, guestId), eq(guestMessageThreads.branchId, branchId))).get();
  if (existing) return existing;
  const id = nanoid();
  const now = new Date();
  db.insert(guestMessageThreads).values({ id, branchId, guestId, status: "open", lastMessageAt: now, createdAt: now }).run();
  return db.select().from(guestMessageThreads).where(eq(guestMessageThreads.id, id)).get()!;
}

// GET /guest-messages/threads/:guestId -- thread detail + full history.
// Lazily creates an empty thread if this guest has never been messaged
// before, so the frontend can always GET-then-render without a separate
// "does a thread exist" check.
router.get("/threads/:guestId", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const guest = db.select().from(guests).where(and(eq(guests.id, req.params.guestId), eq(guests.branchId, req.auth!.branchId))).get();
  if (!guest) return res.status(404).json({ error: "GUEST_NOT_FOUND" });

  const thread = loadOrCreateThread(guest.id, req.auth!.branchId);
  const messages = db.select({
    id: guestMessages.id, channel: guestMessages.channel, direction: guestMessages.direction,
    body: guestMessages.body, createdAt: guestMessages.createdAt,
    loggedByFirstName: users.firstName, loggedByLastName: users.lastName,
  })
    .from(guestMessages).leftJoin(users, eq(guestMessages.loggedBy, users.id))
    .where(eq(guestMessages.threadId, thread.id)).orderBy(guestMessages.createdAt).all();

  res.json({ ...thread, guest, roomNumber: currentRoomForGuest(guest.id, req.auth!.branchId), messages });
});

const logMessageSchema = z.object({
  channel: z.enum(["whatsapp", "sms", "internal"]),
  direction: z.enum(["to_guest", "from_guest"]),
  body: z.string().min(1),
});

router.post("/threads/:guestId/messages", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const guest = db.select().from(guests).where(and(eq(guests.id, req.params.guestId), eq(guests.branchId, req.auth!.branchId))).get();
  if (!guest) return res.status(404).json({ error: "GUEST_NOT_FOUND" });
  const parsed = logMessageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = nanoid();
  const now = new Date();
  // Message + thread timestamp together: a thread whose lastMessageAt does
  // not reflect its newest message sorts wrong in the inbox forever.
  transaction(() => {
    const thread = loadOrCreateThread(guest.id, req.auth!.branchId);
    db.insert(guestMessages).values({
      id, threadId: thread.id, channel: parsed.data.channel, direction: parsed.data.direction,
      body: parsed.data.body, loggedBy: req.auth!.userId, createdAt: now,
    }).run();
    db.update(guestMessageThreads).set({ lastMessageAt: now }).where(eq(guestMessageThreads.id, thread.id)).run();
  });

  res.status(201).json({ id });
});

const forwardSchema = z.object({ department: z.enum(["Front Desk", "Housekeeping", "Maintenance", "Restaurant"]) });

// Posts a real message into the department's real Internal Chat channel
// (auto-created if this branch doesn't have one yet) -- so "forward to
// department" is something the receiving team actually sees where they
// already look, not a status flag with no real consequence.
router.post("/threads/:guestId/forward", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const guest = db.select().from(guests).where(and(eq(guests.id, req.params.guestId), eq(guests.branchId, req.auth!.branchId))).get();
  if (!guest) return res.status(404).json({ error: "GUEST_NOT_FOUND" });
  const parsed = forwardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const branchId = req.auth!.branchId;
  // Marking the thread forwarded and actually posting into the department
  // channel must not come apart -- a thread that says "forwarded" with no
  // message in the channel is a request nobody will ever see.
  transaction(() => {
    const thread = loadOrCreateThread(guest.id, req.auth!.branchId);
    let deptChannel = db.select().from(chatChannels).where(and(eq(chatChannels.branchId, branchId), eq(chatChannels.type, "department"), eq(chatChannels.name, parsed.data.department))).get();
    if (!deptChannel) {
      const channelId = nanoid();
      db.insert(chatChannels).values({ id: channelId, branchId, type: "department", name: parsed.data.department, createdAt: new Date() }).run();
      deptChannel = db.select().from(chatChannels).where(eq(chatChannels.id, channelId)).get()!;
    }

    const roomNumber = currentRoomForGuest(guest.id, branchId);
    db.insert(chatMessages).values({
      id: nanoid(), channelId: deptChannel.id, senderId: req.auth!.userId,
      body: `Guest message forwarded — ${guest.firstName} ${guest.lastName}${roomNumber ? ` (Room ${roomNumber})` : ""}: see Guest Messaging for the full thread.`,
      emergency: false, createdAt: new Date(),
    }).run();

    db.update(guestMessageThreads).set({ status: "forwarded", forwardedToDepartment: parsed.data.department }).where(eq(guestMessageThreads.id, thread.id)).run();
    logAudit({ userId: req.auth!.userId, branchId, action: "guest_thread_forwarded", module: "Communications", recordId: thread.id, details: `${guest.firstName} ${guest.lastName} -> ${parsed.data.department}`, ipAddress: req.ip });
  });
  res.json({ ok: true });
});

// Escalates into a real DM with every Manager/ORG at this branch, reusing
// the same Internal Chat a manager already monitors.
router.post("/threads/:guestId/escalate", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const guest = db.select().from(guests).where(and(eq(guests.id, req.params.guestId), eq(guests.branchId, req.auth!.branchId))).get();
  if (!guest) return res.status(404).json({ error: "GUEST_NOT_FOUND" });

  const branchId = req.auth!.branchId;
  const managerUsers = db.select().from(users).where(eq(users.branchId, branchId)).all().filter(u => (u.role === "MGT" || u.role === "ORG") && u.status === "active" && u.id !== req.auth!.userId);

  // Either every manager is notified and the thread is marked escalated, or
  // none of it happened. Notifying three of five managers and recording
  // "escalated" is the worst outcome: it looks handled and isn't.
  transaction(() => {
    const thread = loadOrCreateThread(guest.id, req.auth!.branchId);
    const roomNumber = currentRoomForGuest(guest.id, branchId);
    const summary = `🔺 Guest thread escalated — ${guest.firstName} ${guest.lastName}${roomNumber ? ` (Room ${roomNumber})` : ""}: see Guest Messaging for the full thread.`;
    for (const mgr of managerUsers) {
      const { id: channelId } = getOrCreateDmChannel(branchId, req.auth!.userId, mgr.id);
      db.insert(chatMessages).values({ id: nanoid(), channelId, senderId: req.auth!.userId, body: summary, emergency: false, createdAt: new Date() }).run();
    }

    db.update(guestMessageThreads).set({ status: "escalated", escalatedAt: new Date() }).where(eq(guestMessageThreads.id, thread.id)).run();
    logAudit({ userId: req.auth!.userId, branchId, action: "guest_thread_escalated", module: "Communications", recordId: thread.id, details: `${guest.firstName} ${guest.lastName} -> ${managerUsers.length} manager(s)`, ipAddress: req.ip });
  });
  res.json({ ok: true, notifiedManagers: managerUsers.length });
});

router.post("/threads/:guestId/resolve", requireAuth, requirePermission("guests:message"), (req: AuthedRequest, res) => {
  const guest = db.select().from(guests).where(and(eq(guests.id, req.params.guestId), eq(guests.branchId, req.auth!.branchId))).get();
  if (!guest) return res.status(404).json({ error: "GUEST_NOT_FOUND" });
  const thread = loadOrCreateThread(guest.id, req.auth!.branchId);

  db.update(guestMessageThreads).set({ status: "resolved", resolvedAt: new Date(), resolvedBy: req.auth!.userId }).where(eq(guestMessageThreads.id, thread.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "guest_thread_resolved", module: "Communications", recordId: thread.id, details: `${guest.firstName} ${guest.lastName}`, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
