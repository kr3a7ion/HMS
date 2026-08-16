// Backend Blueprint B8 — room types.
import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { roomTypes, rooms, reservations } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { transaction } from "../db/tx.js";
import { logAudit } from "../services/audit.js";

const router = Router();

router.get("/", requireAuth, requirePermission("rates:read", "rates:manage"), (req: AuthedRequest, res) => {
  const types = db.select().from(roomTypes)
    .where(eq(roomTypes.branchId, req.auth!.branchId)).all()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));

  res.json(types.map(t => ({
    ...t,
    amenities: JSON.parse(t.amenitiesJson) as string[],
    roomCount: db.select().from(rooms).where(eq(rooms.roomTypeId, t.id)).all().length,
  })));
});

const createSchema = z.object({
  code: z.string().min(1).max(24).regex(/^[A-Za-z0-9_-]+$/, "Letters, digits, _ and - only"),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  maxOccupancy: z.number().int().min(1).max(20).default(2),
  bedConfiguration: z.string().max(120).optional(),
  sizeSqm: z.number().int().positive().optional(),
  amenities: z.array(z.string().max(60)).default([]),
  baseRateKobo: z.number().int().nonnegative().default(0),
  displayOrder: z.number().int().default(0),
});

router.post("/", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const branchId = req.auth!.branchId;
  const code = parsed.data.code.toUpperCase();

  const clash = db.select().from(roomTypes).where(and(
    eq(roomTypes.branchId, branchId), eq(roomTypes.code, code),
  )).get();
  if (clash) return res.status(409).json({ error: "CODE_IN_USE" });

  const id = nanoid();
  const { amenities, ...rest } = parsed.data;
  db.insert(roomTypes).values({
    id, branchId, ...rest, code,
    amenitiesJson: JSON.stringify(amenities),
    isActive: true, createdAt: new Date(),
  }).run();

  logAudit({
    userId: req.auth!.userId, branchId, action: "room_type_created", module: "Settings",
    recordId: id, details: `${code} — ${parsed.data.name}`, ipAddress: req.ip,
  });
  res.status(201).json(db.select().from(roomTypes).where(eq(roomTypes.id, id)).get()!);
});

const patchSchema = createSchema.partial().omit({ code: true }).extend({
  isActive: z.boolean().optional(),
});

router.patch("/:id", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const type = db.select().from(roomTypes).where(eq(roomTypes.id, req.params.id)).get();
  if (!type || type.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const { amenities, ...rest } = parsed.data;

  db.update(roomTypes).set({
    ...rest,
    ...(amenities ? { amenitiesJson: JSON.stringify(amenities) } : {}),
  }).where(eq(roomTypes.id, type.id)).run();

  logAudit({
    userId: req.auth!.userId, branchId: req.auth!.branchId, action: "room_type_updated",
    module: "Settings", recordId: type.id, details: Object.keys(parsed.data).join(", "), ipAddress: req.ip,
  });
  res.json(db.select().from(roomTypes).where(eq(roomTypes.id, type.id)).get()!);
});

// DEACTIVATE, never delete. Rooms, reservations, rate rows and inventory all
// point at a type; removing the row would orphan every one of them and make
// historical reservations unreadable. `is_active` takes it out of the
// booking screens, which is what "delete this type" actually means.
router.delete("/:id", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const type = db.select().from(roomTypes).where(eq(roomTypes.id, req.params.id)).get();
  if (!type || type.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const roomCount = db.select().from(rooms).where(eq(rooms.roomTypeId, type.id)).all().length;
  if (roomCount > 0) {
    return res.status(409).json({
      error: "TYPE_HAS_ROOMS", roomCount,
      message: `${roomCount} room(s) are still this type. Reassign them first.`,
    });
  }
  const futureBookings = db.select().from(reservations).where(and(
    eq(reservations.roomTypeId, type.id),
    eq(reservations.status, "confirmed"),
  )).all().length;
  if (futureBookings > 0) {
    return res.status(409).json({ error: "TYPE_HAS_BOOKINGS", futureBookings });
  }

  transaction(() => {
    db.update(roomTypes).set({ isActive: false }).where(eq(roomTypes.id, type.id)).run();
    logAudit({
      userId: req.auth!.userId, branchId: req.auth!.branchId, action: "room_type_deactivated",
      module: "Settings", recordId: type.id, details: type.code, ipAddress: req.ip,
    });
  });
  res.json({ id: type.id, isActive: false });
});

export default router;
