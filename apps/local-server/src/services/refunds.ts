// Backend Blueprint B9 — refunds as first-class records.
//
// WHY REQUEST-THEN-APPROVE RATHER THAN A BUTTON. Refunding is the easiest way
// to steal from a hotel: it converts a guest's recorded payment into cash out
// of the drawer, and the person best placed to do it is the same person on the
// desk taking payments. So the act is split — one person asks, another agrees
// — and above a threshold the approver needs a higher grant than the everyday
// one. Neither half moves money on its own.
//
// THE LEDGER IS TOUCHED ONCE, AT COMPLETION. An approved refund is a promise;
// a completed one is a negative payment row (B4's reversal mechanism, so the
// original payment keeps its amount forever and the refund is visible as its
// own line). `payment_reversal_id` being null is exactly the difference
// between "we agreed to refund" and "the money has left".
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { refunds, payments, reservations, guests } from "../db/schema.js";
import { addKobo, subKobo, type Kobo } from "../lib/money.js";
import { currentBusinessDate } from "../lib/businessDate.js";
import { HandlerError } from "../lib/handlerError.js";
import { allocateNumber } from "./documents/sequence.js";
import { voidPayment } from "./ledger.js";
import { folioSummary } from "./folio.js";

export const REFUND_STATUSES = [
  "requested", "approved", "processing", "completed", "failed", "rejected",
] as const;
export type RefundStatus = typeof REFUND_STATUSES[number];

/**
 * Refunds at or above this need the elevated grant. ₦100,000.
 *
 * A constant rather than a setting for now, and flagged as such: making it
 * configurable invites setting it to a number that disables the control, and
 * the threshold is exactly the thing an operator under pressure would raise.
 * If a property genuinely needs a different figure it becomes a branch
 * setting with its own audited change history, not a free-text box.
 */
export const HIGH_VALUE_REFUND_THRESHOLD_KOBO = 10_000_000;

export interface Deduction {
  label: string;
  amountKobo: Kobo;
}

export interface RequestRefundInput {
  branchId: string;
  paymentId?: string | null;
  reservationId?: string | null;
  requestedAmountKobo: Kobo;
  deductions?: Deduction[];
  reason: string;
  method: string;
  /** Refunding by a different method than it was paid needs a reason. */
  methodOverrideReason?: string;
  requestedBy: string;
}

/**
 * Raises a refund request. CALLER MUST WRAP IN immediateTransaction --
 * it allocates a document number.
 */
export function requestRefund(input: RequestRefundInput) {
  if (!Number.isInteger(input.requestedAmountKobo) || input.requestedAmountKobo <= 0) {
    throw new HandlerError(400, "INVALID_AMOUNT");
  }

  const payment = input.paymentId
    ? db.select().from(payments).where(eq(payments.id, input.paymentId)).get() ?? null
    : null;
  if (input.paymentId && !payment) throw new HandlerError(404, "PAYMENT_NOT_FOUND");

  let reservationId = input.reservationId ?? payment?.reservationId ?? null;
  if (reservationId) {
    const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get();
    if (!reservation || reservation.branchId !== input.branchId) throw new HandlerError(404, "RESERVATION_NOT_FOUND");
  }

  if (payment) {
    // Cannot refund more than the payment still carries. Refunding beyond it
    // would hand back money the guest never gave.
    const remaining = subKobo(payment.amountKobo, payment.reversedAmountKobo);
    if (input.requestedAmountKobo > remaining) {
      throw new HandlerError(400, "REFUND_EXCEEDS_PAYMENT", { remainingKobo: remaining });
    }
    // The method must match how it was paid unless deliberately overridden:
    // refunding a card payment in cash is a standard laundering route and a
    // standard chargeback problem.
    if (payment.method !== input.method && !input.methodOverrideReason?.trim()) {
      throw new HandlerError(400, "METHOD_MISMATCH", {
        paidMethod: payment.method,
        message: `This payment was taken by ${payment.method}. Refunding by ${input.method} requires methodOverrideReason.`,
      });
    }
  }

  const deductions = input.deductions ?? [];
  const deductionTotal = deductions.length > 0 ? addKobo(...deductions.map(d => d.amountKobo)) : 0;
  if (deductionTotal > input.requestedAmountKobo) {
    throw new HandlerError(400, "DEDUCTIONS_EXCEED_REFUND", { deductionTotalKobo: deductionTotal });
  }

  const number = allocateNumber(input.branchId, "credit_note");
  const guestId = reservationId
    ? db.select().from(reservations).where(eq(reservations.id, reservationId)).get()?.guestId ?? null
    : null;

  const id = nanoid();
  db.insert(refunds).values({
    id,
    branchId: input.branchId,
    // Refunds share the credit-note series: both are "money going back to the
    // guest", and a property reconciling outgoing documents wants one
    // sequence, not two that interleave.
    refundNumber: number.formatted.replace("-CRN-", "-RFD-"),
    sequenceNumber: number.sequenceNumber,
    businessDate: currentBusinessDate(input.branchId),
    paymentId: input.paymentId ?? null,
    reservationId,
    guestId,
    requestedAmountKobo: input.requestedAmountKobo,
    approvedAmountKobo: null,
    deductionsJson: JSON.stringify(deductions),
    reason: input.methodOverrideReason
      ? `${input.reason} — method override: ${input.methodOverrideReason}`
      : input.reason,
    method: input.method,
    status: "requested",
    requestedBy: input.requestedBy,
    requestedAt: new Date(),
  }).run();

  return {
    refundId: id,
    refundNumber: number.formatted.replace("-CRN-", "-RFD-"),
    netAmountKobo: subKobo(input.requestedAmountKobo, deductionTotal),
    requiresElevatedApproval: input.requestedAmountKobo >= HIGH_VALUE_REFUND_THRESHOLD_KOBO,
  };
}

export interface ApproveRefundInput {
  branchId: string;
  approvedAmountKobo?: Kobo;
  gatewayReference?: string;
  actorUserId: string;
  /** True when the actor holds finance:refund_approve_high. */
  hasElevatedGrant: boolean;
}

/**
 * Approves a refund and posts the ledger reversal. CALLER MUST WRAP IN
 * immediateTransaction -- it writes the refund row and a payment reversal
 * that must not come apart.
 */
export function approveRefund(refundId: string, input: ApproveRefundInput) {
  const refund = db.select().from(refunds).where(eq(refunds.id, refundId)).get();
  if (!refund || refund.branchId !== input.branchId) throw new HandlerError(404, "REFUND_NOT_FOUND");
  if (refund.status !== "requested") throw new HandlerError(409, "INVALID_STATUS", { status: refund.status });

  // Self-approval defeats the entire two-person control.
  if (refund.requestedBy === input.actorUserId) {
    throw new HandlerError(403, "SELF_APPROVAL", {
      message: "A refund must be approved by someone other than the person who requested it.",
    });
  }

  const approvedAmountKobo = input.approvedAmountKobo ?? refund.requestedAmountKobo;
  if (!Number.isInteger(approvedAmountKobo) || approvedAmountKobo <= 0) {
    throw new HandlerError(400, "INVALID_AMOUNT");
  }
  if (approvedAmountKobo > refund.requestedAmountKobo) {
    // Approving more than was asked for turns review into an escalation path.
    throw new HandlerError(400, "APPROVAL_EXCEEDS_REQUEST", { requestedKobo: refund.requestedAmountKobo });
  }
  if (approvedAmountKobo >= HIGH_VALUE_REFUND_THRESHOLD_KOBO && !input.hasElevatedGrant) {
    throw new HandlerError(403, "ELEVATED_APPROVAL_REQUIRED", {
      thresholdKobo: HIGH_VALUE_REFUND_THRESHOLD_KOBO,
      required: "finance:refund_approve_high",
    });
  }

  // The ledger moves HERE, once. A negative payment row via B4's reversal
  // mechanism, so the original payment keeps its amount and the refund is a
  // visible line rather than an edit.
  let paymentReversalId: string | null = null;
  if (refund.paymentId) {
    const outcome = voidPayment(refund.paymentId, {
      reasonCode: "guest_dispute",
      reasonNote: `Refund ${refund.refundNumber} — ${refund.reason}`.slice(0, 500),
      amountKobo: approvedAmountKobo,
      actorUserId: input.actorUserId,
      branchId: input.branchId,
    });
    paymentReversalId = outcome.reversalId;
  }

  const now = new Date();
  db.update(refunds).set({
    status: "completed",
    approvedAmountKobo,
    approvedBy: input.actorUserId,
    approvedAt: now,
    completedAt: now,
    gatewayReference: input.gatewayReference ?? null,
    paymentReversalId,
  }).where(eq(refunds.id, refundId)).run();

  return {
    refundId,
    refundNumber: refund.refundNumber,
    approvedAmountKobo,
    paymentReversalId,
    folio: refund.reservationId ? folioSummary(refund.reservationId) : null,
  };
}

export function rejectRefund(refundId: string, branchId: string, actorUserId: string, reason: string) {
  const refund = db.select().from(refunds).where(eq(refunds.id, refundId)).get();
  if (!refund || refund.branchId !== branchId) throw new HandlerError(404, "REFUND_NOT_FOUND");
  if (refund.status !== "requested") throw new HandlerError(409, "INVALID_STATUS", { status: refund.status });
  if (!reason.trim()) throw new HandlerError(400, "REJECTION_REASON_REQUIRED");

  db.update(refunds).set({
    status: "rejected",
    approvedBy: actorUserId,
    approvedAt: new Date(),
    rejectionReason: reason,
  }).where(eq(refunds.id, refundId)).run();

  return db.select().from(refunds).where(eq(refunds.id, refundId)).get()!;
}

export function listRefunds(branchId: string, filters: { status?: string; from?: Date; to?: Date }) {
  let rows = db.select().from(refunds).where(eq(refunds.branchId, branchId)).all();
  if (filters.status) rows = rows.filter(r => r.status === filters.status);
  if (filters.from) rows = rows.filter(r => r.businessDate >= filters.from!);
  if (filters.to) rows = rows.filter(r => r.businessDate <= filters.to!);
  return rows.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
}

export function refundDetail(refundId: string) {
  const refund = db.select().from(refunds).where(eq(refunds.id, refundId)).get()!;
  const guest = refund.guestId
    ? db.select().from(guests).where(eq(guests.id, refund.guestId)).get() ?? null
    : null;
  const deductions = JSON.parse(refund.deductionsJson) as Deduction[];
  const deductionTotal = deductions.length > 0 ? addKobo(...deductions.map(d => d.amountKobo)) : 0;
  return {
    ...refund,
    deductions,
    deductionTotalKobo: deductionTotal,
    netAmountKobo: subKobo(refund.approvedAmountKobo ?? refund.requestedAmountKobo, deductionTotal),
    guest: guest ? { id: guest.id, name: `${guest.firstName} ${guest.lastName}`.trim() } : null,
    requiresElevatedApproval: refund.requestedAmountKobo >= HIGH_VALUE_REFUND_THRESHOLD_KOBO,
  };
}
