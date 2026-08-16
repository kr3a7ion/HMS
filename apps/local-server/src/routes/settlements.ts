// Backend Blueprint B23 — settlement reconciliation endpoints.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { immediateTransaction } from "../db/tx.js";
import { isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";
import {
  listSettlements, markReconciled, recordSettlement, reconciliationReport,
} from "../services/payments/settlement.js";

const router = Router();

const recordSchema = z.object({
  gatewayId: z.string().nullable().optional(),
  batchReference: z.string().min(1).max(120),
  settlementDate: z.coerce.date(),
  grossKobo: z.number().int().nonnegative(),
  feeKobo: z.number().int().nonnegative(),
  netKobo: z.number().int(),
  transactionReferences: z.array(z.string()).default([]),
});

router.post("/", requireAuth, requirePermission("payments:reconcile"), (req: AuthedRequest, res) => {
  const parsed = recordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const outcome = recordSettlement({ ...parsed.data, branchId: req.auth!.branchId });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "settlement_recorded",
        module: "Finance", recordId: outcome.batchId,
        details: `${outcome.batchReference}: ${formatNaira(parsed.data.grossKobo)} gross, `
          + `${outcome.matchedCount} matched`
          + (outcome.reconciled ? ", clean" : `, VARIANCE ${formatNaira(outcome.varianceKobo)}`),
        ipAddress: req.ip,
      });
      return outcome;
    });
    res.status(201).json(result);
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

const signOffSchema = z.object({ notes: z.string().max(1000).optional() });

router.post("/:id/reconcile", requireAuth, requirePermission("payments:reconcile"), (req: AuthedRequest, res) => {
  const parsed = signOffSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const batch = immediateTransaction(() => {
      const result = markReconciled(req.params.id, req.auth!.branchId, req.auth!.userId, parsed.data.notes);
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "settlement_reconciled",
        module: "Finance", recordId: result.id,
        // Signing off ACKNOWLEDGES a variance; it never erases it.
        details: `${result.batchReference} signed off`
          + (result.varianceKobo !== 0 ? ` with variance ${formatNaira(result.varianceKobo)}` : ""),
        ipAddress: req.ip,
      });
      return result;
    });
    res.json(batch);
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

router.get("/", requireAuth, requirePermission("payments:reconcile", "finance:read"), (req: AuthedRequest, res) => {
  const { from, to } = req.query;
  res.json(listSettlements(req.auth!.branchId, {
    from: typeof from === "string" ? new Date(from) : undefined,
    to: typeof to === "string" ? new Date(to) : undefined,
  }));
});

router.get("/report", requireAuth, requirePermission("payments:reconcile", "finance:read"), (req: AuthedRequest, res) => {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date(Date.now() - 30 * 86_400_000);
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }
  res.json(reconciliationReport(req.auth!.branchId, from, to));
});

export default router;
