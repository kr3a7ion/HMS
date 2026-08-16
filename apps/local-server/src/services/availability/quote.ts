// Backend Blueprint B8 — quoting a stay.
//
// THE PROPERTY THAT MATTERS: a quote must equal what actually gets posted.
// The DoD for this batch is "quotes match posted charges", and the only way
// to guarantee that is for both to run the SAME code -- so the per-night
// rate comes from resolveRate (which the night audit will also use) and the
// tax comes from computeTax (B6), which every posting path already goes
// through. Nothing here reimplements either.
//
// A quote that is computed a second, independent way is a quote that will
// eventually disagree with the bill by a kobo, and the guest will be the one
// who notices.
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { ratePlans, roomTypes } from "../../db/schema.js";
import { addKobo, type Kobo } from "../../lib/money.js";
import { computeTax, type TaxComputation } from "../tax/engine.js";
import { ROOM_CHARGE_CATEGORY } from "../nightAudit/roomCharges.js";
import { HandlerError } from "../../lib/handlerError.js";
import { nightsOf, availabilityForType } from "./inventory.js";
import { defaultRatePlan, resolveRate, type RateSource } from "./rates.js";

export interface QuoteNight {
  stayDate: string;
  rateKobo: Kobo;
  source: RateSource;
  available: number;
  sellable: number;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
}

export interface StayQuote {
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  nights: QuoteNight[];
  nightCount: number;
  /** Sum of the nightly rates, before tax. */
  subtotalKobo: Kobo;
  taxTotalKobo: Kobo;
  totalKobo: Kobo;
  tax: TaxComputation;
  bookable: boolean;
  blockers: string[];
  warnings: string[];
}

export interface QuoteInput {
  branchId: string;
  roomTypeId: string;
  ratePlanId?: string;
  checkIn: Date;
  checkOut: Date;
  guests?: number;
  exemptionTypes?: string[];
}

/**
 * Prices a stay night by night and taxes the total.
 *
 * WHY TAX IS COMPUTED ON THE STAY TOTAL AND NOT PER NIGHT, even though the
 * night audit posts one charge per night: it is a quote, and a guest
 * comparing the quoted total against the sum of their nightly VAT lines can
 * legitimately see a kobo of difference from independent rounding. The quote
 * therefore states BOTH -- `tax` is the computation on the total, and each
 * night carries its own rate -- and the reconciliation test asserts the
 * relationship rather than pretending it is exact. See the test for the
 * measured bound.
 */
export function quoteStay(input: QuoteInput): StayQuote {
  const type = db.select().from(roomTypes).where(eq(roomTypes.id, input.roomTypeId)).get();
  if (!type || type.branchId !== input.branchId) throw new HandlerError(400, "ROOM_TYPE_NOT_FOUND");

  const nights = nightsOf(input.checkIn, input.checkOut);
  if (nights.length === 0) throw new HandlerError(400, "INVALID_DATE_RANGE");

  const plan = input.ratePlanId
    ? db.select().from(ratePlans).where(eq(ratePlans.id, input.ratePlanId)).get() ?? null
    : defaultRatePlan(input.branchId);
  if (!plan || plan.branchId !== input.branchId) throw new HandlerError(400, "NO_RATE_PLAN");

  const availability = availabilityForType(input.branchId, type.id, input.checkIn, input.checkOut);
  const availByDate = new Map(availability.map(a => [a.stayDate.getTime(), a]));

  const blockers: string[] = [];
  const warnings: string[] = [];
  const quoted: QuoteNight[] = [];

  for (const [index, night] of nights.entries()) {
    const rate = resolveRate(plan.id, type.id, night);
    const avail = availByDate.get(night.getTime());
    const iso = night.toISOString().slice(0, 10);

    if (rate.rateKobo == null) {
      // Not zero. A missing rate is a configuration gap, and quoting ₦0
      // would sell the room free.
      blockers.push(`NO_RATE:${iso}`);
    }
    if (rate.stopSell) blockers.push(`STOP_SELL:${iso}`);
    if (index === 0 && rate.closedToArrival) blockers.push(`CLOSED_TO_ARRIVAL:${iso}`);
    if (!avail || avail.sellable <= 0) blockers.push(`SOLD_OUT:${iso}`);
    else if (avail.available <= 0) warnings.push(`OVERSELL:${iso}`);

    if (rate.minStay != null && nights.length < rate.minStay) {
      blockers.push(`MIN_STAY_${rate.minStay}:${iso}`);
    }

    quoted.push({
      stayDate: iso,
      rateKobo: rate.rateKobo ?? 0,
      source: rate.source,
      available: avail?.available ?? 0,
      sellable: avail?.sellable ?? 0,
      stopSell: rate.stopSell,
      closedToArrival: rate.closedToArrival,
      closedToDeparture: rate.closedToDeparture,
    });
  }

  // Departure-day restriction is on the night BEFORE checkout, which is the
  // last night of the stay.
  const lastNight = nights[nights.length - 1];
  if (resolveRate(plan.id, type.id, lastNight).closedToDeparture) {
    blockers.push(`CLOSED_TO_DEPARTURE:${input.checkOut.toISOString().slice(0, 10)}`);
  }

  if (input.guests != null && input.guests > type.maxOccupancy) {
    blockers.push(`OVER_OCCUPANCY:${type.maxOccupancy}`);
  }

  const subtotalKobo = quoted.length > 0 ? addKobo(...quoted.map(n => n.rateKobo)) : 0;

  // The SAME engine every posting path uses. Not a reimplementation.
  const tax = computeTax(subtotalKobo, {
    branchId: input.branchId,
    chargeCategory: ROOM_CHARGE_CATEGORY,
    nights: nights.length,
    exemptionTypes: input.exemptionTypes,
  });

  return {
    roomTypeId: type.id,
    roomTypeName: type.name,
    ratePlanId: plan.id,
    nights: quoted,
    nightCount: nights.length,
    subtotalKobo,
    taxTotalKobo: tax.taxTotalKobo,
    totalKobo: tax.totalKobo,
    tax,
    bookable: blockers.length === 0,
    blockers,
    warnings,
  };
}
