// Backend Blueprint B8 — rate plans.
import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { ratePlans } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import { basisPointsToPercent } from "../lib/money.js";

const router = Router();

function serialize(plan: typeof ratePlans.$inferSelect) {
  return {
    ...plan,
    derivationPercent: plan.derivationType === "percentage" && plan.derivationValueBp != null
      ? basisPointsToPercent(plan.derivationValueBp) : null,
  };
}

router.get("/", requireAuth, requirePermission("rates:read", "rates:manage"), (req: AuthedRequest, res) => {
  res.json(
    db.select().from(ratePlans).where(eq(ratePlans.branchId, req.auth!.branchId)).all()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(serialize),
  );
});

const planSchema = z.object({
  code: z.string().min(1).max(24).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(1).max(120),
  planType: z.enum(["base", "derived", "corporate", "ota", "package"]).default("base"),
  derivedFromId: z.string().nullable().optional(),
  derivationType: z.enum(["percentage", "fixed_offset"]).nullable().optional(),
  /** Signed: -1500 is "15% off". Kobo for fixed_offset. */
  derivationValueBp: z.number().int().nullable().optional(),
  minStay: z.number().int().positive().nullable().optional(),
  maxStay: z.number().int().positive().nullable().optional(),
  advanceDaysMin: z.number().int().nonnegative().nullable().optional(),
  advanceDaysMax: z.number().int().nonnegative().nullable().optional(),
  includesBreakfast: z.boolean().default(false),
  isRefundable: z.boolean().default(true),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
});

/** A derived plan needs something to derive from, and a rule to derive by. */
function validateDerivation(d: z.infer<typeof planSchema>, branchId: string, selfId?: string): string | null {
  const derives = d.derivedFromId != null;
  if (!derives) return null;

  if (d.derivedFromId === selfId) return "PLAN_DERIVES_FROM_ITSELF";
  const base = db.select().from(ratePlans).where(eq(ratePlans.id, d.derivedFromId!)).get();
  if (!base || base.branchId !== branchId) return "BASE_PLAN_NOT_FOUND";
  // A chain of derivations is legal; a CYCLE is not, and resolveRate would
  // otherwise recurse until its depth guard fired and quietly returned no
  // rate at all -- a plan that silently prices nothing.
  let cursor: string | null = base.derivedFromId;
  for (let i = 0; i < 16 && cursor; i++) {
    if (cursor === selfId) return "DERIVATION_CYCLE";
    cursor = db.select().from(ratePlans).where(eq(ratePlans.id, cursor)).get()?.derivedFromId ?? null;
  }
  if (d.derivationType == null || d.derivationValueBp == null) return "DERIVATION_RULE_REQUIRED";
  return null;
}

router.post("/", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const branchId = req.auth!.branchId;
  const code = parsed.data.code.toUpperCase();

  if (db.select().from(ratePlans).where(and(eq(ratePlans.branchId, branchId), eq(ratePlans.code, code))).get()) {
    return res.status(409).json({ error: "CODE_IN_USE" });
  }
  const problem = validateDerivation(parsed.data, branchId);
  if (problem) return res.status(400).json({ error: problem });

  const id = nanoid();
  db.insert(ratePlans).values({
    id, branchId, ...parsed.data, code,
    derivedFromId: parsed.data.derivedFromId ?? null,
    derivationType: parsed.data.derivationType ?? null,
    derivationValueBp: parsed.data.derivationValueBp ?? null,
    effectiveFrom: parsed.data.effectiveFrom ?? new Date(0),
    effectiveTo: parsed.data.effectiveTo ?? null,
    isActive: true, createdAt: new Date(),
  }).run();

  logAudit({
    userId: req.auth!.userId, branchId, action: "rate_plan_created", module: "Settings",
    recordId: id, details: `${code} — ${parsed.data.name}`, ipAddress: req.ip,
  });
  res.status(201).json(serialize(db.select().from(ratePlans).where(eq(ratePlans.id, id)).get()!));
});

const patchSchema = planSchema.partial().omit({ code: true }).extend({ isActive: z.boolean().optional() });

router.patch("/:id", requireAuth, requirePermission("rates:manage"), (req: AuthedRequest, res) => {
  const plan = db.select().from(ratePlans).where(eq(ratePlans.id, req.params.id)).get();
  if (!plan || plan.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const merged = { ...plan, ...parsed.data } as z.infer<typeof planSchema>;
  const problem = validateDerivation(merged, req.auth!.branchId, plan.id);
  if (problem) return res.status(400).json({ error: problem });

  db.update(ratePlans).set(parsed.data).where(eq(ratePlans.id, plan.id)).run();
  logAudit({
    userId: req.auth!.userId, branchId: req.auth!.branchId, action: "rate_plan_updated",
    module: "Settings", recordId: plan.id, details: Object.keys(parsed.data).join(", "), ipAddress: req.ip,
  });
  res.json(serialize(db.select().from(ratePlans).where(eq(ratePlans.id, plan.id)).get()!));
});

export default router;
