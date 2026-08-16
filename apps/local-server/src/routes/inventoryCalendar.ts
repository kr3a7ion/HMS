// Backend Blueprint B8 — the inventory calendar.
//
// `sold` is NOT editable here. It is maintained by booking and cancellation
// inside their own transactions, and a settings screen that could set it by
// hand would be a way to make the counter disagree with the reservations it
// counts -- the exact drift this table exists to prevent. What an operator
// legitimately adjusts is the oversell allowance and out-of-order rooms.
import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { inventoryCalendar, roomTypes } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { transaction } from "../db/tx.js";
import { logAudit } from "../services/audit.js";
import {
  activeRoomTypes, availabilityForType, ensureInventoryRows, midnight, nightsOf,
} from "../services/availability/inventory.js";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

router.get("/", requireAuth, requirePermission("inventory:calendar", "rates:manage"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date();
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date(Date.now() + 30 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }

  let types = activeRoomTypes(branchId);
  if (typeof req.query.typeId === "string") types = types.filter(t => t.id === req.query.typeId);

  // `to` inclusive: a calendar shown "1st to 7th" covers seven nights.
  const rangeEnd = new Date(midnight(to).getTime() + DAY_MS);
  res.json(types.map(type => ({
    roomTypeId: type.id,
    code: type.code,
    name: type.name,
    nights: availabilityForType(branchId, type.id, from, rangeEnd).map(n => ({
      ...n, stayDate: n.stayDate.toISOString().slice(0, 10),
    })),
  })));
});

const patchSchema = z.object({
  roomTypeId: z.string().min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
  blocked: z.number().int().nonnegative().optional(),
  outOfOrder: z.number().int().nonnegative().optional(),
  overbookingLimit: z.number().int().nonnegative().optional(),
}).refine(
  d => d.blocked !== undefined || d.outOfOrder !== undefined || d.overbookingLimit !== undefined,
  { message: "Nothing to apply" },
);

router.patch("/", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const branchId = req.auth!.branchId;

  const type = db.select().from(roomTypes).where(eq(roomTypes.id, d.roomTypeId)).get();
  if (!type || type.branchId !== branchId) return res.status(400).json({ error: "ROOM_TYPE_NOT_FOUND" });
  if (midnight(d.to) < midnight(d.from)) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const nights = nightsOf(d.from, new Date(midnight(d.to).getTime() + DAY_MS));
  ensureInventoryRows(branchId, type.id, nights);

  const rows = db.select().from(inventoryCalendar).where(and(
    eq(inventoryCalendar.roomTypeId, type.id),
    gte(inventoryCalendar.stayDate, nights[0]),
    lte(inventoryCalendar.stayDate, nights[nights.length - 1]),
  )).all();

  // Refuse a change that would make the night claim fewer rooms than are
  // already sold on it. Allowing it would show negative availability and
  // leave someone deciding at check-in which guest has no room.
  const conflicts = rows.filter(r => {
    const blocked = d.blocked ?? r.blocked;
    const ooo = d.outOfOrder ?? r.outOfOrder;
    return r.totalRooms - blocked - ooo < r.sold;
  });
  if (conflicts.length > 0) {
    return res.status(409).json({
      error: "WOULD_OVERSELL",
      dates: conflicts.map(c => c.stayDate.toISOString().slice(0, 10)),
      message: "That would leave fewer rooms than are already sold on those nights.",
    });
  }

  transaction(() => {
    for (const row of rows) {
      db.update(inventoryCalendar).set({
        ...(d.blocked !== undefined ? { blocked: d.blocked } : {}),
        ...(d.outOfOrder !== undefined ? { outOfOrder: d.outOfOrder } : {}),
        ...(d.overbookingLimit !== undefined ? { overbookingLimit: d.overbookingLimit } : {}),
      }).where(eq(inventoryCalendar.id, row.id)).run();
    }
    logAudit({
      userId: req.auth!.userId, branchId, action: "inventory_calendar_updated", module: "Settings",
      recordId: type.id,
      details: `${type.code}: ${rows.length} night(s) — `
        + Object.entries(d).filter(([k]) => ["blocked", "outOfOrder", "overbookingLimit"].includes(k))
          .map(([k, v]) => `${k}=${v}`).join(", "),
      ipAddress: req.ip,
    });
  });

  res.json({ roomTypeId: type.id, nightsUpdated: rows.length });
});

export default router;
