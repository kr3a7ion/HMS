// Backend Blueprint B7 — receipts.
//
// A receipt is issued FOR a payment that already exists, never instead of
// one. That direction matters: a receipt endpoint that created its own
// payment row would let someone hand a guest proof of a payment the ledger
// never recorded.
import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { receipts, payments, reservations, guests, invoices } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { immediateTransaction } from "../db/tx.js";
import { isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";
import { issueReceiptForPayment } from "../services/documents/invoices.js";

const router = Router();

const createSchema = z.object({
  paymentId: z.string().min(1),
  invoiceId: z.string().nullable().optional(),
  reference: z.string().max(120).optional(),
});

router.post("/", requireAuth, requirePermission("invoices:issue"), (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const receipt = immediateTransaction(() => {
      const issued = issueReceiptForPayment({
        paymentId: parsed.data.paymentId,
        invoiceId: parsed.data.invoiceId ?? null,
        reference: parsed.data.reference,
        branchId: req.auth!.branchId,
        actorUserId: req.auth!.userId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "receipt_issued",
        module: "Finance", recordId: issued.id,
        details: `${issued.receiptNumber} — ${formatNaira(issued.amountKobo)} ${issued.method}`,
        ipAddress: req.ip,
      });
      return issued;
    });
    res.status(201).json(receipt);
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

router.get("/", requireAuth, requirePermission("folio:read", "finance:read"), (req: AuthedRequest, res) => {
  res.json(
    db.select().from(receipts)
      .where(eq(receipts.branchId, req.auth!.branchId))
      .orderBy(desc(receipts.issuedAt)).all(),
  );
});

router.get("/:id", requireAuth, requirePermission("folio:read", "finance:read"), (req: AuthedRequest, res) => {
  const receipt = db.select().from(receipts).where(eq(receipts.id, req.params.id)).get();
  if (!receipt || receipt.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  // Everything a printed receipt needs, resolved here rather than by three
  // more round trips from whatever is rendering it.
  const payment = db.select().from(payments).where(eq(payments.id, receipt.paymentId)).get();
  const reservation = payment
    ? db.select().from(reservations).where(eq(reservations.id, payment.reservationId)).get()
    : null;
  const guest = reservation
    ? db.select().from(guests).where(eq(guests.id, reservation.guestId)).get()
    : null;
  const invoice = receipt.invoiceId
    ? db.select().from(invoices).where(eq(invoices.id, receipt.invoiceId)).get()
    : null;

  res.json({
    ...receipt,
    payment,
    guest: guest ? { id: guest.id, name: `${guest.firstName} ${guest.lastName}`.trim() } : null,
    invoice: invoice ? { id: invoice.id, invoiceNumber: invoice.invoiceNumber, totalKobo: invoice.totalKobo } : null,
  });
});

export default router;
