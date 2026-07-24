// MX-01 Work Order List, MX-02 Work Order Detail, MX-03 New Work Order.
// Asset Register (MX-04/05), Preventive Schedule (MX-06), and Vendor
// Contacts (MX-07) are a separate pass -- see ROADMAP.md.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { workOrders, workOrderEvents, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";

const router = Router();

const STATUSES = ["reported", "assigned", "in_progress", "completed"] as const;
type Status = (typeof STATUSES)[number];

function logEvent(workOrderId: string, eventType: string, note: string | undefined, performedBy: string) {
  db.insert(workOrderEvents).values({ id: nanoid(), workOrderId, eventType, note, performedBy, createdAt: new Date() }).run();
}

router.get("/work-orders", requireAuth, (req: AuthedRequest, res) => {
  const rows = db.select({
    id: workOrders.id, location: workOrders.location, category: workOrders.category,
    priority: workOrders.priority, status: workOrders.status, description: workOrders.description,
    assignedTechnicianId: workOrders.assignedTechnicianId, createdAt: workOrders.createdAt, closedAt: workOrders.closedAt,
    technicianFirstName: users.firstName, technicianLastName: users.lastName,
  })
    .from(workOrders)
    .leftJoin(users, eq(workOrders.assignedTechnicianId, users.id))
    .where(eq(workOrders.branchId, req.auth!.branchId))
    .orderBy(desc(workOrders.createdAt))
    .all();
  res.json(rows);
});

const createSchema = z.object({
  location: z.string().min(1),
  category: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]),
  description: z.string().min(1),
});

// MX-03. "All roles with reporting access" per the Blueprint -- any
// authenticated branch user can report an issue, not just Maintenance.
router.post("/work-orders", requireAuth, (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = nanoid();
  const now = new Date();
  db.insert(workOrders).values({
    id, branchId: req.auth!.branchId, location: parsed.data.location, category: parsed.data.category,
    priority: parsed.data.priority, status: "reported", description: parsed.data.description,
    createdBy: req.auth!.userId, createdAt: now,
  }).run();
  logEvent(id, "created", parsed.data.description, req.auth!.userId);

  res.status(201).json({ id });
});

function loadWorkOrderOrNull(id: string, branchId: string) {
  const wo = db.select().from(workOrders).where(eq(workOrders.id, id)).get();
  if (!wo || wo.branchId !== branchId) return null;
  return wo;
}

router.get("/work-orders/:id", requireAuth, (req: AuthedRequest, res) => {
  const wo = loadWorkOrderOrNull(req.params.id, req.auth!.branchId);
  if (!wo) return res.status(404).json({ error: "NOT_FOUND" });

  const technician = wo.assignedTechnicianId
    ? db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, email: users.email })
        .from(users).where(eq(users.id, wo.assignedTechnicianId)).get()
    : null;
  const events = db.select({
    id: workOrderEvents.id, eventType: workOrderEvents.eventType, note: workOrderEvents.note, createdAt: workOrderEvents.createdAt,
    performedByFirstName: users.firstName, performedByLastName: users.lastName,
  })
    .from(workOrderEvents)
    .leftJoin(users, eq(workOrderEvents.performedBy, users.id))
    .where(eq(workOrderEvents.workOrderId, wo.id))
    .orderBy(workOrderEvents.createdAt)
    .all();

  res.json({ ...wo, technician, events });
});

const statusSchema = z.object({ status: z.enum(STATUSES) });

router.post("/work-orders/:id/status", requireAuth, requirePermission("maintenance:manage"), (req: AuthedRequest, res) => {
  const wo = loadWorkOrderOrNull(req.params.id, req.auth!.branchId);
  if (!wo) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const newStatus: Status = parsed.data.status;
  db.update(workOrders).set({
    status: newStatus,
    ...(newStatus === "completed" ? { closedAt: new Date() } : {}),
  }).where(eq(workOrders.id, wo.id)).run();
  logEvent(wo.id, "status_changed", `Status → ${newStatus}`, req.auth!.userId);

  res.json(db.select().from(workOrders).where(eq(workOrders.id, wo.id)).get());
});

const assignSchema = z.object({ technicianId: z.string() });

router.post("/work-orders/:id/assign", requireAuth, requirePermission("maintenance:manage"), (req: AuthedRequest, res) => {
  const wo = loadWorkOrderOrNull(req.params.id, req.auth!.branchId);
  if (!wo) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const technician = db.select().from(users).where(eq(users.id, parsed.data.technicianId)).get();
  if (!technician || technician.branchId !== req.auth!.branchId) return res.status(400).json({ error: "TECHNICIAN_NOT_FOUND" });

  const nextStatus = wo.status === "reported" ? "assigned" : wo.status;
  db.update(workOrders).set({ assignedTechnicianId: technician.id, status: nextStatus }).where(eq(workOrders.id, wo.id)).run();
  logEvent(wo.id, "assigned", `Assigned to ${technician.firstName} ${technician.lastName}`, req.auth!.userId);

  res.json(db.select().from(workOrders).where(eq(workOrders.id, wo.id)).get());
});

const noteSchema = z.object({ note: z.string().min(1) });

router.post("/work-orders/:id/notes", requireAuth, requirePermission("maintenance:manage"), (req: AuthedRequest, res) => {
  const wo = loadWorkOrderOrNull(req.params.id, req.auth!.branchId);
  if (!wo) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  logEvent(wo.id, "note", parsed.data.note, req.auth!.userId);
  res.status(201).json({ ok: true });
});

export default router;
