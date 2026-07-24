// CO-03 Announcements.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { announcements, announcementReads, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const includeArchived = req.query.archived === "true";
  const rows = db.select({
    id: announcements.id, title: announcements.title, body: announcements.body,
    targetAudience: announcements.targetAudience, expiresAt: announcements.expiresAt, archived: announcements.archived,
    createdAt: announcements.createdAt, createdByFirstName: users.firstName, createdByLastName: users.lastName,
  })
    .from(announcements)
    .leftJoin(users, eq(announcements.createdBy, users.id))
    .where(eq(announcements.branchId, req.auth!.branchId))
    .orderBy(desc(announcements.createdAt))
    .all()
    .filter(a => includeArchived || !a.archived);

  const readerCount = db.select({ userId: announcementReads.userId, announcementId: announcementReads.announcementId }).from(announcementReads).all();
  const staffCount = db.select().from(users).where(eq(users.branchId, req.auth!.branchId)).all().length;
  const myReads = new Set(readerCount.filter(r => r.userId === req.auth!.userId).map(r => r.announcementId));

  res.json(rows.map(a => ({
    ...a,
    readCount: readerCount.filter(r => r.announcementId === a.id).length,
    totalStaff: staffCount,
    readByMe: myReads.has(a.id),
  })));
});

const createSchema = z.object({
  title: z.string().min(1), body: z.string().min(1),
  targetAudience: z.string().default("all"),
  expiresAt: z.string().optional(),
});

router.post("/", requireAuth, requirePermission("announcements:manage"), (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = nanoid();
  db.insert(announcements).values({
    id, branchId: req.auth!.branchId, title: parsed.data.title, body: parsed.data.body,
    targetAudience: parsed.data.targetAudience, expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
    archived: false, createdBy: req.auth!.userId, createdAt: new Date(),
  }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "announcement_created", module: "Communications", recordId: id, details: parsed.data.title, ipAddress: req.ip });
  res.status(201).json({ id });
});

router.post("/:id/read", requireAuth, (req: AuthedRequest, res) => {
  const ann = db.select().from(announcements).where(eq(announcements.id, req.params.id)).get();
  if (!ann || ann.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const existing = db.select().from(announcementReads).where(and(eq(announcementReads.announcementId, ann.id), eq(announcementReads.userId, req.auth!.userId))).get();
  if (!existing) {
    db.insert(announcementReads).values({ id: nanoid(), announcementId: ann.id, userId: req.auth!.userId, readAt: new Date() }).run();
  }
  res.json({ ok: true });
});

router.post("/:id/archive", requireAuth, requirePermission("announcements:manage"), (req: AuthedRequest, res) => {
  const ann = db.select().from(announcements).where(eq(announcements.id, req.params.id)).get();
  if (!ann || ann.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(announcements).set({ archived: true }).where(eq(announcements.id, ann.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "announcement_archived", module: "Communications", recordId: ann.id, details: ann.title, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
