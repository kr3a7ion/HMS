// Backend Blueprint B7 — invoices, credit notes and invoice payments.
//
// Every write here runs in immediateTransaction, and that is not boilerplate:
// each one allocates a document number by read-then-write, so a deferred
// transaction could hand the same number to two invoices. The UNIQUE index on
// (branch_id, invoice_number) is the backstop, but the IMMEDIATE lock is what
// makes the second caller wait rather than fail.
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { invoices } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { immediateTransaction } from "../db/tx.js";
import { HandlerError, isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";
import {
  INVOICE_TYPES, issueInvoiceFromFolio, invoiceDetail, listInvoices, loadInvoice,
  voidInvoice, issueCreditNote, recordInvoicePayment,
} from "../services/documents/invoices.js";

const router = Router();

function fail(res: import("express").Response, err: unknown) {
  if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
  throw err;
}

const createSchema = z.object({
  reservationId: z.string().min(1),
  invoiceType: z.enum(INVOICE_TYPES).optional(),
  chargeIds: z.array(z.string()).optional(),
  billToName: z.string().min(1).max(200).optional(),
  billToAddress: z.string().max(500).optional(),
  billToTin: z.string().max(64).optional(),
  dueAt: z.coerce.date().nullable().optional(),
});

router.post("/", requireAuth, requirePermission("invoices:issue"), (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const issued = issueInvoiceFromFolio({
        ...parsed.data,
        branchId: req.auth!.branchId,
        issuedBy: req.auth!.userId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "invoice_issued",
        module: "Finance", recordId: issued.invoiceId,
        details: `${issued.invoiceNumber} — ${formatNaira(issued.totalKobo)}`,
        ipAddress: req.ip,
      });
      return issued;
    });
    res.status(201).json(invoiceDetail(result.invoiceId));
  } catch (err) { return fail(res, err); }
});

router.get("/", requireAuth, requirePermission("folio:read", "finance:read"), (req: AuthedRequest, res) => {
  const { status, from, to, search, reservationId } = req.query;
  res.json(listInvoices(req.auth!.branchId, {
    status: typeof status === "string" ? status : undefined,
    reservationId: typeof reservationId === "string" ? reservationId : undefined,
    from: typeof from === "string" ? new Date(from) : undefined,
    to: typeof to === "string" ? new Date(to) : undefined,
    search: typeof search === "string" ? search : undefined,
  }));
});

router.get("/:id", requireAuth, requirePermission("folio:read", "finance:read"), (req: AuthedRequest, res) => {
  const invoice = loadInvoice(req.params.id, req.auth!.branchId);
  if (!invoice) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(invoiceDetail(invoice.id));
});

const voidSchema = z.object({ reason: z.string().min(3).max(500) });

router.post("/:id/void", requireAuth, requirePermission("invoices:void"), (req: AuthedRequest, res) => {
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const voided = immediateTransaction(() => {
      const result = voidInvoice(req.params.id, {
        reason: parsed.data.reason,
        actorUserId: req.auth!.userId,
        branchId: req.auth!.branchId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "invoice_voided",
        module: "Finance", recordId: result.id,
        // The number is in the audit line on purpose: it is the thing
        // someone will be searching for when they ask where it went.
        details: `${result.invoiceNumber} voided — ${parsed.data.reason}`,
        ipAddress: req.ip,
      });
      return result;
    });
    res.json(invoiceDetail(voided.id));
  } catch (err) { return fail(res, err); }
});

const creditNoteSchema = z.object({
  reason: z.string().min(3).max(500),
  amountKobo: z.number().int().positive().optional(),
  approvedBy: z.string().nullable().optional(),
});

router.post("/:id/credit-note", requireAuth, requirePermission("invoices:credit_note"), (req: AuthedRequest, res) => {
  const parsed = creditNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const note = issueCreditNote(req.params.id, {
        reason: parsed.data.reason,
        amountKobo: parsed.data.amountKobo,
        approvedBy: parsed.data.approvedBy ?? null,
        actorUserId: req.auth!.userId,
        branchId: req.auth!.branchId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "credit_note_issued",
        module: "Finance", recordId: note.creditNoteId,
        details: `${note.creditNoteNumber} — ${formatNaira(note.amountKobo)} against ${note.invoice.invoiceNumber} — ${parsed.data.reason}`,
        ipAddress: req.ip,
      });
      return note;
    });
    res.status(201).json({ ...result, invoice: invoiceDetail(result.invoice.id) });
  } catch (err) { return fail(res, err); }
});

const paymentSchema = z.object({
  amountKobo: z.number().int().positive(),
  method: z.enum(["cash", "card", "transfer"]),
  reference: z.string().max(120).optional(),
});

router.post("/:id/payments", requireAuth, requirePermission("folio:postcharge", "finance:read"), (req: AuthedRequest, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const invoice = db.select().from(invoices).where(eq(invoices.id, req.params.id)).get();
      if (!invoice || invoice.branchId !== req.auth!.branchId) throw new HandlerError(404, "INVOICE_NOT_FOUND");

      const paid = recordInvoicePayment(req.params.id, {
        amountKobo: parsed.data.amountKobo,
        method: parsed.data.method,
        reference: parsed.data.reference,
        actorUserId: req.auth!.userId,
        branchId: req.auth!.branchId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "invoice_payment_recorded",
        module: "Finance", recordId: paid.receipt.id,
        details: `${formatNaira(parsed.data.amountKobo)} ${parsed.data.method} against ${invoice.invoiceNumber} — receipt ${paid.receipt.receiptNumber}`,
        ipAddress: req.ip,
      });
      return paid;
    });
    res.status(201).json({ ...result, invoice: invoiceDetail(result.invoice.id) });
  } catch (err) { return fail(res, err); }
});

export default router;
