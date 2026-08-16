// Backend Blueprint B23 — settlement reconciliation.
//
// WHAT THIS CATCHES. The gateway takes the money on Monday and pays it into
// the property's bank on Wednesday, minus a fee. Between those two events a
// transaction can be charged back, held for review, or silently dropped — and
// the ONLY signal a property gets is that the payout does not match what it
// recorded. Without this, a missing ₦85,000 looks exactly like a fee.
//
// VARIANCE IS SURFACED, NEVER ABSORBED. It would be easy to make the numbers
// agree by adjusting the recorded side to match the bank; that turns a
// detectable loss into a silent one. The batch records what the bank said,
// what the property expected, and the difference — and leaves the difference
// visible until a person accounts for it.
import { nanoid } from "nanoid";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { paymentTransactions, settlementBatches } from "../../db/schema.js";
import { addKobo, subKobo, type Kobo } from "../../lib/money.js";
import { HandlerError } from "../../lib/handlerError.js";

export interface RecordSettlementInput {
  branchId: string;
  gatewayId?: string | null;
  batchReference: string;
  settlementDate: Date;
  /** What the gateway says it paid out, before its fee. */
  grossKobo: Kobo;
  feeKobo: Kobo;
  netKobo: Kobo;
  /** The gateway references the payout claims to cover. */
  transactionReferences: string[];
}

export interface SettlementResult {
  batchId: string;
  batchReference: string;
  matchedCount: number;
  /** References the payout claims that this property has no record of. */
  unknownReferences: string[];
  /** Transactions we recorded as successful that the payout omits. */
  missingFromPayout: { id: string; gatewayReference: string | null; amountKobo: Kobo }[];
  expectedGrossKobo: Kobo;
  varianceKobo: Kobo;
  reconciled: boolean;
}

/**
 * Records a payout and compares it against what the property recorded.
 *
 * CALLER MUST WRAP IN immediateTransaction — it writes the batch and marks
 * every matched transaction settled, and those must not come apart.
 */
export function recordSettlement(input: RecordSettlementInput): SettlementResult {
  const existing = db.select().from(settlementBatches).where(and(
    eq(settlementBatches.branchId, input.branchId),
    eq(settlementBatches.batchReference, input.batchReference),
  )).get();
  if (existing) throw new HandlerError(409, "BATCH_ALREADY_RECORDED", { batchId: existing.id });

  const claimed = input.transactionReferences.filter(Boolean);
  const matched = claimed.length > 0
    ? db.select().from(paymentTransactions).where(and(
        eq(paymentTransactions.branchId, input.branchId),
        inArray(paymentTransactions.gatewayReference, claimed),
      )).all()
    : [];

  const matchedRefs = new Set(matched.map(t => t.gatewayReference));
  const unknownReferences = claimed.filter(r => !matchedRefs.has(r));

  // Successful, unsettled transactions in the payout's window that the payout
  // does NOT mention. This is the direction that finds a dropped payment.
  const windowStart = new Date(input.settlementDate.getTime() - 7 * 86_400_000);
  const missingFromPayout = db.select().from(paymentTransactions).where(and(
    eq(paymentTransactions.branchId, input.branchId),
    eq(paymentTransactions.status, "successful"),
    eq(paymentTransactions.settlementStatus, "unsettled"),
    gte(paymentTransactions.initiatedAt, windowStart),
    lte(paymentTransactions.initiatedAt, input.settlementDate),
  )).all()
    .filter(t => !matchedRefs.has(t.gatewayReference))
    .map(t => ({ id: t.id, gatewayReference: t.gatewayReference, amountKobo: t.amountKobo }));

  const expectedGrossKobo = matched.length > 0 ? addKobo(...matched.map(t => t.amountKobo)) : 0;
  const varianceKobo = subKobo(input.grossKobo, expectedGrossKobo);

  const batchId = nanoid();
  const notes: string[] = [];
  if (unknownReferences.length > 0) {
    notes.push(`${unknownReferences.length} reference(s) in the payout have no matching transaction here`);
  }
  if (missingFromPayout.length > 0) {
    notes.push(`${missingFromPayout.length} successful transaction(s) are absent from this payout`);
  }
  if (varianceKobo !== 0) {
    notes.push(`Gross differs from the sum of matched transactions by ${varianceKobo} kobo`);
  }

  db.insert(settlementBatches).values({
    id: batchId,
    branchId: input.branchId,
    gatewayId: input.gatewayId ?? null,
    batchReference: input.batchReference,
    settlementDate: input.settlementDate,
    grossKobo: input.grossKobo,
    feeKobo: input.feeKobo,
    netKobo: input.netKobo,
    transactionCount: matched.length,
    varianceKobo,
    varianceNotes: notes.length > 0 ? notes.join("; ") : null,
  }).run();

  // Mark what the payout genuinely covered. Deliberately NOT marking the
  // unmatched ones: a transaction stays unsettled until a payout actually
  // accounts for it, which is what keeps it in the next reconciliation's
  // "missing" list rather than quietly ageing out.
  for (const transaction of matched) {
    db.update(paymentTransactions).set({
      settlementStatus: "settled",
      settledAt: input.settlementDate,
      settlementReference: input.batchReference,
    }).where(eq(paymentTransactions.id, transaction.id)).run();
  }

  return {
    batchId,
    batchReference: input.batchReference,
    matchedCount: matched.length,
    unknownReferences,
    missingFromPayout,
    expectedGrossKobo,
    varianceKobo,
    // A clean batch is one where the money matches AND nothing is missing.
    // Either alone is not enough: the totals can agree while a chargeback and
    // an unexpected credit cancel out.
    reconciled: varianceKobo === 0 && unknownReferences.length === 0 && missingFromPayout.length === 0,
  };
}

export function markReconciled(batchId: string, branchId: string, actorUserId: string, notes?: string) {
  const batch = db.select().from(settlementBatches).where(eq(settlementBatches.id, batchId)).get();
  if (!batch || batch.branchId !== branchId) throw new HandlerError(404, "BATCH_NOT_FOUND");
  if (batch.reconciledAt) throw new HandlerError(409, "ALREADY_RECONCILED");

  // A batch WITH variance can still be signed off — a chargeback is a real
  // thing that happened. But the variance stays on the record: signing off
  // acknowledges it, it does not erase it.
  db.update(settlementBatches).set({
    reconciledAt: new Date(),
    reconciledBy: actorUserId,
    varianceNotes: notes
      ? `${batch.varianceNotes ? `${batch.varianceNotes}; ` : ""}Signed off: ${notes}`
      : batch.varianceNotes,
  }).where(eq(settlementBatches.id, batchId)).run();

  return db.select().from(settlementBatches).where(eq(settlementBatches.id, batchId)).get()!;
}

export function listSettlements(branchId: string, filters: { from?: Date; to?: Date } = {}) {
  let rows = db.select().from(settlementBatches).where(eq(settlementBatches.branchId, branchId)).all();
  if (filters.from) rows = rows.filter(b => b.settlementDate >= filters.from!);
  if (filters.to) rows = rows.filter(b => b.settlementDate <= filters.to!);
  return rows.sort((a, b) => b.settlementDate.getTime() - a.settlementDate.getTime());
}

/** The reconciliation report: what is settled, what is not, and what is off. */
export function reconciliationReport(branchId: string, from: Date, to: Date) {
  const transactions = db.select().from(paymentTransactions).where(and(
    eq(paymentTransactions.branchId, branchId),
    gte(paymentTransactions.initiatedAt, from),
    lte(paymentTransactions.initiatedAt, to),
  )).all();

  const successful = transactions.filter(t => t.status === "successful");
  const settled = successful.filter(t => t.settlementStatus === "settled");
  const unsettled = successful.filter(t => t.settlementStatus !== "settled");
  const batches = listSettlements(branchId, { from, to });

  const sum = (rows: typeof successful) => rows.length > 0 ? addKobo(...rows.map(t => t.amountKobo)) : 0;

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    transactionCount: transactions.length,
    successfulCount: successful.length,
    successfulKobo: sum(successful),
    settledCount: settled.length,
    settledKobo: sum(settled),
    // What the gateway is still holding. A number that only grows is the
    // signal that payouts have stopped arriving.
    awaitingSettlementCount: unsettled.length,
    awaitingSettlementKobo: sum(unsettled),
    feesKobo: settled.length > 0 ? addKobo(...settled.map(t => t.feeKobo)) : 0,
    pendingVerificationCount: transactions.filter(t => t.status === "pending_verification").length,
    batches: batches.map(b => ({
      id: b.id, reference: b.batchReference, settlementDate: b.settlementDate,
      grossKobo: b.grossKobo, feeKobo: b.feeKobo, netKobo: b.netKobo,
      varianceKobo: b.varianceKobo, varianceNotes: b.varianceNotes,
      reconciledAt: b.reconciledAt,
    })),
    totalVarianceKobo: batches.length > 0 ? addKobo(...batches.map(b => b.varianceKobo)) : 0,
  };
}
