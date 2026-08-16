// Backend Blueprint B9 — refunds.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { roleHasAnyPermission } from "../auth/permissions.js";
import { immediateTransaction } from "../db/tx.js";
import { isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import { formatNaira } from "../lib/money.js";
import {
  approveRefund, listRefunds, refundDetail, rejectRefund, requestRefund,
  HIGH_VALUE_REFUND_THRESHOLD_KOBO,
} from "../services/refunds.js";

const router = Router();

function fail(res: import("express").Response, err: unknown) {
  if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
  throw err;
}

const requestSchema = z.object({
  paymentId: z.string().nullable().optional(),
  reservationId: z.string().nullable().optional(),
  requestedAmountKobo: z.number().int().positive(),
  deductions: z.array(z.object({
    label: z.string().min(1).max(120),
    amountKobo: z.number().int().nonnegative(),
  })).optional(),
  reason: z.string().min(3).max(500),
  method: z.enum(["cash", "card", "transfer"]),
  methodOverrideReason: z.string().max(500).optional(),
});

router.post("/", requireAuth, requirePermission("finance:refund_request"), (req: AuthedRequest, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const created = requestRefund({
        ...parsed.data,
        branchId: req.auth!.branchId,
        requestedBy: req.auth!.userId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "refund_requested",
        module: "Finance", recordId: created.refundId,
        details: `${created.refundNumber} — ${formatNaira(parsed.data.requestedAmountKobo)} ${parsed.data.method} — ${parsed.data.reason}`,
        ipAddress: req.ip,
      });
      return created;
    });
    res.status(201).json({ ...result, detail: refundDetail(result.refundId) });
  } catch (err) { return fail(res, err); }
});

const approveSchema = z.object({
  approvedAmountKobo: z.number().int().positive().optional(),
  gatewayReference: z.string().max(120).optional(),
});

router.post("/:id/approve", requireAuth, requirePermission("finance:refund_approve"), (req: AuthedRequest, res) => {
  const parsed = approveSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  // The elevated grant is checked in the service, not here, so the threshold
  // rule lives beside the amount it applies to rather than being duplicated
  // at every call site.
  const hasElevatedGrant = roleHasAnyPermission(req.auth!.role, ["finance:refund_approve_high"]);

  try {
    const result = immediateTransaction(() => {
      const approved = approveRefund(req.params.id, {
        ...parsed.data,
        branchId: req.auth!.branchId,
        actorUserId: req.auth!.userId,
        hasElevatedGrant,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "refund_approved",
        module: "Finance", recordId: approved.refundId,
        details: `${approved.refundNumber} — ${formatNaira(approved.approvedAmountKobo)} approved`
          + (approved.paymentReversalId ? ` — ledger reversal ${approved.paymentReversalId}` : " — no linked payment"),
        ipAddress: req.ip,
      });
      return approved;
    });
    res.json({ ...result, detail: refundDetail(req.params.id) });
  } catch (err) { return fail(res, err); }
});

const rejectSchema = z.object({ reason: z.string().min(3).max(500) });

router.post("/:id/reject", requireAuth, requirePermission("finance:refund_approve"), (req: AuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const rejected = immediateTransaction(() => {
      const result = rejectRefund(req.params.id, req.auth!.branchId, req.auth!.userId, parsed.data.reason);
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "refund_rejected",
        module: "Finance", recordId: result.id,
        details: `${result.refundNumber} rejected — ${parsed.data.reason}`, ipAddress: req.ip,
      });
      return result;
    });
    res.json(refundDetail(rejected.id));
  } catch (err) { return fail(res, err); }
});

router.get("/", requireAuth, requirePermission("finance:read", "finance:refund_request"), (req: AuthedRequest, res) => {
  const { status, from, to } = req.query;
  res.json({
    thresholdKobo: HIGH_VALUE_REFUND_THRESHOLD_KOBO,
    items: listRefunds(req.auth!.branchId, {
      status: typeof status === "string" ? status : undefined,
      from: typeof from === "string" ? new Date(from) : undefined,
      to: typeof to === "string" ? new Date(to) : undefined,
    }),
  });
});

router.get("/:id", requireAuth, requirePermission("finance:read", "finance:refund_request"), (req: AuthedRequest, res) => {
  const rows = listRefunds(req.auth!.branchId, {});
  if (!rows.some(r => r.id === req.params.id)) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(refundDetail(req.params.id));
});

export default router;
