// Backend Blueprint B8 — the rate calendar and its bulk editor.
//
// The bulk endpoint is the one revenue management actually uses: "₦65,000
// for every Deluxe, Friday and Saturday, through December" is one request,
// not ninety. Doing it a row at a time through PATCH is how half a range
// ends up priced when a browser tab is closed midway.
import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { rateCalendar, ratePlans, roomTypes } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { transaction } from "../db/tx.js";
import { logAudit } from "../services/audit.js";
import { formatNaira, mulRate } from "../lib/money.js";
import { midnight, nightsOf } from "../services/availability/inventory.js";
import { defaultRatePlan, resolveRate } from "../services/availability/rates.js";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

// GET /rate-calendar?planId&typeId&from&to
// Returns a RESOLVED row per night, not just the stored ones -- the grid has
// to show what a night actually costs, including nights priced by derivation
// or falling back to the type's base rate. Showing only stored rows would
// leave the majority of the calendar blank and imply "no rate".
router.get("/", requireAuth, requirePermission("rates:read", "rates:manage"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date();
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date(Date.now() + 30 * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }

  const plan = typeof req.query.planId === "string"
    ? db.select().from(ratePlans).where(eq(ratePlans.id, req.query.planId)).get() ?? null
    : defaultRatePlan(branchId);
  if (!plan || plan.branchId !== branchId) return res.status(400).json({ error: "NO_RATE_PLAN" });

  const types = typeof req.query.typeId === "string"
    ? db.select().from(roomTypes).where(eq(roomTypes.id, req.query.typeId)).all().filter(t => t.branchId === branchId)
    : db.select().from(roomTypes).where(and(eq(roomTypes.branchId, branchId), eq(roomTypes.isActive, true))).all();

  // `to` is inclusive here: a rate grid shown "1st to 7th" means seven nights.
  const nights = nightsOf(from, new Date(midnight(to).getTime() + DAY_MS));

  res.json({
    ratePlanId: plan.id,
    ratePlanCode: plan.code,
    types: types.map(type => ({
      roomTypeId: type.id,
      roomTypeName: type.name,
      nights: nights.map(night => {
        const rate = resolveRate(plan.id, type.id, night);
        return {
          stayDate: night.toISOString().slice(0, 10),
          rateKobo: rate.rateKobo,
          source: rate.source,
          stopSell: rate.stopSell,
          closedToArrival: rate.closedToArrival,
          closedToDeparture: rate.closedToDeparture,
          minStay: rate.minStay,
        };
      }),
    })),
  });
});

const bulkSchema = z.object({
  ratePlanId: z.string().optional(),
  roomTypeIds: z.array(z.string()).min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
  /** Only these weekdays (0=Sunday). Omitted means every day in range. */
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  rateKobo: z.number().int().nonnegative().optional(),
  /** Signed basis points applied to the currently resolved rate. */
  adjustBp: z.number().int().optional(),
  minStay: z.number().int().positive().nullable().optional(),
  stopSell: z.boolean().optional(),
  closedToArrival: z.boolean().optional(),
  closedToDeparture: z.boolean().optional(),
}).refine(
  d => d.rateKobo !== undefined || d.adjustBp !== undefined
    || d.minStay !== undefined || d.stopSell !== undefined
    || d.closedToArrival !== undefined || d.closedToDeparture !== undefined,
  { message: "Nothing to apply" },
);

// POST /rate-calendar/bulk — date range x types, in ONE transaction.
router.post("/bulk", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const branchId = req.auth!.branchId;

  if (d.rateKobo !== undefined && d.adjustBp !== undefined) {
    return res.status(400).json({ error: "SET_OR_ADJUST_NOT_BOTH" });
  }
  if (midnight(d.to) < midnight(d.from)) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  const plan = d.ratePlanId
    ? db.select().from(ratePlans).where(eq(ratePlans.id, d.ratePlanId)).get() ?? null
    : defaultRatePlan(branchId);
  if (!plan || plan.branchId !== branchId) return res.status(400).json({ error: "NO_RATE_PLAN" });

  // Writing rates onto a DERIVED plan would defeat the derivation: the
  // explicit row wins over the rule, so the plan would silently stop
  // tracking its base. Price the base plan instead.
  if (plan.derivedFromId) {
    return res.status(409).json({
      error: "PLAN_IS_DERIVED", derivedFromId: plan.derivedFromId,
      message: `${plan.code} derives from another plan. Set rates on the base plan; this one follows it automatically.`,
    });
  }

  const types = db.select().from(roomTypes).where(eq(roomTypes.branchId, branchId)).all()
    .filter(t => d.roomTypeIds.includes(t.id));
  if (types.length !== d.roomTypeIds.length) return res.status(400).json({ error: "ROOM_TYPE_NOT_FOUND" });

  const nights = nightsOf(d.from, new Date(midnight(d.to).getTime() + DAY_MS))
    .filter(n => !d.weekdays || d.weekdays.includes(n.getUTCDay()));
  if (nights.length === 0) return res.status(400).json({ error: "NO_DATES_MATCHED" });

  const updated = transaction(() => {
    let count = 0;
    for (const type of types) {
      for (const night of nights) {
        const existing = db.select().from(rateCalendar).where(and(
          eq(rateCalendar.ratePlanId, plan.id),
          eq(rateCalendar.roomTypeId, type.id),
          eq(rateCalendar.stayDate, night),
        )).get();

        let rateKobo = d.rateKobo ?? existing?.rateKobo ?? null;
        if (d.adjustBp !== undefined) {
          // Adjust from what the night RESOLVES to today, not from the
          // stored row -- otherwise "+10%" on an unpriced night silently
          // adjusts nothing instead of marking up the base rate.
          const current = existing?.rateKobo ?? resolveRate(plan.id, type.id, night).rateKobo;
          if (current == null) continue;   // nothing to adjust; leave it unpriced
          rateKobo = current + mulRate(current, d.adjustBp);
        }
        if (rateKobo == null) continue;

        const fields = {
          rateKobo,
          ...(d.minStay !== undefined ? { minStay: d.minStay } : {}),
          ...(d.stopSell !== undefined ? { stopSell: d.stopSell } : {}),
          ...(d.closedToArrival !== undefined ? { closedToArrival: d.closedToArrival } : {}),
          ...(d.closedToDeparture !== undefined ? { closedToDeparture: d.closedToDeparture } : {}),
          updatedAt: new Date(),
        };

        if (existing) {
          db.update(rateCalendar).set(fields).where(eq(rateCalendar.id, existing.id)).run();
        } else {
          db.insert(rateCalendar).values({
            id: nanoid(), branchId, ratePlanId: plan.id, roomTypeId: type.id,
            stayDate: night, ...fields,
          }).run();
        }
        count += 1;
      }
    }

    logAudit({
      userId: req.auth!.userId, branchId, action: "rate_calendar_bulk_updated", module: "Settings",
      recordId: plan.id,
      details: `${plan.code}: ${count} night(s) across ${types.length} type(s)`
        + (d.rateKobo !== undefined ? ` set to ${formatNaira(d.rateKobo)}` : "")
        + (d.adjustBp !== undefined ? ` adjusted ${d.adjustBp > 0 ? "+" : ""}${d.adjustBp / 100}%` : "")
        + (d.stopSell !== undefined ? `, stop-sell ${d.stopSell ? "on" : "off"}` : ""),
      ipAddress: req.ip,
    });
    return count;
  });

  res.json({ ratePlanId: plan.id, nightsUpdated: updated, roomTypes: types.length });
});

export default router;
