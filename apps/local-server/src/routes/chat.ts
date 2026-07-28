// CO-01 Internal Chat. Polling-based, not WebSocket/SSE push -- real-time
// delivery is a genuine architectural addition (a persistent connection
// layer per branch) that the Auth doc doesn't specify and this pass
// doesn't add; the frontend polls on a short interval instead. Fine for a
// small-team LAN chat, noted in ROADMAP.md as a real simplification, not
// hidden. No read receipts, presence indicators, image attachments, or
// @mention parsing in this pass either.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, asc, desc, eq, or } from "drizzle-orm";
import { db } from "../db/client.js";
import { chatChannels, chatMessages, users } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

// GET /chat/channels — every department channel for the branch, plus any
// DM channel involving the current user, each with a last-message preview.
router.get("/channels", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const userId = req.auth!.userId;

  const departmentChannels = db.select().from(chatChannels)
    .where(and(eq(chatChannels.branchId, branchId), eq(chatChannels.type, "department")))
    .all();
  const dmChannels = db.select().from(chatChannels)
    .where(and(eq(chatChannels.branchId, branchId), eq(chatChannels.type, "dm"), or(eq(chatChannels.userAId, userId), eq(chatChannels.userBId, userId))))
    .all();

  const withPreview = [...departmentChannels, ...dmChannels].map(ch => {
    const last = db.select().from(chatMessages).where(eq(chatMessages.channelId, ch.id)).orderBy(desc(chatMessages.createdAt)).limit(1).get();
    let otherUser: { id: string; firstName: string; lastName: string } | null = null;
    if (ch.type === "dm") {
      const otherId = ch.userAId === userId ? ch.userBId : ch.userAId;
      const u = otherId ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, otherId)).get() : null;
      otherUser = u ?? null;
    }
    return { ...ch, otherUser, lastMessage: last?.body ?? null, lastMessageAt: last?.createdAt ?? null };
  });

  res.json(withPreview);
});

// Shared with routes/guestMessages.ts -- escalating a guest thread posts a
// real message into a real DM with the manager, reusing the same channel a
// manager already monitors via Internal Chat, rather than a status flag
// nobody would ever see.
export function getOrCreateDmChannel(branchId: string, userAId: string, userBId: string): { id: string; created: boolean } {
  const existing = db.select().from(chatChannels).where(and(
    eq(chatChannels.branchId, branchId), eq(chatChannels.type, "dm"),
    or(and(eq(chatChannels.userAId, userAId), eq(chatChannels.userBId, userBId)), and(eq(chatChannels.userAId, userBId), eq(chatChannels.userBId, userAId))),
  )).get();
  if (existing) return { id: existing.id, created: false };
  const id = nanoid();
  db.insert(chatChannels).values({ id, branchId, type: "dm", userAId, userBId, createdAt: new Date() }).run();
  return { id, created: true };
}

const dmSchema = z.object({ otherUserId: z.string() });

router.post("/dm", requireAuth, (req: AuthedRequest, res) => {
  const parsed = dmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const { otherUserId } = parsed.data;
  const userId = req.auth!.userId;
  if (otherUserId === userId) return res.status(400).json({ error: "CANNOT_DM_SELF" });

  const other = db.select().from(users).where(eq(users.id, otherUserId)).get();
  if (!other || other.branchId !== req.auth!.branchId) return res.status(400).json({ error: "USER_NOT_FOUND" });

  const { id, created } = getOrCreateDmChannel(req.auth!.branchId, userId, otherUserId);
  res.status(created ? 201 : 200).json({ id });
});

function canAccessChannel(channelId: string, branchId: string, userId: string) {
  const ch = db.select().from(chatChannels).where(eq(chatChannels.id, channelId)).get();
  if (!ch || ch.branchId !== branchId) return null;
  if (ch.type === "dm" && ch.userAId !== userId && ch.userBId !== userId) return null;
  return ch;
}

router.get("/channels/:id/messages", requireAuth, (req: AuthedRequest, res) => {
  const ch = canAccessChannel(req.params.id, req.auth!.branchId, req.auth!.userId);
  if (!ch) return res.status(404).json({ error: "NOT_FOUND" });

  const messages = db.select({
    id: chatMessages.id, body: chatMessages.body, emergency: chatMessages.emergency, createdAt: chatMessages.createdAt,
    senderId: chatMessages.senderId, senderFirstName: users.firstName, senderLastName: users.lastName,
  })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.senderId, users.id))
    .where(eq(chatMessages.channelId, ch.id))
    .orderBy(asc(chatMessages.createdAt))
    .all();
  res.json(messages);
});

const messageSchema = z.object({ body: z.string().min(1), emergency: z.boolean().optional() });

router.post("/channels/:id/messages", requireAuth, (req: AuthedRequest, res) => {
  const ch = canAccessChannel(req.params.id, req.auth!.branchId, req.auth!.userId);
  if (!ch) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const id = nanoid();
  db.insert(chatMessages).values({
    id, channelId: ch.id, senderId: req.auth!.userId, body: parsed.data.body,
    emergency: parsed.data.emergency ?? false, createdAt: new Date(),
  }).run();
  // Routine messages aren't audit-logged -- they're already a persistent
  // record in chat_messages itself, and logging every send would flood
  // IT-05's Audit Log with conversational noise. An emergency broadcast is
  // different: a real incident worth a manager finding in the audit trail.
  if (parsed.data.emergency) {
    logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "emergency_broadcast", module: "Communications", recordId: id, details: parsed.data.body, ipAddress: req.ip });
  }
  res.status(201).json({ id });
});

export default router;
