// Backend Blueprint B9 — deposits as a liability.
//
// A DEPOSIT IS NOT A PAYMENT, and this is the whole reason the table exists.
// When a guest pays ₦50,000 to hold a room next month, the hotel has not
// earned ₦50,000 — it is holding someone else's money, and it owes that money
// back unless and until something entitles it to keep some. Putting it
// straight onto the folio as a payment would book unearned income, overstate
// the day's takings, and make a full refund look like unwinding a sale that
// never happened.
//
// THREE OUTCOMES, THREE DIFFERENT ENTRIES:
//   APPLIED    → the liability becomes settlement. A folio payment is created
//                referencing the deposit.
//   REFUNDED   → the liability is discharged. Money goes back out.
//   FORFEITED  → the liability becomes revenue. A folio charge is posted, so
//                it lands in the day's income where it belongs.
//
// A single "released" flag would collapse three different journal entries into
// one and make the liability balance unauditable.
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { deposits, payments, reservations } from "../db/schema.js";
import { addKobo, subKobo, type Kobo } from "../lib/money.js";
import { currentBusinessDate } from "../lib/businessDate.js";
import { HandlerError } from "../lib/handlerError.js";
import { postChargeWithTax } from "./tax/posting.js";

export const DEPOSIT_TYPES = ["reservation", "security", "incidental"] as const;
export const FORFEIT_CATEGORY = "Forfeited deposit";

export interface HoldDepositInput {
  branchId: string;
  reservationId: string;
  amountKobo: Kobo;
  depositType?: typeof DEPOSIT_TYPES[number];
  method: string;
  heldBy: string;
}

/**
 * Takes a deposit. CALLER MUST WRAP IN immediateTransaction.
 *
 * NOTE ON WHAT IS DELIBERATELY *NOT* DONE HERE: no folio payment row is
 * created. The money is recorded against the deposit, not the stay, precisely
 * so it does not reduce the guest's folio balance before they have stayed.
 */
export function holdDeposit(input: HoldDepositInput) {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw new HandlerError(400, "INVALID_AMOUNT");
  }
  const reservation = db.select().from(reservations).where(eq(reservations.id, input.reservationId)).get();
  if (!reservation || reservation.branchId !== input.branchId) throw new HandlerError(404, "RESERVATION_NOT_FOUND");

  const id = nanoid();
  db.insert(deposits).values({
    id,
    branchId: input.branchId,
    reservationId: reservation.id,
    guestId: reservation.guestId,
    depositType: input.depositType ?? "reservation",
    amountKobo: input.amountKobo,
    businessDate: currentBusinessDate(input.branchId),
    heldAt: new Date(),
    heldBy: input.heldBy,
    method: input.method,
    status: "held",
  }).run();

  return db.select().from(deposits).where(eq(deposits.id, id)).get()!;
}

/** How much of a deposit is still held — the live liability. */
export function outstandingKobo(deposit: typeof deposits.$inferSelect): Kobo {
  return subKobo(
    deposit.amountKobo,
    addKobo(deposit.appliedAmountKobo, deposit.refundedAmountKobo, deposit.forfeitedAmountKobo),
  );
}

function statusFor(deposit: typeof deposits.$inferSelect, outstanding: Kobo): string {
  if (outstanding > 0) {
    return deposit.appliedAmountKobo + deposit.refundedAmountKobo + deposit.forfeitedAmountKobo > 0
      ? "partially_refunded"
      : "held";
  }
  if (deposit.forfeitedAmountKobo > 0 && deposit.appliedAmountKobo === 0 && deposit.refundedAmountKobo === 0) return "forfeited";
  if (deposit.appliedAmountKobo > 0 && deposit.refundedAmountKobo === 0 && deposit.forfeitedAmountKobo === 0) return "applied";
  if (deposit.refundedAmountKobo > 0 && deposit.appliedAmountKobo === 0 && deposit.forfeitedAmountKobo === 0) return "refunded";
  // Mixed outcomes (part applied, part refunded) are legitimate and common:
  // the deposit covered some charges and the rest went back.
  return "partially_refunded";
}

export interface ReleaseDepositInput {
  branchId: string;
  /** Toward the guest's folio balance. */
  applyKobo?: Kobo;
  /** Back to the guest. Recorded here; the actual refund is a refunds row. */
  refundKobo?: Kobo;
  /** Kept by the property — becomes revenue. */
  forfeitKobo?: Kobo;
  notes?: string;
  actorUserId: string;
}

/**
 * Applies, refunds and/or forfeits part or all of a deposit.
 * CALLER MUST WRAP IN immediateTransaction.
 *
 * All three can happen at once, which is the common real case at check-out:
 * some covers the bill, some is kept for damage, the rest goes back.
 */
export function releaseDeposit(depositId: string, input: ReleaseDepositInput) {
  const deposit = db.select().from(deposits).where(eq(deposits.id, depositId)).get();
  if (!deposit || deposit.branchId !== input.branchId) throw new HandlerError(404, "DEPOSIT_NOT_FOUND");

  const applyKobo = input.applyKobo ?? 0;
  const refundKobo = input.refundKobo ?? 0;
  const forfeitKobo = input.forfeitKobo ?? 0;
  for (const [label, value] of [["apply", applyKobo], ["refund", refundKobo], ["forfeit", forfeitKobo]] as const) {
    if (!Number.isInteger(value) || value < 0) throw new HandlerError(400, "INVALID_AMOUNT", { field: label });
  }
  const total = addKobo(applyKobo, refundKobo, forfeitKobo);
  if (total === 0) throw new HandlerError(400, "NOTHING_TO_RELEASE");

  const outstanding = outstandingKobo(deposit);
  if (total > outstanding) {
    // Releasing more than is held would create money. The liability is the
    // ceiling, always.
    throw new HandlerError(400, "EXCEEDS_HELD_AMOUNT", { outstandingKobo: outstanding });
  }

  let paymentId: string | null = null;
  let forfeitChargeId: string | null = null;

  if (applyKobo > 0) {
    if (!deposit.reservationId) throw new HandlerError(409, "DEPOSIT_HAS_NO_FOLIO");
    // NOW it becomes a folio payment: the guest has stayed, and the liability
    // converts into settlement of a real bill.
    paymentId = nanoid();
    db.insert(payments).values({
      id: paymentId,
      reservationId: deposit.reservationId,
      amountKobo: applyKobo,
      method: deposit.method,
      receivedBy: input.actorUserId,
      receivedAt: new Date(),
      businessDate: currentBusinessDate(input.branchId),
    }).run();
  }

  if (forfeitKobo > 0) {
    if (!deposit.reservationId) throw new HandlerError(409, "DEPOSIT_HAS_NO_FOLIO");
    // Forfeiting is the property KEEPING the money, which makes it revenue --
    // and therefore taxable, through the same engine as every other posting
    // path. Recording it only as a status change would leave earned income
    // out of the day's revenue entirely.
    const posted = postChargeWithTax({
      reservationId: deposit.reservationId,
      branchId: input.branchId,
      category: FORFEIT_CATEGORY,
      description: `Deposit forfeited${input.notes ? ` — ${input.notes}` : ""}`,
      quantity: 1,
      unitPriceKobo: forfeitKobo,
      amountKobo: forfeitKobo,
      postedBy: input.actorUserId,
      businessDate: currentBusinessDate(input.branchId),
    });
    forfeitChargeId = posted.chargeId;

    // The forfeited money settles the charge it just created, so the guest's
    // balance nets to zero rather than showing a bill they already paid.
    db.insert(payments).values({
      id: nanoid(),
      reservationId: deposit.reservationId,
      amountKobo: posted.totalKobo,
      method: deposit.method,
      receivedBy: input.actorUserId,
      receivedAt: new Date(),
      businessDate: currentBusinessDate(input.branchId),
    }).run();
  }

  const updated = {
    appliedAmountKobo: deposit.appliedAmountKobo + applyKobo,
    refundedAmountKobo: deposit.refundedAmountKobo + refundKobo,
    forfeitedAmountKobo: deposit.forfeitedAmountKobo + forfeitKobo,
  };
  const nextOutstanding = subKobo(
    deposit.amountKobo,
    addKobo(updated.appliedAmountKobo, updated.refundedAmountKobo, updated.forfeitedAmountKobo),
  );

  db.update(deposits).set({
    ...updated,
    status: statusFor({ ...deposit, ...updated }, nextOutstanding),
    ...(nextOutstanding === 0
      ? { releasedAt: new Date(), releasedBy: input.actorUserId, releaseNotes: input.notes ?? null }
      : {}),
  }).where(eq(deposits.id, depositId)).run();

  return {
    deposit: db.select().from(deposits).where(eq(deposits.id, depositId)).get()!,
    outstandingKobo: nextOutstanding,
    paymentId,
    forfeitChargeId,
  };
}

export function listDeposits(branchId: string, filters: { status?: string; reservationId?: string } = {}) {
  let rows = db.select().from(deposits).where(eq(deposits.branchId, branchId)).all();
  if (filters.status) rows = rows.filter(d => d.status === filters.status);
  if (filters.reservationId) rows = rows.filter(d => d.reservationId === filters.reservationId);
  return rows
    .map(d => ({ ...d, outstandingKobo: outstandingKobo(d) }))
    .sort((a, b) => b.heldAt.getTime() - a.heldAt.getTime());
}

/** Total liability the branch is currently carrying. */
export function depositLiabilityKobo(branchId: string): Kobo {
  const rows = db.select().from(deposits).where(eq(deposits.branchId, branchId)).all();
  return rows.length > 0 ? addKobo(...rows.map(outstandingKobo)) : 0;
}
