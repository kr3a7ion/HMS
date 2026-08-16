// Backend Blueprint B4 — folio view, voids and the reversal report.
//
// `:id` here is the reservation id: a folio IS a reservation's ledger, and
// inventing a separate folio entity would mean a second identifier for the
// same thing. The blueprint's `/folios/:id/...` shape is kept because that
// is what the UI and the OpenAPI spec are written against.
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { folioCharges, payments, reservations, guests, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { folioSummary } from "../services/folio.js";
import { voidFolioCharge, voidPayment, VOID_REASON_CODES } from "../services/ledger.js";
import { transaction } from "../db/tx.js";
import { HandlerError, isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";

const router = Router();

function loadReservationOrNull(id: string, branchId: string) {
  const reservation = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!reservation || reservation.branchId !== branchId) return null;
  return reservation;
}

// GET /folios/:id -- every line, reversals included. Nothing is filtered
// out: a folio that hides its reversals is exactly the thing this batch
// exists to prevent.
router.get("/:id", requireAuth, requirePermission("folio:read"), (req: AuthedRequest, res) => {
  const reservation = loadReservationOrNull(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });

  const guest = db.select().from(guests).where(eq(guests.id, reservation.guestId)).get();
  const summary = folioSummary(reservation.id);
  res.json({
    reservationId: reservation.id,
    guest,
    ...summary,
  });
});

const voidSchema = z.object({
  reasonCode: z.enum(VOID_REASON_CODES),
  reasonNote: z.string().max(500).optional(),
  // Omitted = void the whole remaining amount. Present = partial void.
  amountKobo: z.number().int().positive().optional(),
});

router.post("/:id/charges/:chargeId/void", requireAuth, requirePermission("folio:void"), (req: AuthedRequest, res) => {
  const reservation = loadReservationOrNull(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    // Reversal row + void metadata are one unit: a reversal without the
    // metadata, or metadata without the reversal, both leave the folio
    // saying something untrue.
    const result = transaction(() => {
      const charge = db.select().from(folioCharges).where(eq(folioCharges.id, req.params.chargeId)).get();
      if (!charge || charge.reservationId !== reservation.id) throw new HandlerError(404, "CHARGE_NOT_FOUND");

      const outcome = voidFolioCharge(req.params.chargeId, {
        reasonCode: parsed.data.reasonCode,
        reasonNote: parsed.data.reasonNote,
        amountKobo: parsed.data.amountKobo,
        actorUserId: req.auth!.userId,
        branchId: req.auth!.branchId,
      });

      // Both line ids, the amount and the reason -- the blueprint's
      // requirement, and what makes the audit row usable on its own.
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId,
        action: outcome.fullyVoided ? "folio_charge_voided" : "folio_charge_partially_voided",
        module: "Finance", recordId: charge.id,
        details: `${formatNaira(outcome.reversedAmountKobo)} of ${formatNaira(Math.abs(charge.amountKobo))} reversed (${parsed.data.reasonCode})`
          + ` — original ${charge.id}, reversal ${outcome.reversalId}`
          + (parsed.data.reasonNote ? ` — ${parsed.data.reasonNote}` : ""),
        ipAddress: req.ip,
      });
      return outcome;
    });
    res.status(201).json({ ...result, folio: folioSummary(reservation.id) });
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

router.post("/:id/payments/:paymentId/void", requireAuth, requirePermission("folio:void"), (req: AuthedRequest, res) => {
  const reservation = loadReservationOrNull(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = voidSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = transaction(() => {
      const payment = db.select().from(payments).where(eq(payments.id, req.params.paymentId)).get();
      if (!payment || payment.reservationId !== reservation.id) throw new HandlerError(404, "PAYMENT_NOT_FOUND");

      const outcome = voidPayment(req.params.paymentId, {
        reasonCode: parsed.data.reasonCode,
        reasonNote: parsed.data.reasonNote,
        amountKobo: parsed.data.amountKobo,
        actorUserId: req.auth!.userId,
        branchId: req.auth!.branchId,
      });

      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId,
        action: outcome.fullyVoided ? "payment_voided" : "payment_partially_voided",
        module: "Finance", recordId: payment.id,
        details: `${formatNaira(outcome.reversedAmountKobo)} of ${formatNaira(Math.abs(payment.amountKobo))} reversed (${parsed.data.reasonCode})`
          + ` — original ${payment.id}, reversal ${outcome.reversalId}`
          + (parsed.data.reasonNote ? ` — ${parsed.data.reasonNote}` : ""),
        ipAddress: req.ip,
      });
      return outcome;
    });
    res.status(201).json({ ...result, folio: folioSummary(reservation.id) });
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

export default router;
