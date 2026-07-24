// HK-01 Housekeeping Board. `housekeepingStatus` cycles dirty -> in_progress
// -> clean -> inspected; reaching clean/inspected while the room's booking
// `status` is still "cleaning" (set by FD-02 checkout) flips it back to
// "available" -- that's the loop that makes check-in's Blueprint FD-01 step
// 3 requirement ("must be Clean or Inspected") actually mean something.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { rooms, users, inspections } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

const HK_CYCLE = ["dirty", "in_progress", "clean", "inspected"] as const;
type HkStatus = (typeof HK_CYCLE)[number];
const READY_STATES: HkStatus[] = ["clean", "inspected"];

/** Sets a room's housekeeping status, releasing it to bookable "available"
 * if it was sitting in post-checkout "cleaning" and just became ready. */
function setHousekeepingStatus(roomId: string, newStatus: HkStatus) {
  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  if (!room) return null;
  const shouldReleaseToAvailable = room.status === "cleaning" && READY_STATES.includes(newStatus);
  db.update(rooms).set({
    housekeepingStatus: newStatus,
    ...(shouldReleaseToAvailable ? { status: "available" as const } : {}),
  }).where(eq(rooms.id, roomId)).run();
  return db.select().from(rooms).where(eq(rooms.id, roomId)).get();
}

router.get("/rooms", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const rows = db.select({
    id: rooms.id, number: rooms.number, type: rooms.type, floor: rooms.floor,
    status: rooms.status, housekeepingStatus: rooms.housekeepingStatus,
    priority: rooms.priority, dnd: rooms.dnd,
    assignedAttendantId: rooms.assignedAttendantId,
    attendantFirstName: users.firstName, attendantLastName: users.lastName,
  })
    .from(rooms)
    .leftJoin(users, eq(rooms.assignedAttendantId, users.id))
    .where(eq(rooms.branchId, branchId))
    .all();
  res.json(rows);
});

const statusSchema = z.object({ status: z.enum(HK_CYCLE) });

router.post("/rooms/:id/status", requireAuth, requirePermission("housekeeping:manage"), (req: AuthedRequest, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const room = db.select().from(rooms).where(eq(rooms.id, req.params.id)).get();
  if (!room || room.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const updated = setHousekeepingStatus(room.id, parsed.data.status);
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "room_hk_status_changed", module: "Housekeeping", recordId: room.id, details: `Room ${room.number} -> ${parsed.data.status}`, ipAddress: req.ip });
  res.json(updated);
});

const assignSchema = z.object({ attendantId: z.string().nullable() });

router.post("/rooms/:id/assign", requireAuth, requirePermission("housekeeping:manage"), (req: AuthedRequest, res) => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const room = db.select().from(rooms).where(eq(rooms.id, req.params.id)).get();
  if (!room || room.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  if (parsed.data.attendantId) {
    const attendant = db.select().from(users).where(eq(users.id, parsed.data.attendantId)).get();
    if (!attendant || attendant.branchId !== req.auth!.branchId) return res.status(400).json({ error: "ATTENDANT_NOT_FOUND" });
  }

  db.update(rooms).set({ assignedAttendantId: parsed.data.attendantId }).where(eq(rooms.id, room.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "room_attendant_assigned", module: "Housekeeping", recordId: room.id, details: `Room ${room.number} -> ${parsed.data.attendantId ?? "unassigned"}`, ipAddress: req.ip });
  const updated = db.select().from(rooms).where(eq(rooms.id, room.id)).get();
  res.json(updated);
});

// HK-04 Inspection Log.
router.get("/inspections", requireAuth, (req: AuthedRequest, res) => {
  const rows = db.select({
    id: inspections.id, roomId: inspections.roomId, result: inspections.result,
    notes: inspections.notes, createdAt: inspections.createdAt,
    roomNumber: rooms.number, inspectorFirstName: users.firstName, inspectorLastName: users.lastName,
  })
    .from(inspections)
    .leftJoin(rooms, eq(inspections.roomId, rooms.id))
    .leftJoin(users, eq(inspections.inspectorId, users.id))
    .where(eq(inspections.branchId, req.auth!.branchId))
    .orderBy(desc(inspections.createdAt))
    .all();
  res.json(rows);
});

const inspectionSchema = z.object({ roomId: z.string(), result: z.enum(["pass", "fail"]), notes: z.string().optional() });

// Pass -> room.housekeepingStatus "inspected" (releases to available if it
// was sitting in post-checkout "cleaning"). Fail -> back to "dirty" for
// re-cleaning, matching the Blueprint's "Fail and reassign to attendant."
router.post("/inspections", requireAuth, requirePermission("housekeeping:inspect"), (req: AuthedRequest, res) => {
  const parsed = inspectionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const room = db.select().from(rooms).where(eq(rooms.id, parsed.data.roomId)).get();
  if (!room || room.branchId !== req.auth!.branchId) return res.status(400).json({ error: "ROOM_NOT_FOUND" });

  const id = nanoid();
  db.insert(inspections).values({
    id, branchId: req.auth!.branchId, roomId: room.id, inspectorId: req.auth!.userId,
    result: parsed.data.result, notes: parsed.data.notes, createdAt: new Date(),
  }).run();

  setHousekeepingStatus(room.id, parsed.data.result === "pass" ? "inspected" : "dirty");

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "room_inspected", module: "Housekeeping", recordId: id, details: `Room ${room.number}: ${parsed.data.result}`, ipAddress: req.ip });
  res.status(201).json({ id });
});

export default router;
