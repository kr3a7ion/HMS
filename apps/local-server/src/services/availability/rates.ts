// Backend Blueprint B8 — rate resolution.
//
// WHAT THIS REPLACES. POST /reservations used to take `rateKobo` from the
// client and store whatever arrived. The price of a room was therefore
// whatever the last person to touch the form typed, there was no rate card,
// and nothing could tell ₦4,500 from a mistyped ₦45,000.
//
// RESOLUTION ORDER, and every step exists because the one before it can be
// legitimately absent:
//
//   1. An explicit rate_calendar row for (plan, type, night). Revenue
//      management has priced this night deliberately -- always wins.
//   2. A derivation, if the plan is derived. "Corporate = BAR less 15%" is
//      computed from the BASE plan's rate for that night, at read time.
//      Never stored: storing it means a base-rate change silently leaves
//      every derived plan on yesterday's price.
//   3. room_types.base_rate_kobo. The rate card's floor.
//
// A resolution that finds nothing returns null rather than 0. Zero is a real
// price (a comp), so using it as "unknown" would book free rooms.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { rateCalendar, ratePlans, roomTypes } from "../../db/schema.js";
import { addKobo, mulRate, type Kobo } from "../../lib/money.js";

export type RateSource = "calendar" | "derived" | "base_rate" | "none";

export interface ResolvedRate {
  rateKobo: Kobo | null;
  source: RateSource;
  /** Restrictions from the calendar row, if one governed this night. */
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minStay: number | null;
  /** For a derived plan: what the base resolved to before derivation. */
  baseRateKobo?: Kobo | null;
}

const EMPTY: ResolvedRate = {
  rateKobo: null, source: "none",
  stopSell: false, closedToArrival: false, closedToDeparture: false, minStay: null,
};

function midnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Applies a plan's derivation to a base rate.
 *
 * `percentage` is signed basis points: -1500 is "15% off", +1000 is "10% on
 * top". It goes through mulRate so the single rounding policy in money.ts
 * applies here too -- a derived rate is real money on a real invoice.
 */
export function applyDerivation(
  baseKobo: Kobo,
  derivationType: string | null,
  valueBp: number | null,
): Kobo {
  if (derivationType == null || valueBp == null) return baseKobo;
  if (derivationType === "percentage") return addKobo(baseKobo, mulRate(baseKobo, valueBp));
  // fixed_offset carries kobo directly, not basis points.
  if (derivationType === "fixed_offset") return addKobo(baseKobo, valueBp);
  return baseKobo;
}

function calendarRow(ratePlanId: string, roomTypeId: string, night: Date) {
  return db.select().from(rateCalendar).where(and(
    eq(rateCalendar.ratePlanId, ratePlanId),
    eq(rateCalendar.roomTypeId, roomTypeId),
    eq(rateCalendar.stayDate, night),
  )).get() ?? null;
}

/**
 * The rate for one night, following the order above.
 *
 * `depth` guards against a derivation cycle (A derives from B derives from
 * A), which a settings screen can create by accident and which would
 * otherwise recurse until the stack gives out.
 */
export function resolveRate(
  ratePlanId: string,
  roomTypeId: string,
  stayDate: Date,
  depth = 0,
): ResolvedRate {
  if (depth > 8) return EMPTY;
  const night = midnight(stayDate);

  // 1. Explicit calendar row.
  const row = calendarRow(ratePlanId, roomTypeId, night);
  const restrictions = row ? {
    stopSell: row.stopSell,
    closedToArrival: row.closedToArrival,
    closedToDeparture: row.closedToDeparture,
    minStay: row.minStay ?? null,
  } : { stopSell: false, closedToArrival: false, closedToDeparture: false, minStay: null };

  if (row) return { rateKobo: row.rateKobo, source: "calendar", ...restrictions };

  const plan = db.select().from(ratePlans).where(eq(ratePlans.id, ratePlanId)).get();

  // 2. Derivation from the base plan.
  if (plan?.derivedFromId) {
    const base = resolveRate(plan.derivedFromId, roomTypeId, night, depth + 1);
    if (base.rateKobo != null) {
      return {
        rateKobo: applyDerivation(base.rateKobo, plan.derivationType, plan.derivationValueBp),
        source: "derived",
        baseRateKobo: base.rateKobo,
        // Restrictions are inherited: a stop-sell on the base plan closes the
        // night for everything derived from it, which is what "the hotel is
        // not selling that night" has to mean.
        stopSell: base.stopSell,
        closedToArrival: base.closedToArrival,
        closedToDeparture: base.closedToDeparture,
        minStay: base.minStay,
      };
    }
  }

  // 3. The type's base rate.
  const type = db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeId)).get();
  if (type && type.baseRateKobo > 0) {
    const rateKobo = plan?.derivedFromId
      ? applyDerivation(type.baseRateKobo, plan.derivationType, plan.derivationValueBp)
      : type.baseRateKobo;
    return { rateKobo, source: "base_rate", ...restrictions };
  }

  return { ...EMPTY, ...restrictions };
}

/** The branch's base plan (BAR), used when a caller names no plan. */
export function defaultRatePlan(branchId: string) {
  const plans = db.select().from(ratePlans).where(and(
    eq(ratePlans.branchId, branchId),
    eq(ratePlans.isActive, true),
  )).all();
  return plans.find(p => p.code === "BAR") ?? plans.find(p => p.planType === "base") ?? plans[0] ?? null;
}

export function listRatePlans(branchId: string) {
  return db.select().from(ratePlans).where(eq(ratePlans.branchId, branchId)).all();
}

/** Calendar rows for a plan/type over a range, for the rate grid. */
export function rateCalendarRange(
  branchId: string, ratePlanId: string, roomTypeIds: string[], from: Date, to: Date,
) {
  if (roomTypeIds.length === 0) return [];
  return db.select().from(rateCalendar).where(and(
    eq(rateCalendar.branchId, branchId),
    eq(rateCalendar.ratePlanId, ratePlanId),
    inArray(rateCalendar.roomTypeId, roomTypeIds),
  )).all().filter(r => r.stayDate >= midnight(from) && r.stayDate <= midnight(to));
}
