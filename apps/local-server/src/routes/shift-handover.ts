// CO-04 Shift Handover.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { shiftHandovers, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();


router.get("/", requireAuth, requirePermission("handover:use"), (req: AuthedRequest, res) => {
  const rows = db.select({
    id: shiftHandovers.id, shiftName: shiftHandovers.shiftName, createdAt: shiftHandovers.createdAt,
    acknowledgedAt: shiftHandovers.acknowledgedAt, outgoingStaffId: shiftHandovers.outgoingStaffId,
    outgoingFirstName: users.firstName, outgoingLastName: users.lastName,
  })
    .from(shiftHandovers)
    .leftJoin(users, eq(shiftHandovers.outgoingStaffId, users.id))
    .where(eq(shiftHandovers.branchId, req.auth!.branchId))
    .orderBy(desc(shiftHandovers.createdAt))
    .all();
  res.json(rows);
});

const createSchema = z.object({
  shiftName: z.string().min(1),
  outstandingTasks: z.string().optional(),
  vipGuests: z.string().optional(),
  maintenanceIssues: z.string().optional(),
  guestComplaints: z.string().optional(),
  pendingPayments: z.string().optional(),
  generalNotes: z.string().optional(),
});

router.post("/", requireAuth, requirePermission("handover:use"), (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = nanoid();
  db.insert(shiftHandovers).values({
    id, branchId: req.auth!.branchId, shiftName: parsed.data.shiftName, outgoingStaffId: req.auth!.userId,
    outstandingTasks: parsed.data.outstandingTasks, vipGuests: parsed.data.vipGuests,
    maintenanceIssues: parsed.data.maintenanceIssues, guestComplaints: parsed.data.guestComplaints,
    pendingPayments: parsed.data.pendingPayments, generalNotes: parsed.data.generalNotes,
    createdAt: new Date(),
  }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "shift_handover_created", module: "Communications", recordId: id, details: parsed.data.shiftName, ipAddress: req.ip });
  res.status(201).json({ id });
});

router.get("/:id", requireAuth, requirePermission("handover:use"), (req: AuthedRequest, res) => {
  const h = db.select().from(shiftHandovers).where(eq(shiftHandovers.id, req.params.id)).get();
  if (!h || h.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  const outgoing = db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, h.outgoingStaffId)).get();
  const acknowledgedByUser = h.acknowledgedBy ? db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, h.acknowledgedBy)).get() : null;
  res.json({ ...h, outgoing, acknowledgedByUser });
});

router.post("/:id/acknowledge", requireAuth, requirePermission("handover:use"), (req: AuthedRequest, res) => {
  const h = db.select().from(shiftHandovers).where(eq(shiftHandovers.id, req.params.id)).get();
  if (!h || h.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  if (h.acknowledgedAt) return res.status(409).json({ error: "ALREADY_ACKNOWLEDGED" });

  db.update(shiftHandovers).set({ acknowledgedBy: req.auth!.userId, acknowledgedAt: new Date() }).where(eq(shiftHandovers.id, h.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "shift_handover_acknowledged", module: "Communications", recordId: h.id, details: h.shiftName, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
