// Backend Blueprint B5 step 2 — nightly room charge posting.
//
// A REAL BEHAVIOUR CHANGE, and the reason it matters: check-in used to post
// the WHOLE stay as one line item the moment the guest arrived. That was
// always flagged in the code as a stand-in ("real PMS behavior (nightly
// auto-posting) is a later refinement") -- this is that refinement.
//
// Posting the whole stay up front is wrong in ways that surface immediately
// once there is a business date: a 5-night stay put all 5 nights into the
// arrival day's revenue, so occupancy said 1 room-night and revenue said 5.
// Nothing reconciled. Now one night posts per night, stamped with that
// night's business date, and the daily numbers agree.
//
// Leaving both in place would double-bill every guest, so check-in no
// longer posts room charges at all.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { folioCharges, reservations, rooms } from "../../db/schema.js";
import { formatBusinessDate } from "../../lib/businessDate.js";
import { postChargeWithTax } from "../tax/posting.js";

export const ROOM_CHARGE_CATEGORY = "Room";

/**
 * Posts one night's room charge for a reservation, for one business date.
 *
 * IDEMPOTENT, which is what makes the whole audit re-runnable: the key is
 * (reservation, business_date, category "Room"). Running the audit twice
 * for the same date is a no-op the second time rather than a double charge.
 * Returns null if the charge already existed.
 */
export function postRoomChargeForNight(
  reservationId: string,
  businessDate: Date,
  postedBy: string | null,
): { chargeId: string; amountKobo: number; totalKobo: number } | null {
  const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
  if (!reservation) return null;

  // The idempotency key is (reservation, business date, category, kind
  // "base"). `chargeKind` is part of it since B6: a night's posting is now a
  // base row PLUS its tax rows, all three matching the first three columns,
  // and without the kind filter the tax line from the first run would read
  // as "already posted" -- which is true, but only by accident.
  const existing = db.select().from(folioCharges).where(and(
    eq(folioCharges.reservationId, reservationId),
    eq(folioCharges.businessDate, businessDate),
    eq(folioCharges.category, ROOM_CHARGE_CATEGORY),
    eq(folioCharges.chargeKind, "base"),
  )).get();
  if (existing) return null;

  const room = reservation.roomId
    ? db.select().from(rooms).where(eq(rooms.id, reservation.roomId)).get()
    : null;

  // B6: through the tax engine like every other posting path. The room rate
  // is the single largest taxable line a hotel produces, so a room charge
  // that skipped the engine would mean the bulk of the property's VAT went
  // uncollected.
  const posted = postChargeWithTax({
    reservationId,
    branchId: reservation.branchId,
    category: ROOM_CHARGE_CATEGORY,
    description: `Room ${room?.number ?? "—"} — night of ${formatBusinessDate(businessDate)}`,
    quantity: 1,
    unitPriceKobo: reservation.rateKobo,
    amountKobo: reservation.rateKobo,
    postedBy: postedBy ?? reservation.createdBy,
    businessDate,
    taxContext: { nights: nightsOf(reservation) },
  });

  return { chargeId: posted.chargeId, amountKobo: posted.baseKobo, totalKobo: posted.totalKobo };
}

/** Nights booked, for long-stay tax exemptions. Check-out day is not a night. */
function nightsOf(reservation: typeof reservations.$inferSelect): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((reservation.checkOutDate.getTime() - reservation.checkInDate.getTime()) / DAY_MS));
}

/**
 * Posts every night a stay has actually occupied up to and including
 * `throughBusinessDate`, skipping ones already posted.
 *
 * Used at check-out as well as by the audit. Without it, a guest who checks
 * in and leaves before the next night audit would be billed nothing at all
 * for the room -- the audit is what posts the room charge now, and it has
 * not run yet. This closes that gap by settling the outstanding nights at
 * departure.
 */
export function postOutstandingRoomNights(
  reservationId: string,
  throughBusinessDate: Date,
  postedBy: string | null,
): { postedNights: number; totalKobo: number } {
  const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
  if (!reservation) return { postedNights: 0, totalKobo: 0 };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const firstNight = Date.UTC(
    reservation.checkInDate.getUTCFullYear(),
    reservation.checkInDate.getUTCMonth(),
    reservation.checkInDate.getUTCDate(),
  );
  // Check-out day is not a night (same rule as room-night inventory), so the
  // last billable night is the earlier of "the night before departure" and
  // the date being settled through.
  const lastBillable = Math.min(
    Date.UTC(
      reservation.checkOutDate.getUTCFullYear(),
      reservation.checkOutDate.getUTCMonth(),
      reservation.checkOutDate.getUTCDate(),
    ) - DAY_MS,
    throughBusinessDate.getTime(),
  );

  let postedNights = 0;
  let totalKobo = 0;
  for (let t = firstNight; t <= lastBillable; t += DAY_MS) {
    const result = postRoomChargeForNight(reservationId, new Date(t), postedBy);
    if (result) {
      postedNights += 1;
      // Tax included: this figure is what the guest's balance actually moved
      // by, and it is used at check-out to tell them what they owe.
      totalKobo += result.totalKobo;
    }
  }
  return { postedNights, totalKobo };
}
