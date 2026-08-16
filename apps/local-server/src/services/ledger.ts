// Backend Blueprint B4 — voids and reversals.
//
// THE RULE: a posted financial line is never changed. Correcting one means
// adding a NEW row with the opposite sign, pointing back at the original.
// The original keeps its amount forever, so the folio shows both what was
// charged and that it was unwound -- which is the difference between an
// auditable ledger and one where mistakes quietly disappear.
//
// The SQLite triggers from migration 0004 enforce this underneath, so even
// a bug here cannot rewrite a posted amount; the worst it can do is fail.
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { folioCharges, payments } from "../db/schema.js";
import { proportionKobo, subKobo } from "../lib/money.js";
import { currentBusinessDate } from "../lib/businessDate.js";
import { HandlerError } from "../lib/handlerError.js";

/**
 * Controlled list, per the blueprint. Free-text reasons are useless for the
 * fraud-detection view in `GET /reports/reversals` -- you cannot group by a
 * sentence. `other` exists as the honest escape hatch and is the one code
 * that requires a note.
 */
export const VOID_REASON_CODES = [
  "posting_error",
  "guest_dispute",
  "service_failure",
  "duplicate",
  "management_discretion",
  "test_transaction",
  "other",
] as const;
export type VoidReasonCode = typeof VOID_REASON_CODES[number];

export interface VoidResult {
  reversalId: string;
  reversedAmountKobo: number;
  remainingAmountKobo: number;
  fullyVoided: boolean;
  /**
   * Reversals posted against this charge's tax lines (B6). Empty for a
   * payment, or for a charge that carried no tax.
   */
  taxReversalIds?: string[];
  /** Tax reversed alongside the base. Part of what the guest gets back. */
  taxReversedKobo?: number;
}

interface VoidInput {
  reasonCode: VoidReasonCode;
  reasonNote?: string;
  /** Partial void. Omitted means void the whole remaining amount. */
  amountKobo?: number;
  actorUserId: string;
  branchId: string;
}

function validateAmount(originalKobo: number, alreadyReversedKobo: number, requestedKobo: number | undefined) {
  const remaining = subKobo(originalKobo, alreadyReversedKobo);
  if (remaining === 0) throw new HandlerError(409, "ALREADY_FULLY_VOIDED");

  const amount = requestedKobo ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new HandlerError(400, "INVALID_VOID_AMOUNT", { message: "amountKobo must be a positive integer number of kobo" });
  }
  // Guarding the sign as well as the size: reversing more than remains would
  // turn a correction into a credit the guest never earned.
  if (Math.sign(originalKobo) !== 0 && amount > Math.abs(remaining)) {
    throw new HandlerError(400, "VOID_EXCEEDS_REMAINING", { remainingKobo: remaining });
  }
  return { amount, remaining };
}

function requireNoteForOther(reasonCode: VoidReasonCode, note: string | undefined) {
  if (reasonCode === "other" && !note?.trim()) {
    throw new HandlerError(400, "VOID_NOTE_REQUIRED", { message: '"other" requires a reasonNote' });
  }
}

type ChargeRow = typeof folioCharges.$inferSelect;

/**
 * Reverses one folio_charges row. The mechanical half of a void, with no
 * opinion about tax lineage -- voidFolioCharge below is what decides which
 * rows get reversed together.
 */
function reverseChargeRow(
  original: ChargeRow,
  amount: number,
  input: VoidInput,
  parentReversalId: string | null,
): { reversalId: string; fullyVoided: boolean } {
  // The reversal carries the opposite sign of the original, so a reversed
  // credit works the same way as a reversed charge.
  const signedReversal = original.amountKobo >= 0 ? -amount : amount;
  const reversalId = nanoid();
  db.insert(folioCharges).values({
    id: reversalId,
    reservationId: original.reservationId,
    category: original.category,
    description: `Reversal — ${original.description}`,
    quantity: 1,
    unitPriceKobo: signedReversal,
    amountKobo: signedReversal,
    postedBy: input.actorUserId,
    postedAt: new Date(),
    businessDate: currentBusinessDate(input.branchId),
    isReversal: true,
    reversalOfId: original.id,
    voidReasonCode: input.reasonCode,
    voidReasonNote: input.reasonNote ?? null,
    // The reversal set mirrors the original set: a reversed tax line is
    // still a tax line, hanging off the reversal of the charge it taxed. A
    // reversal posted as an untyped `base` row would land in room revenue
    // and quietly understate the day's takings by the tax amount.
    chargeKind: original.chargeKind,
    taxCodeId: original.taxCodeId,
    parentChargeId: parentReversalId,
  }).run();

  const newReversedTotal = original.reversedAmountKobo + amount;
  const fullyVoided = newReversedTotal >= Math.abs(original.amountKobo);
  db.update(folioCharges).set({
    reversedAmountKobo: newReversedTotal,
    // voidedAt is set ONLY on a full void. Setting it on a partial one would
    // trip the append-only trigger and make any further partial void
    // impossible -- see the trigger's WHEN clause.
    ...(fullyVoided ? {
      voidedAt: new Date(),
      voidedBy: input.actorUserId,
      voidReasonCode: input.reasonCode,
      voidReasonNote: input.reasonNote ?? null,
    } : {}),
  }).where(eq(folioCharges.id, original.id)).run();

  return { reversalId, fullyVoided };
}

/**
 * Voids (all or part of) a folio charge, AND the tax lines that were posted
 * with it. Caller MUST wrap this in a transaction -- it does 2 + 2n writes
 * and they must not come apart.
 *
 * THE CASCADE IS THE POINT. Before B6 a charge was one row, so voiding it
 * was one reversal. Now a ₦50,000 room night is a ₦50,000 base row plus a
 * ₦3,750 VAT row, and reversing only the base would leave the guest paying
 * VAT on a charge that no longer exists -- the folio would not return to
 * zero, and the property would remit tax it never collected.
 *
 * A partial void reverses each tax line in proportion. The last void of a
 * charge sweeps whatever remains on each line, so repeated partial voids
 * still land exactly on zero rather than leaving a rounding crumb behind.
 */
export function voidFolioCharge(chargeId: string, input: VoidInput): VoidResult {
  const original = db.select().from(folioCharges).where(eq(folioCharges.id, chargeId)).get();
  if (!original) throw new HandlerError(404, "CHARGE_NOT_FOUND");
  if (original.isReversal) throw new HandlerError(409, "CANNOT_VOID_A_REVERSAL");
  if (original.parentChargeId) {
    // A tax line is not independently voidable: it exists because of the
    // charge it taxes. Reversing it alone would leave the base charge
    // standing untaxed, which is a different (and wrong) bill.
    throw new HandlerError(409, "CANNOT_VOID_TAX_LINE_DIRECTLY", {
      message: "Void the charge this tax line belongs to; its tax reverses with it.",
      parentChargeId: original.parentChargeId,
    });
  }

  requireNoteForOther(input.reasonCode, input.reasonNote);
  const { amount, remaining } = validateAmount(original.amountKobo, original.reversedAmountKobo, input.amountKobo);

  const { reversalId, fullyVoided } = reverseChargeRow(original, amount, input, null);

  const children = db.select().from(folioCharges)
    .where(eq(folioCharges.parentChargeId, original.id)).all()
    .filter(c => !c.isReversal);

  const taxReversalIds: string[] = [];
  let taxReversedKobo = 0;
  for (const child of children) {
    const childRemaining = Math.abs(child.amountKobo) - child.reversedAmountKobo;
    if (childRemaining <= 0) continue;
    // On the void that closes the parent, take everything left on the line.
    // Anything less would strand a kobo of tax on a fully-voided charge.
    const share = fullyVoided
      ? childRemaining
      : Math.min(childRemaining, proportionKobo(Math.abs(child.amountKobo), amount, Math.abs(original.amountKobo)));
    if (share <= 0) continue;
    const childResult = reverseChargeRow(child, share, input, reversalId);
    taxReversalIds.push(childResult.reversalId);
    taxReversedKobo += share;
  }

  return {
    reversalId,
    reversedAmountKobo: amount,
    remainingAmountKobo: remaining - amount,
    fullyVoided,
    taxReversalIds,
    taxReversedKobo,
  };
}

/** Same contract as voidFolioCharge, for a payment. */
export function voidPayment(paymentId: string, input: VoidInput): VoidResult {
  const original = db.select().from(payments).where(eq(payments.id, paymentId)).get();
  if (!original) throw new HandlerError(404, "PAYMENT_NOT_FOUND");
  if (original.isReversal) throw new HandlerError(409, "CANNOT_VOID_A_REVERSAL");

  requireNoteForOther(input.reasonCode, input.reasonNote);
  const { amount, remaining } = validateAmount(original.amountKobo, original.reversedAmountKobo, input.amountKobo);

  const signedReversal = original.amountKobo >= 0 ? -amount : amount;
  const reversalId = nanoid();
  db.insert(payments).values({
    id: reversalId,
    reservationId: original.reservationId,
    amountKobo: signedReversal,
    method: original.method,
    receivedBy: input.actorUserId,
    receivedAt: new Date(),
    businessDate: currentBusinessDate(input.branchId),
    isReversal: true,
    reversalOfId: original.id,
    voidReasonCode: input.reasonCode,
    voidReasonNote: input.reasonNote ?? null,
  }).run();

  const newReversedTotal = original.reversedAmountKobo + amount;
  const fullyVoided = newReversedTotal >= Math.abs(original.amountKobo);
  db.update(payments).set({
    reversedAmountKobo: newReversedTotal,
    ...(fullyVoided ? {
      voidedAt: new Date(),
      voidedBy: input.actorUserId,
      voidReasonCode: input.reasonCode,
      voidReasonNote: input.reasonNote ?? null,
    } : {}),
  }).where(eq(payments.id, original.id)).run();

  return {
    reversalId,
    reversedAmountKobo: amount,
    remainingAmountKobo: remaining - amount,
    fullyVoided,
  };
}
