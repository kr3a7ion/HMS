// Backend Blueprint B7 — invoice issuance, voiding and credit notes.
//
// AN INVOICE IS A SNAPSHOT, NOT A REPORT. Its lines copy the folio charges as
// they stood at issuance and never change again. The temptation is to render
// the invoice live from the folio every time it is fetched -- that is less
// code and it is wrong: a reversal posted next week would silently change a
// document the guest has already been handed and possibly paid, and the
// number on their copy would no longer match the number in the system.
//
// So corrections do not edit invoices. They produce a CREDIT NOTE, which is
// its own numbered document referencing the invoice it reduces. That is both
// the accounting convention and the only version that survives an audit.
import { nanoid } from "nanoid";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  invoices, invoiceLines, creditNotes, receipts,
  folioCharges, payments, reservations, guests, branches,
} from "../../db/schema.js";
import { addKobo, subKobo, type Kobo } from "../../lib/money.js";
import { currentBusinessDate } from "../../lib/businessDate.js";
import { HandlerError } from "../../lib/handlerError.js";
import { allocateNumber } from "./sequence.js";

export const INVOICE_TYPES = ["guest", "corporate", "group", "proforma"] as const;
export type InvoiceType = typeof INVOICE_TYPES[number];

export interface IssueInvoiceInput {
  branchId: string;
  reservationId: string;
  invoiceType?: InvoiceType;
  /** Specific folio charges to bill. Omitted means every un-invoiced one. */
  chargeIds?: string[];
  billToName?: string;
  billToAddress?: string;
  billToTin?: string;
  dueAt?: Date | null;
  issuedBy: string;
}

/** Charges already carried on a live (non-void) invoice for this folio. */
function alreadyInvoicedChargeIds(reservationId: string): Set<string> {
  const issued = db.select().from(invoices)
    .where(eq(invoices.reservationId, reservationId)).all()
    .filter(i => i.status !== "void");
  if (issued.length === 0) return new Set();

  const lines = db.select().from(invoiceLines)
    .where(inArray(invoiceLines.invoiceId, issued.map(i => i.id))).all();
  return new Set(lines.map(l => l.folioChargeId).filter((id): id is string => id != null));
}

/**
 * Issues an invoice from a folio.
 *
 * CALLER MUST WRAP THIS IN immediateTransaction. It allocates a document
 * number by read-then-write, and it writes 1 + n rows -- an invoice header
 * without its lines is a document claiming a total it cannot itemise.
 */
export function issueInvoiceFromFolio(input: IssueInvoiceInput) {
  const reservation = db.select().from(reservations)
    .where(eq(reservations.id, input.reservationId)).get();
  if (!reservation || reservation.branchId !== input.branchId) {
    throw new HandlerError(404, "RESERVATION_NOT_FOUND");
  }

  const invoiced = alreadyInvoicedChargeIds(reservation.id);
  let charges = db.select().from(folioCharges)
    .where(eq(folioCharges.reservationId, reservation.id)).all()
    .filter(c => !invoiced.has(c.id));

  if (input.chargeIds && input.chargeIds.length > 0) {
    const wanted = new Set(input.chargeIds);
    // Refuse rather than silently drop: a partial invoice the operator did
    // not ask for is worse than an error, because they would hand it over.
    for (const id of input.chargeIds) {
      if (invoiced.has(id)) throw new HandlerError(409, "CHARGE_ALREADY_INVOICED", { chargeId: id });
    }
    charges = charges.filter(c => wanted.has(c.id));
    if (charges.length !== wanted.size) throw new HandlerError(400, "CHARGE_NOT_ON_FOLIO");
  }

  if (charges.length === 0) throw new HandlerError(409, "NOTHING_TO_INVOICE");

  // Tax lines follow their parent so the printed document reads base-then-tax
  // rather than all charges then all VAT, which is what a guest can check.
  const order = new Map(charges.map((c, i) => [c.id, i]));
  charges.sort((a, b) => {
    const aKey = a.parentChargeId ?? a.id;
    const bKey = b.parentChargeId ?? b.id;
    if (aKey !== bKey) return (order.get(aKey) ?? 0) - (order.get(bKey) ?? 0);
    // Parent first, then its children in posting order.
    if (a.parentChargeId == null) return -1;
    if (b.parentChargeId == null) return 1;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });

  const guest = db.select().from(guests).where(eq(guests.id, reservation.guestId)).get();
  const businessDate = currentBusinessDate(input.branchId);
  const number = allocateNumber(input.branchId, "invoice");

  const subtotalKobo = addKobo(...charges.filter(c => c.chargeKind !== "tax").map(c => c.amountKobo));
  const taxTotalKobo = addKobo(...charges.filter(c => c.chargeKind === "tax").map(c => c.amountKobo));
  const totalKobo = addKobo(subtotalKobo, taxTotalKobo);

  const invoiceId = nanoid();
  db.insert(invoices).values({
    id: invoiceId,
    branchId: input.branchId,
    invoiceNumber: number.formatted,
    sequenceNumber: number.sequenceNumber,
    businessDate,
    invoiceType: input.invoiceType ?? "guest",
    reservationId: reservation.id,
    guestId: reservation.guestId,
    billToName: input.billToName
      ?? (guest ? `${guest.firstName} ${guest.lastName}`.trim() : "Guest"),
    billToAddress: input.billToAddress ?? null,
    billToTin: input.billToTin ?? null,
    issuedAt: new Date(),
    issuedBy: input.issuedBy,
    dueAt: input.dueAt ?? null,
    subtotalKobo, taxTotalKobo, totalKobo,
    // Payments already taken against this stay are NOT auto-applied here.
    // A payment is allocated to an invoice explicitly (POST
    // /invoices/:id/payments), because a folio can carry several invoices
    // and guessing which one a past payment settles would be inventing an
    // allocation nobody made.
    paidKobo: 0,
    balanceKobo: totalKobo,
    status: "issued",
  }).run();

  charges.forEach((charge, index) => {
    db.insert(invoiceLines).values({
      id: nanoid(),
      invoiceId,
      folioChargeId: charge.id,
      description: charge.description,
      chargeKind: charge.chargeKind,
      quantity: charge.quantity,
      unitPriceKobo: charge.unitPriceKobo,
      amountKobo: charge.amountKobo,
      taxCodeId: charge.taxCodeId,
      sortOrder: index,
    }).run();
  });

  return { invoiceId, invoiceNumber: number.formatted, sequenceNumber: number.sequenceNumber, totalKobo };
}

export function loadInvoice(invoiceId: string, branchId: string) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice || invoice.branchId !== branchId) return null;
  return invoice;
}

export function invoiceDetail(invoiceId: string) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
  const lines = db.select().from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId)).all()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const notes = db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).all();
  const receiptRows = db.select().from(receipts).where(eq(receipts.invoiceId, invoiceId)).all();
  const branch = db.select().from(branches).where(eq(branches.id, invoice.branchId)).get();
  return {
    ...invoice,
    lines,
    creditNotes: notes,
    receipts: receiptRows,
    creditedKobo: notes.length > 0 ? addKobo(...notes.map(n => n.amountKobo)) : 0,
    issuer: branch ? { name: branch.name, address: branch.address, phone: branch.contactPhone, email: branch.contactEmail } : null,
  };
}

/** Recomputes paid/balance/status from the receipts and credit notes on file. */
function refreshTotals(invoiceId: string) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
  if (invoice.status === "void") return invoice;

  const paidKobo = (() => {
    const rows = db.select().from(receipts).where(eq(receipts.invoiceId, invoiceId)).all();
    return rows.length > 0 ? addKobo(...rows.map(r => r.amountKobo)) : 0;
  })();
  const creditedKobo = (() => {
    const rows = db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).all();
    return rows.length > 0 ? addKobo(...rows.map(r => r.amountKobo)) : 0;
  })();

  const balanceKobo = subKobo(subKobo(invoice.totalKobo, paidKobo), creditedKobo);
  const status = balanceKobo <= 0
    ? (creditedKobo > 0 && paidKobo === 0 ? "credit_noted" : "paid")
    : (paidKobo > 0 || creditedKobo > 0 ? "partially_paid" : "issued");

  db.update(invoices).set({ paidKobo, balanceKobo, status })
    .where(eq(invoices.id, invoiceId)).run();
  return db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
}

export interface VoidInvoiceInput { reason: string; actorUserId: string; branchId: string }

/**
 * Voids an invoice. The NUMBER IS KEPT -- that is the point. A voided
 * invoice stays in the sequence, readable, with its reason attached, so the
 * answer to "where is number 47?" is never "it does not exist".
 */
export function voidInvoice(invoiceId: string, input: VoidInvoiceInput) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice || invoice.branchId !== input.branchId) throw new HandlerError(404, "INVOICE_NOT_FOUND");
  if (invoice.status === "void") throw new HandlerError(409, "ALREADY_VOID");
  if (invoice.paidKobo > 0) {
    // Money has changed hands against this document. Voiding it would leave
    // a receipt pointing at a document that claims it was never valid; the
    // correct instrument is a credit note.
    throw new HandlerError(409, "INVOICE_HAS_PAYMENTS", {
      paidKobo: invoice.paidKobo,
      message: "Raise a credit note instead: this invoice has payments recorded against it.",
    });
  }

  db.update(invoices).set({
    status: "void", voidedAt: new Date(), voidedBy: input.actorUserId,
    voidReason: input.reason, balanceKobo: 0,
  }).where(eq(invoices.id, invoiceId)).run();

  return db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
}

export interface CreditNoteInput {
  reason: string;
  amountKobo?: Kobo;
  actorUserId: string;
  approvedBy?: string | null;
  branchId: string;
}

/** Raises a numbered credit note against an invoice, reducing its balance. */
export function issueCreditNote(invoiceId: string, input: CreditNoteInput) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice || invoice.branchId !== input.branchId) throw new HandlerError(404, "INVOICE_NOT_FOUND");
  if (invoice.status === "void") throw new HandlerError(409, "INVOICE_VOID");

  const existing = db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).all();
  const alreadyCredited = existing.length > 0 ? addKobo(...existing.map(n => n.amountKobo)) : 0;
  const creditable = subKobo(invoice.totalKobo, alreadyCredited);

  const amountKobo = input.amountKobo ?? creditable;
  if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
    throw new HandlerError(400, "INVALID_CREDIT_AMOUNT");
  }
  if (amountKobo > creditable) {
    // Crediting more than was invoiced would hand the guest money the
    // document never asked them for.
    throw new HandlerError(400, "CREDIT_EXCEEDS_INVOICE", { creditableKobo: creditable });
  }

  const number = allocateNumber(input.branchId, "credit_note");
  const id = nanoid();
  db.insert(creditNotes).values({
    id, branchId: input.branchId,
    creditNoteNumber: number.formatted, sequenceNumber: number.sequenceNumber,
    invoiceId, businessDate: currentBusinessDate(input.branchId),
    reason: input.reason, amountKobo,
    issuedAt: new Date(), issuedBy: input.actorUserId,
    approvedBy: input.approvedBy ?? null,
  }).run();

  const updated = refreshTotals(invoiceId);
  return { creditNoteId: id, creditNoteNumber: number.formatted, amountKobo, invoice: updated };
}

export interface RecordPaymentInput {
  amountKobo: Kobo;
  method: string;
  reference?: string;
  actorUserId: string;
  branchId: string;
}

/**
 * Records a payment against an invoice: a folio payment row, and a numbered
 * receipt tying the two together.
 *
 * The payment lands on the FOLIO as well as the invoice because the folio is
 * the ledger -- an invoice payment that never reached it would leave the
 * guest's balance overstated and the day's takings understated.
 */
export function recordInvoicePayment(invoiceId: string, input: RecordPaymentInput) {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice || invoice.branchId !== input.branchId) throw new HandlerError(404, "INVOICE_NOT_FOUND");
  if (invoice.status === "void") throw new HandlerError(409, "INVOICE_VOID");
  if (!invoice.reservationId) throw new HandlerError(409, "INVOICE_HAS_NO_FOLIO");
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw new HandlerError(400, "INVALID_AMOUNT");
  }
  if (input.amountKobo > invoice.balanceKobo) {
    throw new HandlerError(400, "PAYMENT_EXCEEDS_BALANCE", { balanceKobo: invoice.balanceKobo });
  }

  const businessDate = currentBusinessDate(input.branchId);
  const paymentId = nanoid();
  db.insert(payments).values({
    id: paymentId,
    reservationId: invoice.reservationId,
    amountKobo: input.amountKobo,
    method: input.method,
    receivedBy: input.actorUserId,
    receivedAt: new Date(),
    businessDate,
  }).run();

  const receipt = issueReceiptForPayment({
    paymentId, branchId: input.branchId, invoiceId,
    actorUserId: input.actorUserId, reference: input.reference,
  });

  return { paymentId, receipt, invoice: refreshTotals(invoiceId) };
}

export interface IssueReceiptInput {
  paymentId: string;
  branchId: string;
  invoiceId?: string | null;
  actorUserId: string;
  reference?: string;
}

/**
 * Issues a numbered receipt for a payment.
 *
 * One receipt per payment, enforced by a UNIQUE index rather than only by
 * this check: two receipts for one payment is how a payment gets counted
 * twice in a cash reconciliation.
 */
export function issueReceiptForPayment(input: IssueReceiptInput) {
  const payment = db.select().from(payments).where(eq(payments.id, input.paymentId)).get();
  if (!payment) throw new HandlerError(404, "PAYMENT_NOT_FOUND");

  const reservation = db.select().from(reservations)
    .where(eq(reservations.id, payment.reservationId)).get();
  if (!reservation || reservation.branchId !== input.branchId) {
    throw new HandlerError(404, "PAYMENT_NOT_FOUND");
  }

  const existing = db.select().from(receipts).where(eq(receipts.paymentId, input.paymentId)).get();
  if (existing) throw new HandlerError(409, "RECEIPT_ALREADY_ISSUED", { receiptNumber: existing.receiptNumber });

  const number = allocateNumber(input.branchId, "receipt");
  const id = nanoid();
  db.insert(receipts).values({
    id, branchId: input.branchId,
    receiptNumber: number.formatted, sequenceNumber: number.sequenceNumber,
    paymentId: input.paymentId,
    invoiceId: input.invoiceId ?? null,
    businessDate: payment.businessDate,
    issuedAt: new Date(), issuedBy: input.actorUserId,
    amountKobo: payment.amountKobo, method: payment.method,
    reference: input.reference ?? null,
  }).run();

  return db.select().from(receipts).where(eq(receipts.id, id)).get()!;
}

/** Every invoice for a branch, filtered for the list screen. */
export function listInvoices(branchId: string, filters: {
  status?: string; from?: Date; to?: Date; search?: string; reservationId?: string;
}) {
  let rows = db.select().from(invoices).where(eq(invoices.branchId, branchId)).all();
  if (filters.status) rows = rows.filter(r => r.status === filters.status);
  if (filters.reservationId) rows = rows.filter(r => r.reservationId === filters.reservationId);
  if (filters.from) rows = rows.filter(r => r.businessDate >= filters.from!);
  if (filters.to) rows = rows.filter(r => r.businessDate <= filters.to!);
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter(r =>
      r.invoiceNumber.toLowerCase().includes(needle)
      || r.billToName.toLowerCase().includes(needle));
  }
  return rows.sort((a, b) => b.sequenceNumber - a.sequenceNumber);
}
