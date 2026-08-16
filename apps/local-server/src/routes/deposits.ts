// Backend Blueprint B9 — deposits.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { immediateTransaction } from "../db/tx.js";
import { isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";
import {
  DEPOSIT_TYPES, depositLiabilityKobo, holdDeposit, listDeposits, releaseDeposit,
} from "../services/deposits.js";

const router = Router();

function fail(res: import("express").Response, err: unknown) {
  if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
  throw err;
}

const holdSchema = z.object({
  reservationId: z.string().min(1),
  amountKobo: z.number().int().positive(),
  depositType: z.enum(DEPOSIT_TYPES).optional(),
  method: z.enum(["cash", "card", "transfer"]),
});

router.post("/", requireAuth, requirePermission("deposits:manage"), (req: AuthedRequest, res) => {
  const parsed = holdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const deposit = immediateTransaction(() => {
      const held = holdDeposit({
        ...parsed.data,
        branchId: req.auth!.branchId,
        heldBy: req.auth!.userId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "deposit_held",
        module: "Finance", recordId: held.id,
        details: `${formatNaira(held.amountKobo)} ${held.method} — ${held.depositType} deposit (liability, not revenue)`,
        ipAddress: req.ip,
      });
      return held;
    });
    res.status(201).json(deposit);
  } catch (err) { return fail(res, err); }
});

const releaseSchema = z.object({
  applyKobo: z.number().int().nonnegative().optional(),
  refundKobo: z.number().int().nonnegative().optional(),
  forfeitKobo: z.number().int().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Apply / refund / forfeit. All three can happen at once, which is the common
 * real case at check-out: some covers the bill, some is kept for damage, the
 * rest goes back.
 */
router.post("/:id/release", requireAuth, requirePermission("deposits:manage"), (req: AuthedRequest, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const released = releaseDeposit(req.params.id, {
        ...parsed.data,
        branchId: req.auth!.branchId,
        actorUserId: req.auth!.userId,
      });
      const parts = [
        parsed.data.applyKobo ? `applied ${formatNaira(parsed.data.applyKobo)}` : null,
        parsed.data.refundKobo ? `refunded ${formatNaira(parsed.data.refundKobo)}` : null,
        parsed.data.forfeitKobo ? `forfeited ${formatNaira(parsed.data.forfeitKobo)}` : null,
      ].filter(Boolean).join(", ");
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "deposit_released",
        module: "Finance", recordId: released.deposit.id,
        details: `${parts} — ${formatNaira(released.outstandingKobo)} still held`
          + (parsed.data.notes ? ` — ${parsed.data.notes}` : ""),
        ipAddress: req.ip,
      });
      return released;
    });
    res.json(result);
  } catch (err) { return fail(res, err); }
});

// `apply` is the common single action, kept as its own path so the front desk
// has a one-call "put the deposit toward the bill" at check-out.
const applySchema = z.object({ amountKobo: z.number().int().positive().optional() });

router.post("/:id/apply", requireAuth, requirePermission("deposits:manage"), (req: AuthedRequest, res) => {
  const parsed = applySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const result = immediateTransaction(() => {
      const current = listDeposits(req.auth!.branchId).find(d => d.id === req.params.id);
      if (!current) return null;
      const released = releaseDeposit(req.params.id, {
        applyKobo: parsed.data.amountKobo ?? current.outstandingKobo,
        branchId: req.auth!.branchId,
        actorUserId: req.auth!.userId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "deposit_applied",
        module: "Finance", recordId: released.deposit.id,
        details: `${formatNaira(parsed.data.amountKobo ?? current.outstandingKobo)} applied to folio`,
        ipAddress: req.ip,
      });
      return released;
    });
    if (!result) return res.status(404).json({ error: "DEPOSIT_NOT_FOUND" });
    res.json(result);
  } catch (err) { return fail(res, err); }
});

router.get("/", requireAuth, requirePermission("deposits:manage", "finance:read"), (req: AuthedRequest, res) => {
  const { status, reservationId } = req.query;
  res.json({
    // The number a finance screen actually needs: what the property is
    // currently holding on behalf of guests.
    totalLiabilityKobo: depositLiabilityKobo(req.auth!.branchId),
    items: listDeposits(req.auth!.branchId, {
      status: typeof status === "string" ? status : undefined,
      reservationId: typeof reservationId === "string" ? reservationId : undefined,
    }),
  });
});

export default router;
