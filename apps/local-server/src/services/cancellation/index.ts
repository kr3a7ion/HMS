// Backend Blueprint B9 — cancelling a stay, with financial consequence.
//
// ONE TRANSACTION, and the order matters: compute the penalty → post it as a
// real folio charge through the tax engine → mark the stay cancelled → release
// BOTH inventories → audit. If any step fails, none of it happened. A stay
// that is marked cancelled but still holds its rooms, or a penalty posted
// against a stay that is still live, are both worse than a failed request.
//
// THE PREVIEW IS NOT OPTIONAL. The blueprint calls it mandatory and it is: a
// guest is told what cancelling will cost BEFORE it is done, from the same
// function that will actually charge them. Cancelling first and surprising
// them afterwards is how a front desk ends up arguing about money it has
// already taken.
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { reservations, guests, folioCharges } from "../../db/schema.js";
import { HandlerError } from "../../lib/handlerError.js";
import { currentBusinessDate } from "../../lib/businessDate.js";
import { releaseRoomNights } from "../roomInventory.js";
import { releaseInventory } from "../availability/inventory.js";
import { postChargeWithTax } from "../tax/posting.js";
import { computeTax } from "../tax/engine.js";
import { computePenalty, type PenaltyQuote, type PenaltyTrigger } from "./policy.js";
import { folioSummary } from "../folio.js";

export const CANCELLATION_CATEGORY = "Cancellation";
export const NO_SHOW_CATEGORY = "No-show";

/** Statuses that can still be cancelled. */
const CANCELLABLE = new Set(["confirmed", "pending"]);

export interface CancellationPreview {
  reservationId: string;
  guestName: string | null;
  status: string;
  checkInDate: Date;
  checkOutDate: Date;
  penalty: PenaltyQuote;
  /** What the penalty will cost once tax is applied. */
  penaltyWithTaxKobo: number;
  taxKobo: number;
  /** Payments already taken that would become refundable. */
  paidKobo: number;
  /** paid - penalty(inc. tax). Negative means the guest still owes. */
  refundableKobo: number;
  cancellable: boolean;
  blockedReason: string | null;
}

/**
 * What cancelling would cost, without doing it.
 *
 * Computes the tax the same way the posting path will -- by asking the B6
 * engine -- so the previewed total is the total, not an estimate.
 */
export function previewCancellation(
  reservationId: string,
  branchId: string,
  trigger: PenaltyTrigger = "cancellation",
  at: Date = new Date(),
): CancellationPreview {
  const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
  if (!reservation || reservation.branchId !== branchId) throw new HandlerError(404, "NOT_FOUND");

  const guest = db.select().from(guests).where(eq(guests.id, reservation.guestId)).get();
  const penalty = computePenalty(reservation, trigger, at);

  // Ask the engine what the tax on this penalty would be, without posting.
  const tax = penalty.amountKobo > 0
    ? computeTax(penalty.amountKobo, {
        branchId,
        chargeCategory: trigger === "no_show" ? NO_SHOW_CATEGORY : CANCELLATION_CATEGORY,
        nights: penalty.nights,
      })
    : null;

  const folio = folioSummary(reservationId);
  const penaltyWithTaxKobo = tax ? tax.totalKobo : penalty.amountKobo;

  let blockedReason: string | null = null;
  if (!CANCELLABLE.has(reservation.status)) {
    blockedReason = reservation.status === "cancelled"
      ? "This reservation is already cancelled."
      : `A ${reservation.status.replace("_", "-")} reservation cannot be cancelled.`;
  }

  return {
    reservationId,
    guestName: guest ? `${guest.firstName} ${guest.lastName}`.trim() : null,
    status: reservation.status,
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    penalty,
    penaltyWithTaxKobo,
    taxKobo: tax ? tax.taxTotalKobo : 0,
    paidKobo: folio.totalPaidKobo,
    refundableKobo: folio.totalPaidKobo - penaltyWithTaxKobo,
    cancellable: blockedReason == null,
    blockedReason,
  };
}

export interface CancelInput {
  reason: string;
  waivePenalty?: boolean;
  waiverReason?: string;
  actorUserId: string;
  branchId: string;
  at?: Date;
}

export interface CancelResult {
  reservationId: string;
  penalty: PenaltyQuote;
  penaltyChargeId: string | null;
  penaltyChargedKobo: number;
  penaltyWaived: boolean;
  releasedNights: number;
  refundableKobo: number;
}

/**
 * Cancels a stay. CALLER MUST WRAP THIS IN immediateTransaction.
 */
export function cancelReservation(reservationId: string, input: CancelInput): CancelResult {
  const at = input.at ?? new Date();
  const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
  if (!reservation || reservation.branchId !== input.branchId) throw new HandlerError(404, "NOT_FOUND");
  if (reservation.status === "cancelled") throw new HandlerError(409, "ALREADY_CANCELLED");
  if (!CANCELLABLE.has(reservation.status)) {
    // A checked-in guest is not "cancelled", they are checked out early --
    // a different operation with a different financial shape.
    throw new HandlerError(409, "INVALID_STATUS", {
      status: reservation.status,
      message: reservation.status === "checked_in"
        ? "The guest has already arrived. Check them out instead."
        : undefined,
    });
  }

  if (input.waivePenalty && !input.waiverReason?.trim()) {
    // A waiver with no reason is indistinguishable from a mistake, and it is
    // the one field an auditor will ask about.
    throw new HandlerError(400, "WAIVER_REASON_REQUIRED");
  }

  const penalty = computePenalty(reservation, "cancellation", at);
  const businessDate = currentBusinessDate(input.branchId);

  let penaltyChargeId: string | null = null;
  let penaltyChargedKobo = 0;

  if (penalty.amountKobo > 0 && !input.waivePenalty) {
    // Through the tax engine like every other posting path (B6 DoD). A
    // cancellation penalty is taxable revenue, not a special case.
    const posted = postChargeWithTax({
      reservationId,
      branchId: input.branchId,
      category: CANCELLATION_CATEGORY,
      description: `Cancellation penalty — ${penalty.basis}`,
      quantity: 1,
      unitPriceKobo: penalty.amountKobo,
      amountKobo: penalty.amountKobo,
      postedBy: input.actorUserId,
      businessDate,
      taxContext: { nights: penalty.nights },
    });
    penaltyChargeId = posted.chargeId;
    penaltyChargedKobo = posted.totalKobo;
  }

  db.update(reservations).set({
    status: "cancelled",
    cancelledAt: at,
    cancelledBy: input.actorUserId,
    cancellationReason: input.reason,
    penaltyChargeId,
    penaltyWaived: input.waivePenalty ?? false,
    penaltyWaivedBy: input.waivePenalty ? input.actorUserId : null,
    penaltyWaiverReason: input.waivePenalty ? input.waiverReason ?? null : null,
  }).where(eq(reservations.id, reservationId)).run();

  // Both inventories, in the same transaction. A cancelled stay that still
  // holds its rooms is the single most expensive bug in this domain: the
  // property cannot sell a room that nobody is in.
  const releasedNights = releaseRoomNights(reservationId);
  if (reservation.roomTypeId) {
    releaseInventory(reservation.roomTypeId, reservation.checkInDate, reservation.checkOutDate);
  }

  const folio = folioSummary(reservationId);
  return {
    reservationId,
    penalty,
    penaltyChargeId,
    penaltyChargedKobo,
    penaltyWaived: input.waivePenalty ?? false,
    releasedNights,
    refundableKobo: folio.totalPaidKobo - folio.totalChargesKobo,
  };
}

/**
 * Posts the no-show penalty for a stay. Used by B5's night audit and B10's
 * manual no-show endpoint -- both of which have been recording no-shows with
 * a null penalty since they were built, waiting for exactly this.
 *
 * Returns null when the policy charges nothing, which is a legitimate
 * configuration rather than a failure.
 */
export function postNoShowPenalty(
  reservationId: string,
  branchId: string,
  businessDate: Date,
  actorUserId: string | null,
): { chargeId: string; amountKobo: number; totalKobo: number; basis: string } | null {
  const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
  if (!reservation) return null;

  const penalty = computePenalty(reservation, "no_show", businessDate);
  if (penalty.amountKobo <= 0) return null;

  // Idempotent on (reservation, businessDate, category): the audit is
  // re-runnable by design, and a second pass must not charge twice.
  const existing = db.select().from(folioCharges).all().find(c =>
    c.reservationId === reservationId
    && c.category === NO_SHOW_CATEGORY
    && c.businessDate.getTime() === businessDate.getTime()
    && !c.isReversal);
  if (existing) return null;

  const posted = postChargeWithTax({
    reservationId,
    branchId,
    category: NO_SHOW_CATEGORY,
    description: `No-show penalty — ${penalty.basis}`,
    quantity: 1,
    unitPriceKobo: penalty.amountKobo,
    amountKobo: penalty.amountKobo,
    postedBy: actorUserId ?? reservation.createdBy,
    businessDate,
    taxContext: { nights: penalty.nights },
  });

  return {
    chargeId: posted.chargeId,
    amountKobo: penalty.amountKobo,
    totalKobo: posted.totalKobo,
    basis: penalty.basis,
  };
}
