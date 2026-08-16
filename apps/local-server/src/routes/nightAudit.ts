// Backend Blueprint B5 — night audit endpoints.
//
// The audit is the day-close routine: it posts the night's room charges,
// resolves no-shows, freezes the day's revenue and rolls the business date.
// See services/nightAudit/ for the steps themselves.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { branches, nightAuditRuns, dailyRevenue, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { transaction } from "../db/tx.js";
import { HandlerError, isHandlerError } from "../lib/handlerError.js";
import { logAudit } from "../services/audit.js";
import {
  runNightAudit, runPreflight, pendingNightCount, getBranch, computeDailyTotals,
} from "../services/nightAudit/index.js";
import {
  businessDateOf, expectedBusinessDate, formatBusinessDate,
} from "../lib/businessDate.js";

const router = Router();

function parseBusinessDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : businessDateOf(d);
}

// GET /night-audit/status -- what date the property is on, how far behind
// it is, and what the preflight currently says.
router.get("/status", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const branch = getBranch(branchId);
  if (!branch) return res.status(404).json({ error: "BRANCH_NOT_FOUND" });

  const currentBusinessDate = businessDateOf(branch.currentBusinessDate);
  const pending = pendingNightCount(branchId);
  const preflight = runPreflight(branchId, currentBusinessDate);
  const lastRun = db.select().from(nightAuditRuns)
    .where(eq(nightAuditRuns.branchId, branchId))
    .orderBy(desc(nightAuditRuns.startedAt)).limit(1).get();

  res.json({
    businessDate: formatBusinessDate(currentBusinessDate),
    expectedBusinessDate: formatBusinessDate(expectedBusinessDate(branch.businessDateRollHour)),
    rollHour: branch.businessDateRollHour,
    pendingNights: pending,
    checklist: {
      blocking: preflight.blocking.length,
      warnings: preflight.warnings.length,
      canRun: preflight.canRun,
    },
    lastRun: lastRun ? {
      id: lastRun.id, status: lastRun.status,
      businessDate: formatBusinessDate(lastRun.businessDate),
      startedAt: lastRun.startedAt, completedAt: lastRun.completedAt,
    } : null,
  });
});

// POST /night-audit/preflight -- the full checklist, without running.
router.post("/preflight", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const branch = getBranch(branchId);
  if (!branch) return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
  const businessDate = parseBusinessDate(req.body?.businessDate) ?? businessDateOf(branch.currentBusinessDate);
  res.json(runPreflight(branchId, businessDate));
});

const runSchema = z.object({
  businessDate: z.string().optional(),
  // Acknowledges the preflight warnings. Present so the UI can require a
  // deliberate confirmation; nothing is blocking today (see preflight.ts).
  resolutions: z.array(z.string()).optional(),
});

// POST /night-audit/run -- closes every date that is due, oldest first.
router.post("/run", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const branchId = req.auth!.branchId;
  const branch = getBranch(branchId);
  if (!branch) return res.status(404).json({ error: "BRANCH_NOT_FOUND" });

  const results = runNightAudit(branchId, {
    operatorUserId: req.auth!.userId,
    ipAddress: req.ip,
  });

  if (results.length === 0) {
    return res.status(409).json({
      error: "NOTHING_DUE",
      businessDate: formatBusinessDate(businessDateOf(branch.currentBusinessDate)),
      message: "The current business date is not finished yet.",
    });
  }

  const failed = results.find(r => r.status === "failed");
  res.status(failed ? 500 : 200).json({
    datesProcessed: results.length,
    results,
    // Explicit, because "3 of 5 days closed" is the situation an operator
    // most needs to see clearly.
    remainingPendingNights: pendingNightCount(branchId),
  });
});

// GET /night-audit/runs?from&to
router.get("/runs", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const from = parseBusinessDate(req.query.from);
  const to = parseBusinessDate(req.query.to);

  const conditions = [eq(nightAuditRuns.branchId, branchId)];
  if (from) conditions.push(gte(nightAuditRuns.businessDate, from));
  if (to) conditions.push(lte(nightAuditRuns.businessDate, to));

  const rows = db.select().from(nightAuditRuns).where(and(...conditions))
    .orderBy(desc(nightAuditRuns.businessDate)).all();
  res.json(rows.map(r => ({
    id: r.id, businessDate: formatBusinessDate(r.businessDate), status: r.status,
    startedAt: r.startedAt, completedAt: r.completedAt, error: r.error,
    steps: JSON.parse(r.stepsJson),
  })));
});

router.get("/runs/:id", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const run = db.select().from(nightAuditRuns).where(and(
    eq(nightAuditRuns.id, req.params.id),
    eq(nightAuditRuns.branchId, req.auth!.branchId),
  )).get();
  if (!run) return res.status(404).json({ error: "NOT_FOUND" });

  const operator = run.operatorUserId
    ? db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, run.operatorUserId)).get()
    : null;

  res.json({
    id: run.id, businessDate: formatBusinessDate(run.businessDate), status: run.status,
    startedAt: run.startedAt, completedAt: run.completedAt, error: run.error,
    operator: operator ? `${operator.firstName} ${operator.lastName}` : "Scheduler",
    steps: JSON.parse(run.stepsJson),
    exceptions: JSON.parse(run.exceptionsJson),
    totals: run.totalsJson ? JSON.parse(run.totalsJson) : null,
  });
});

const reopenSchema = z.object({
  businessDate: z.string(),
  reason: z.string().min(1),
});

// POST /night-audit/reopen -- supersedes a closed day rather than editing
// it. The old daily_revenue row is kept and marked, never deleted: a report
// you can quietly rewrite is not a record (same discipline as B4's ledger).
router.post("/reopen", requireAuth, requirePermission("finance:reopen_day"), (req: AuthedRequest, res) => {
  const parsed = reopenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const businessDate = parseBusinessDate(parsed.data.businessDate);
  if (!businessDate) return res.status(400).json({ error: "INVALID_BUSINESS_DATE" });

  const branchId = req.auth!.branchId;
  try {
    const result = transaction(() => {
      const frozen = db.select().from(dailyRevenue).where(and(
        eq(dailyRevenue.branchId, branchId),
        eq(dailyRevenue.businessDate, businessDate),
      )).all().filter(r => r.supersededByRunId == null);
      if (frozen.length === 0) throw new HandlerError(404, "DAY_NOT_CLOSED");

      // The reopen is itself a run, so the supersession points at something
      // with an operator, a timestamp and a reason.
      const runId = nanoid();
      db.insert(nightAuditRuns).values({
        id: runId, branchId, businessDate, status: "rolled_back",
        startedAt: new Date(), completedAt: new Date(),
        operatorUserId: req.auth!.userId,
        stepsJson: JSON.stringify([{ name: "reopen", status: "completed", detail: parsed.data.reason }]),
        exceptionsJson: "[]",
      }).run();

      for (const row of frozen) {
        db.update(dailyRevenue).set({ supersededByRunId: runId }).where(eq(dailyRevenue.id, row.id)).run();
      }

      // Wind the business date back so the day can be re-audited.
      const branch = getBranch(branchId)!;
      if (businessDateOf(branch.currentBusinessDate) > businessDate) {
        db.update(branches).set({ currentBusinessDate: businessDate }).where(eq(branches.id, branchId)).run();
      }

      logAudit({
        userId: req.auth!.userId, branchId, action: "business_day_reopened", module: "Finance",
        recordId: runId,
        details: `${formatBusinessDate(businessDate)} reopened — ${parsed.data.reason} (${frozen.length} frozen row(s) superseded, none deleted)`,
        ipAddress: req.ip,
      });
      return { runId, supersededRows: frozen.length };
    });
    res.json({
      ok: true, ...result,
      businessDate: formatBusinessDate(businessDate),
      message: "Day reopened. Re-run the night audit to close it again.",
    });
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

// GET /night-audit/daily-revenue?from&to -- the frozen days themselves.
router.get("/daily-revenue", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const from = parseBusinessDate(req.query.from);
  const to = parseBusinessDate(req.query.to);

  const conditions = [eq(dailyRevenue.branchId, branchId)];
  if (from) conditions.push(gte(dailyRevenue.businessDate, from));
  if (to) conditions.push(lte(dailyRevenue.businessDate, to));

  const rows = db.select().from(dailyRevenue).where(and(...conditions))
    .orderBy(desc(dailyRevenue.businessDate)).all()
    .filter(r => r.supersededByRunId == null);
  res.json(rows.map(r => ({ ...r, businessDate: formatBusinessDate(r.businessDate) })));
});

export default router;
