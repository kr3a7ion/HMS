// HK-05 Lost & Found.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { lostFoundItems, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const rows = db.select({
    id: lostFoundItems.id, description: lostFoundItems.description, locationFound: lostFoundItems.locationFound,
    claimedBy: lostFoundItems.claimedBy, status: lostFoundItems.status, disposedReason: lostFoundItems.disposedReason,
    createdAt: lostFoundItems.createdAt, loggedByFirstName: users.firstName, loggedByLastName: users.lastName,
  })
    .from(lostFoundItems)
    .leftJoin(users, eq(lostFoundItems.loggedBy, users.id))
    .where(eq(lostFoundItems.branchId, req.auth!.branchId))
    .orderBy(desc(lostFoundItems.createdAt))
    .all();
  res.json(rows);
});

const createSchema = z.object({ description: z.string().min(1), locationFound: z.string().optional() });

router.post("/", requireAuth, requirePermission("frontoffice:lostfound"), (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const id = nanoid();
  db.insert(lostFoundItems).values({
    id, branchId: req.auth!.branchId, description: parsed.data.description, locationFound: parsed.data.locationFound,
    loggedBy: req.auth!.userId, status: "held", createdAt: new Date(),
  }).run();

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "lost_found_logged", module: "Housekeeping", recordId: id, details: parsed.data.description, ipAddress: req.ip });
  res.status(201).json({ id });
});

function loadItemOrNull(id: string, branchId: string) {
  const item = db.select().from(lostFoundItems).where(eq(lostFoundItems.id, id)).get();
  if (!item || item.branchId !== branchId) return null;
  return item;
}

const claimSchema = z.object({ claimedBy: z.string().min(1) });

router.post("/:id/claim", requireAuth, requirePermission("frontoffice:lostfound"), (req: AuthedRequest, res) => {
  const item = loadItemOrNull(req.params.id, req.auth!.branchId);
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });
  if (item.status !== "held") return res.status(409).json({ error: "INVALID_STATUS", status: item.status });

  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  db.update(lostFoundItems).set({ status: "claimed", claimedBy: parsed.data.claimedBy }).where(eq(lostFoundItems.id, item.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "lost_found_claimed", module: "Housekeeping", recordId: item.id, details: `Claimed by ${parsed.data.claimedBy}`, ipAddress: req.ip });
  res.json({ ok: true });
});

const disposeSchema = z.object({ reason: z.string().min(1) });

router.post("/:id/dispose", requireAuth, requirePermission("frontoffice:lostfound"), (req: AuthedRequest, res) => {
  const item = loadItemOrNull(req.params.id, req.auth!.branchId);
  if (!item) return res.status(404).json({ error: "NOT_FOUND" });
  if (item.status !== "held") return res.status(409).json({ error: "INVALID_STATUS", status: item.status });

  const parsed = disposeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  db.update(lostFoundItems).set({ status: "disposed", disposedReason: parsed.data.reason }).where(eq(lostFoundItems.id, item.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "lost_found_disposed", module: "Housekeeping", recordId: item.id, details: parsed.data.reason, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
