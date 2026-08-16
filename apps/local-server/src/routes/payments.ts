// Backend Blueprint B23 — payment endpoints.
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { paymentGateways, paymentTransactions } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { immediateTransaction } from "../db/tx.js";
import { isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";
import {
  activeGateway, initiatePayment, listTransactions,
  pendingVerification, upsertGateway, verifyPayment, providerFor,
} from "../services/payments/index.js";

const router = Router();

function fail(res: import("express").Response, err: unknown) {
  if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
  throw err;
}

const initiateSchema = z.object({
  reservationId: z.string().nullable().optional(),
  amountKobo: z.number().int().positive(),
  channel: z.enum(["card", "transfer", "ussd", "pos_terminal", "cash"]),
  /** Required: a retry must be recognisable as the same attempt. */
  idempotencyKey: z.string().min(8).max(128),
  provider: z.string().optional(),
  customerEmail: z.string().email().optional(),
  terminalId: z.string().optional(),
});

router.post("/initiate", requireAuth, requirePermission("payments:take"), async (req: AuthedRequest, res) => {
  const parsed = initiateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    // NOT wrapped in immediateTransaction: this awaits a network call to the
    // gateway, and holding SQLite's write lock across an HTTP round trip
    // would block every other write in the property for as long as the
    // gateway takes to answer. The idempotency UNIQUE index is what makes
    // that safe -- two concurrent retries cannot both insert.
    const result = await initiatePayment({
      ...parsed.data,
      branchId: req.auth!.branchId,
      actorUserId: req.auth!.userId,
    });

    if (!result.idempotentReplay) {
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "payment_initiated",
        module: "Finance", recordId: result.transactionId,
        details: `${formatNaira(parsed.data.amountKobo)} via ${parsed.data.channel} — ${result.status}`
          + (result.offline ? " (gateway unreachable, recorded offline)" : ""),
        ipAddress: req.ip,
      });
    }
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (err) { return fail(res, err); }
});

router.post("/:id/verify", requireAuth, requirePermission("payments:take"), async (req: AuthedRequest, res) => {
  try {
    const transaction = db.select().from(paymentTransactions)
      .where(eq(paymentTransactions.id, req.params.id)).get();
    if (!transaction || transaction.branchId !== req.auth!.branchId) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    const outcome = await verifyPayment(req.params.id, req.auth!.userId);
    if (outcome.changed) {
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "payment_verified",
        module: "Finance", recordId: outcome.transactionId,
        details: `${outcome.status} — ${outcome.detail}`, ipAddress: req.ip,
      });
    }
    res.json(outcome);
  } catch (err) { return fail(res, err); }
});

router.get("/transactions", requireAuth, requirePermission("payments:take", "finance:read"), (req: AuthedRequest, res) => {
  const { status, from, to } = req.query;
  res.json(listTransactions(req.auth!.branchId, {
    status: typeof status === "string" ? status : undefined,
    from: typeof from === "string" ? new Date(from) : undefined,
    to: typeof to === "string" ? new Date(to) : undefined,
  }));
});

/** Offline payments still awaiting confirmation — the reconnect worklist. */
router.get("/pending-verification", requireAuth, requirePermission("payments:take", "finance:read"), (req: AuthedRequest, res) => {
  res.json(pendingVerification(req.auth!.branchId));
});

const terminalSchema = z.object({
  amountKobo: z.number().int().positive(),
  terminalId: z.string().min(1),
  reservationId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});

router.post("/terminal/push", requireAuth, requirePermission("payments:take"), async (req: AuthedRequest, res) => {
  const parsed = terminalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const gateway = activeGateway(req.auth!.branchId);
  if (!gateway) return res.status(409).json({ error: "NO_PAYMENT_GATEWAY" });
  if (!providerFor(gateway).capabilities.supportsTerminal) {
    // Declared capability, not an attempt-and-see. Offering a button that
    // cannot work is worse than not offering it.
    return res.status(409).json({
      error: "TERMINAL_NOT_SUPPORTED",
      provider: gateway.provider,
      message: `${gateway.displayName} does not support pushing an amount to a POS terminal.`,
    });
  }

  try {
    const result = await initiatePayment({
      branchId: req.auth!.branchId,
      reservationId: parsed.data.reservationId ?? null,
      amountKobo: parsed.data.amountKobo,
      channel: "pos_terminal",
      idempotencyKey: parsed.data.idempotencyKey,
      terminalId: parsed.data.terminalId,
      actorUserId: req.auth!.userId,
    });
    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (err) { return fail(res, err); }
});

const gatewaySchema = z.object({
  provider: z.enum(["paystack", "flutterwave", "moniepoint", "manual", "fake"]),
  displayName: z.string().min(1).max(120),
  config: z.record(z.string()).optional(),
  supportsTerminal: z.boolean().optional(),
  supportsOnline: z.boolean().optional(),
  supportsRefund: z.boolean().optional(),
});

router.get("/gateways", requireAuth, requirePermission("settings:gateways"), (req: AuthedRequest, res) => {
  const rows = db.select().from(paymentGateways)
    .where(eq(paymentGateways.branchId, req.auth!.branchId)).all();
  // configEncrypted is NEVER echoed back — it holds the secret key that can
  // move money out of the property's account. The screen only needs to know
  // whether one is set.
  res.json(rows.map(({ configEncrypted, ...rest }) => ({
    ...rest,
    configured: Boolean(configEncrypted),
  })));
});

router.post("/gateways", requireAuth, requirePermission("settings:gateways"), (req: AuthedRequest, res) => {
  const parsed = gatewaySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = immediateTransaction(() => {
    const gatewayId = upsertGateway({ ...parsed.data, branchId: req.auth!.branchId });
    logAudit({
      userId: req.auth!.userId, branchId: req.auth!.branchId, action: "payment_gateway_configured",
      module: "Settings", recordId: gatewayId,
      // The secret itself never reaches the audit log.
      details: `${parsed.data.provider} (${parsed.data.displayName})`,
      ipAddress: req.ip,
    });
    return gatewayId;
  });
  res.status(201).json({ id });
});

export default router;
