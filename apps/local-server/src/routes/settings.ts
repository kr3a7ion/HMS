// ST-01 Hotel/Property Configuration, ST-03 My Preferences.
//
// ST-02 Synchronization is now real -- see routes/sync.ts and
// services/sync.ts, built as part of Phase 3. ST-04 Door Lock Integration
// still stays mock -- needs a real TTLock API connection (Phase 4), not
// built here.
import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { branches, userPreferences, syncState, taxCodes, taxExemptions, cancellationPolicies } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { roleHasAnyPermission } from "../auth/permissions.js";
import { logAudit } from "../services/audit.js";
import { immediateTransaction, transaction } from "../db/tx.js";
import { HandlerError, isHandlerError } from "../lib/handlerError.js";
import { basisPointsToPercent, formatNaira, percentToBasisPoints } from "../lib/money.js";
import { computeTax } from "../services/tax/engine.js";
import { addDays, currentBusinessDate } from "../lib/businessDate.js";
import { effectiveTaxCodes, legacyTaxCodeId, syncLegacyTaxCode } from "../services/tax/branchDefaults.js";
import { DOCUMENT_TYPES, configureSequence, listSequences } from "../services/documents/sequence.js";
import { PENALTY_TYPES, listPolicies } from "../services/cancellation/policy.js";

const router = Router();
const MODULE_KEYS = ["restaurant", "inventory", "multiBranch", "doorLock"] as const;

// Blueprint 0.7: "The organization's plan tier is stored centrally and
// synced down to every branch's local server... Feature gating works
// correctly even in a fully offline branch." Effective modules are the
// intersection of this branch's own ST-01 toggle and whatever the central
// server's module licensing last said (Blueprint 0.6) -- if sync has never
// run, the branch works fully on its own local toggle alone (Blueprint 0.5
// step 8: operational before the first sync).
function serializeBranch(b: typeof branches.$inferSelect) {
  let localModules: string[] = [];
  try { localModules = JSON.parse(b.enabledModulesJson); } catch { /* malformed -- treat as none enabled */ }

  const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  let effectiveModules = localModules;
  if (state?.centralEnabledModulesJson) {
    try {
      const centralModules: string[] = JSON.parse(state.centralEnabledModulesJson);
      effectiveModules = localModules.filter(m => centralModules.includes(m));
    } catch { /* malformed central cache -- fall back to local toggle only */ }
  }

  // B6: the tax fields are reported from tax_codes, which is what actually
  // gets charged, rather than from the branch columns. They agree whenever
  // the Hotel Configuration screen is the only editor -- but a rate versioned
  // through /settings/tax-codes moves the code and not the column, and a
  // settings screen showing a rate the property is no longer charging is the
  // thing this whole batch exists to stop.
  const codes = effectiveTaxCodes(b.id);
  const primary = codes.find(c => c.id === legacyTaxCodeId(b.id))
    ?? codes.find(c => c.taxType === "vat")
    ?? null;

  return {
    ...b,
    enabledModulesJson: undefined,
    enabledModules: effectiveModules,
    localEnabledModules: localModules,
    taxName: primary?.name ?? b.taxName,
    // The screen speaks percent; the column and the code speak basis points.
    taxRate: basisPointsToPercent(primary?.rateBp ?? b.taxRateBp),
    taxInclusive: primary?.isInclusive ?? b.taxInclusive,
    // Everything in force, so a multi-jurisdiction setup is visible rather
    // than collapsed into the one field the old screen has room for.
    taxCodes: codes.map(c => ({
      id: c.id, code: c.code, name: c.name, jurisdiction: c.jurisdiction, taxType: c.taxType,
      ratePercent: basisPointsToPercent(c.rateBp), isInclusive: c.isInclusive,
      computationOrder: c.computationOrder,
    })),
  };
}

// GET is readable by any authenticated branch user -- the sidebar needs
// `enabledModules` to filter navigation regardless of the viewer's role,
// not just IT/MGT/ORG who can edit it.
router.get("/branch", requireAuth, (req: AuthedRequest, res) => {
  const branch = db.select().from(branches).where(eq(branches.id, req.auth!.branchId)).get();
  if (!branch) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(serializeBranch(branch));
});

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(), address: z.string().optional(), contactPhone: z.string().optional(), contactEmail: z.string().optional(),
  checkInTime: z.string().optional(), checkOutTime: z.string().optional(), currency: z.string().optional(), timezone: z.string().optional(),
  taxName: z.string().optional(), taxRate: z.number().nonnegative().optional(), taxInclusive: z.boolean().optional(),
  rateRounding: z.number().int().nonnegative().optional(), discountApprovalThreshold: z.number().nonnegative().optional(),
  enabledModules: z.array(z.enum(MODULE_KEYS)).optional(),
});

router.post("/branch", requireAuth, requirePermission("settings:branch"), (req: AuthedRequest, res) => {
  const parsed = updateBranchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const { enabledModules, taxRate, ...rest } = parsed.data;
  const branchId = req.auth!.branchId;

  // TWO REAL BUGS FIXED HERE, both B6.
  //
  // 1. `taxRate` arrives as a percentage (7.5) and the column is
  //    `tax_rate_bp` (750). The old spread wrote a key no column matches, so
  //    drizzle dropped it: saving the tax rate on the Hotel Configuration
  //    screen persisted nothing, and the field read back its old value.
  //
  // 2. Even once stored, nothing ever applied it. The property could
  //    configure "VAT 7.5%", see it saved, and no guest was ever charged
  //    VAT. The rate now writes through to this branch's tax code, which is
  //    what the posting paths actually compute from.
  const taxRateBp = taxRate === undefined ? undefined : percentToBasisPoints(taxRate);

  // The tax fields on this screen carry a stricter grant than the rest of
  // it. Everything else here is property configuration (IT's job); a tax
  // rate misbills every guest and is a FIRS compliance matter, so it needs
  // the same permission as /settings/tax-codes rather than riding along on
  // whoever can edit the check-out time. IT holds both, so this narrows
  // nothing in practice -- it just stops the control being incidental.
  const touchesTax = taxRateBp !== undefined || rest.taxName !== undefined || rest.taxInclusive !== undefined;
  if (touchesTax && !roleHasAnyPermission(req.auth!.role, ["settings:tax"])) {
    return res.status(403).json({
      error: "FORBIDDEN", required: "settings:tax",
      message: "Changing the property's tax settings requires the tax configuration permission.",
    });
  }

  transaction(() => {
    db.update(branches).set({
      ...rest,
      ...(taxRateBp !== undefined ? { taxRateBp } : {}),
      ...(enabledModules ? { enabledModulesJson: JSON.stringify(enabledModules) } : {}),
    }).where(eq(branches.id, branchId)).run();

    if (touchesTax) {
      const codeId = syncLegacyTaxCode(branchId);
      const branch = db.select().from(branches).where(eq(branches.id, branchId)).get()!;
      logAudit({
        userId: req.auth!.userId, branchId, action: "tax_code_updated", module: "Finance", recordId: codeId ?? branchId,
        details: `Property tax setting: ${branch.taxName} ${basisPointsToPercent(branch.taxRateBp)}% ${branch.taxInclusive ? "inclusive" : "exclusive"}${branch.taxRateBp > 0 ? "" : " (disabled)"}`,
        ipAddress: req.ip,
      });
    }

    logAudit({ userId: req.auth!.userId, branchId, action: "branch_settings_updated", module: "Settings", recordId: branchId, details: Object.keys(parsed.data).join(", "), ipAddress: req.ip });
  });

  const updated = db.select().from(branches).where(eq(branches.id, branchId)).get()!;
  res.json(serializeBranch(updated));
});


// ─── B6 Tax codes & exemptions ──────────────────────────────────────────────
//
// The tax_codes table is the authority. The three legacy branch columns
// (tax_name / tax_rate_bp / tax_inclusive) that the Hotel Configuration
// screen edits are written THROUGH to this branch's legacy VAT code above,
// so the screen keeps working and the two can never disagree. Anything
// multi-jurisdiction -- state consumption tax, a service charge -- can only
// be expressed here.

const JURISDICTIONS = ["federal", "state", "local"] as const;
const TAX_TYPES = ["vat", "consumption", "service_charge", "other"] as const;

function serializeTaxCode(t: typeof taxCodes.$inferSelect) {
  return {
    ...t,
    compoundsOnJson: undefined, appliesToJson: undefined,
    compoundsOn: safeJsonArray(t.compoundsOnJson),
    appliesTo: safeJsonArray(t.appliesToJson),
    ratePercent: basisPointsToPercent(t.rateBp),
  };
}

function safeJsonArray(text: string): string[] {
  try { const v = JSON.parse(text); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

router.get("/tax-codes", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const rows = db.select().from(taxCodes).where(eq(taxCodes.branchId, req.auth!.branchId)).all()
    .sort((a, b) => a.computationOrder - b.computationOrder || a.code.localeCompare(b.code));
  res.json(rows.map(serializeTaxCode));
});

const taxCodeSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(120),
  jurisdiction: z.enum(JURISDICTIONS),
  taxType: z.enum(TAX_TYPES),
  // Capped at 100%. Not an arbitrary limit: a rate above 100% means someone
  // typed basis points into a percentage field (or the reverse), and the
  // charge it produces would be visibly absurd on a guest's folio.
  rateBp: z.number().int().min(0).max(10_000),
  isInclusive: z.boolean().default(false),
  compoundsOn: z.array(z.string()).default([]),
  appliesTo: z.array(z.string()).default([]),
  computationOrder: z.number().int().min(0).max(10_000).default(100),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().nullable().optional(),
});

/**
 * Compounding may only reference codes that are computed EARLIER. The engine
 * runs a single forward pass, so a backward reference would silently
 * contribute zero -- a service charge that VAT was supposed to compound on
 * would be quietly untaxed, and the shortfall would only surface in an
 * FIRS audit.
 */
function validateCompoundsOn(branchId: string, compoundsOn: string[], order: number, selfId?: string) {
  for (const id of compoundsOn) {
    if (id === selfId) throw new HandlerError(400, "TAX_CODE_SELF_COMPOUND", { taxCodeId: id });
    const target = db.select().from(taxCodes).where(eq(taxCodes.id, id)).get();
    if (!target || target.branchId !== branchId) {
      throw new HandlerError(400, "TAX_CODE_NOT_FOUND", { taxCodeId: id });
    }
    if (target.computationOrder >= order) {
      throw new HandlerError(400, "TAX_CODE_COMPOUND_ORDER", {
        taxCodeId: id,
        message: `"${target.code}" is computed at order ${target.computationOrder}, which is not before ${order}. A tax can only compound on one computed earlier.`,
      });
    }
  }
}

router.post("/tax-codes", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const parsed = taxCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const branchId = req.auth!.branchId;

  try {
    const id = nanoid();
    const created = transaction(() => {
      validateCompoundsOn(branchId, d.compoundsOn, d.computationOrder);
      db.insert(taxCodes).values({
        id, branchId, code: d.code.toUpperCase(), name: d.name,
        jurisdiction: d.jurisdiction, taxType: d.taxType,
        rateBp: d.rateBp, isInclusive: d.isInclusive,
        compoundsOnJson: JSON.stringify(d.compoundsOn),
        appliesToJson: JSON.stringify(d.appliesTo),
        computationOrder: d.computationOrder,
        // Defaults to the START of the current trading day, not the wall
        // clock. Charges are effective-dated against the business date
        // (midnight of the trading day), so a code stamped with the current
        // time would not apply to anything posted today -- the operator adds
        // a service charge, posts a charge, and sees no service charge, with
        // nothing to explain why. Caught in live verification, not by a test.
        // A genuinely future rate is set explicitly.
        effectiveFrom: d.effectiveFrom ?? currentBusinessDate(branchId),
        effectiveTo: d.effectiveTo ?? null,
        isActive: true, createdAt: new Date(),
      }).run();
      logAudit({
        userId: req.auth!.userId, branchId, action: "tax_code_created", module: "Finance", recordId: id,
        details: `${d.code.toUpperCase()} ${basisPointsToPercent(d.rateBp)}% ${d.isInclusive ? "inclusive" : "exclusive"} (${d.jurisdiction})`,
        ipAddress: req.ip,
      });
      return db.select().from(taxCodes).where(eq(taxCodes.id, id)).get()!;
    });
    res.status(201).json(serializeTaxCode(created));
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

const patchTaxCodeSchema = taxCodeSchema.partial().extend({
  /** Required when the rate or inclusivity changes -- see below. */
  effectiveFrom: z.coerce.date().optional(),
});

/**
 * PATCH splits in two, and the split is the whole reason this endpoint is
 * not a plain UPDATE.
 *
 * A RATE CHANGE IS A NEW ROW. When VAT moves from 7.5% to 10%, editing the
 * existing row in place would make reprinting last month's invoice produce a
 * number the guest never paid. So the old row is closed at the changeover
 * and a new one opens -- which is also what lets the night audit recompute a
 * back-dated day correctly.
 *
 * Everything else (name, active flag, applicability, ordering) edits in
 * place: those describe how the code is used from now on, and the amounts
 * already posted are ledger rows that no edit here can reach.
 */
router.patch("/tax-codes/:id", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const parsed = patchTaxCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const branchId = req.auth!.branchId;

  const existing = db.select().from(taxCodes).where(eq(taxCodes.id, req.params.id)).get();
  if (!existing || existing.branchId !== branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const ratesChanged = (d.rateBp !== undefined && d.rateBp !== existing.rateBp)
    || (d.isInclusive !== undefined && d.isInclusive !== existing.isInclusive);

  try {
    const result = transaction(() => {
      const order = d.computationOrder ?? existing.computationOrder;
      if (d.compoundsOn) validateCompoundsOn(branchId, d.compoundsOn, order, existing.id);

      if (ratesChanged) {
        // Defaults to the start of the NEXT trading day. Today's charges
        // have already been posted at today's rate, and two rates inside one
        // business date means that day's revenue can never be reproduced
        // from its own numbers. A same-day change is therefore refused by
        // the guard below rather than quietly splitting the day.
        const changeover = d.effectiveFrom ?? addDays(currentBusinessDate(branchId), 1);
        if (changeover <= existing.effectiveFrom) {
          throw new HandlerError(400, "TAX_RATE_CHANGE_BACKDATED", {
            message: "A new rate must start after the one it replaces; back-dating would rewrite invoices already issued.",
          });
        }
        const id = nanoid();
        db.insert(taxCodes).values({
          id, branchId,
          code: (d.code ?? existing.code).toUpperCase(),
          name: d.name ?? existing.name,
          jurisdiction: d.jurisdiction ?? existing.jurisdiction,
          taxType: d.taxType ?? existing.taxType,
          rateBp: d.rateBp ?? existing.rateBp,
          isInclusive: d.isInclusive ?? existing.isInclusive,
          compoundsOnJson: JSON.stringify(d.compoundsOn ?? safeJsonArray(existing.compoundsOnJson)),
          appliesToJson: JSON.stringify(d.appliesTo ?? safeJsonArray(existing.appliesToJson)),
          computationOrder: order,
          effectiveFrom: changeover, effectiveTo: d.effectiveTo ?? null,
          isActive: true, createdAt: new Date(),
        }).run();
        // The old row stays active and readable; it simply stops applying at
        // the changeover. Deactivating it would break recomputation of the
        // days it governed.
        db.update(taxCodes).set({ effectiveTo: changeover, updatedAt: new Date() })
          .where(eq(taxCodes.id, existing.id)).run();
        logAudit({
          userId: req.auth!.userId, branchId, action: "tax_code_rate_changed", module: "Finance", recordId: id,
          details: `${existing.code}: ${basisPointsToPercent(existing.rateBp)}% -> ${basisPointsToPercent(d.rateBp ?? existing.rateBp)}% from ${changeover.toISOString().slice(0, 10)} (supersedes ${existing.id})`,
          ipAddress: req.ip,
        });
        return db.select().from(taxCodes).where(eq(taxCodes.id, id)).get()!;
      }

      db.update(taxCodes).set({
        ...(d.code !== undefined ? { code: d.code.toUpperCase() } : {}),
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.jurisdiction !== undefined ? { jurisdiction: d.jurisdiction } : {}),
        ...(d.taxType !== undefined ? { taxType: d.taxType } : {}),
        ...(d.compoundsOn !== undefined ? { compoundsOnJson: JSON.stringify(d.compoundsOn) } : {}),
        ...(d.appliesTo !== undefined ? { appliesToJson: JSON.stringify(d.appliesTo) } : {}),
        ...(d.computationOrder !== undefined ? { computationOrder: d.computationOrder } : {}),
        ...(d.effectiveTo !== undefined ? { effectiveTo: d.effectiveTo } : {}),
        updatedAt: new Date(),
      }).where(eq(taxCodes.id, existing.id)).run();
      logAudit({
        userId: req.auth!.userId, branchId, action: "tax_code_updated", module: "Finance", recordId: existing.id,
        details: Object.keys(d).join(", "), ipAddress: req.ip,
      });
      return db.select().from(taxCodes).where(eq(taxCodes.id, existing.id)).get()!;
    });
    res.json({ ...serializeTaxCode(result), supersededId: ratesChanged ? existing.id : undefined });
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

// Deactivation, not deletion. A deleted code would orphan every
// folio_charges row that references it, and those rows are the evidence of
// what was charged.
router.post("/tax-codes/:id/deactivate", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const existing = db.select().from(taxCodes).where(eq(taxCodes.id, req.params.id)).get();
  if (!existing || existing.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  db.update(taxCodes).set({ isActive: false, updatedAt: new Date() }).where(eq(taxCodes.id, existing.id)).run();
  logAudit({
    userId: req.auth!.userId, branchId: req.auth!.branchId, action: "tax_code_deactivated",
    module: "Finance", recordId: existing.id, details: existing.code, ipAddress: req.ip,
  });
  res.json(serializeTaxCode(db.select().from(taxCodes).where(eq(taxCodes.id, existing.id)).get()!));
});

// The blueprint's "worked example" endpoint. Its real job is to let whoever
// configures tax check the breakdown against a hand calculation BEFORE a
// guest is billed by it -- the ordering and compounding rules are exactly
// the kind of thing that looks right in a form and is wrong on a folio.
const previewSchema = z.object({
  amountKobo: z.number().int(),
  chargeCategory: z.string().min(1).default("Room"),
  on: z.coerce.date().optional(),
  exemptionTypes: z.array(z.string()).optional(),
  guestType: z.string().nullable().optional(),
  corporateAccountId: z.string().nullable().optional(),
  nights: z.number().int().nonnegative().optional(),
});

router.post("/tax-codes/preview", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;

  const computation = computeTax(d.amountKobo, {
    branchId: req.auth!.branchId,
    chargeCategory: d.chargeCategory,
    on: d.on,
    exemptionTypes: d.exemptionTypes,
    guestType: d.guestType ?? null,
    corporateAccountId: d.corporateAccountId ?? null,
    nights: d.nights,
  });

  res.json({
    ...computation,
    // The same figures a guest would see, so the worked example can be read
    // against a printed folio without converting anything by hand.
    display: {
      base: formatNaira(computation.baseKobo),
      lines: computation.lines.map(l => ({
        code: l.code, name: l.name, rate: `${basisPointsToPercent(l.rateBp)}%`,
        on: formatNaira(l.taxableBaseKobo), amount: formatNaira(l.amountKobo),
      })),
      taxTotal: formatNaira(computation.taxTotalKobo),
      total: formatNaira(computation.totalKobo),
    },
  });
});

const exemptionSchema = z.object({
  taxCodeId: z.string().min(1),
  exemptionType: z.enum(["guest_type", "corporate_account", "long_stay", "diplomatic"]),
  criteria: z.record(z.unknown()).default({}),
  requiresEvidence: z.boolean().default(true),
});

router.get("/tax-exemptions", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const rows = db.select().from(taxExemptions).where(eq(taxExemptions.branchId, req.auth!.branchId)).all();
  res.json(rows.map(r => ({ ...r, criteriaJson: undefined, criteria: JSON.parse(r.criteriaJson || "{}") })));
});

router.post("/tax-exemptions", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const parsed = exemptionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;

  const code = db.select().from(taxCodes).where(eq(taxCodes.id, d.taxCodeId)).get();
  if (!code || code.branchId !== req.auth!.branchId) return res.status(400).json({ error: "TAX_CODE_NOT_FOUND" });
  // A long-stay exemption is applied from the reservation itself rather than
  // a clerk ticking a box, so without a threshold it would apply to every
  // stay -- including a one-night one.
  if (d.exemptionType === "long_stay" && typeof d.criteria.minNights !== "number") {
    return res.status(400).json({ error: "LONG_STAY_NEEDS_MIN_NIGHTS", message: 'A long_stay exemption requires criteria.minNights.' });
  }

  const id = nanoid();
  db.insert(taxExemptions).values({
    id, branchId: req.auth!.branchId, taxCodeId: d.taxCodeId,
    exemptionType: d.exemptionType, criteriaJson: JSON.stringify(d.criteria),
    requiresEvidence: d.requiresEvidence, isActive: true, createdAt: new Date(),
  }).run();

  logAudit({
    userId: req.auth!.userId, branchId: req.auth!.branchId, action: "tax_exemption_created",
    module: "Finance", recordId: id, details: `${d.exemptionType} exempts ${code.code}`, ipAddress: req.ip,
  });
  const saved = db.select().from(taxExemptions).where(eq(taxExemptions.id, id)).get()!;
  res.status(201).json({ ...saved, criteriaJson: undefined, criteria: d.criteria });
});

router.patch("/tax-exemptions/:id", requireAuth, requirePermission("settings:tax"), (req: AuthedRequest, res) => {
  const parsed = exemptionSchema.partial().extend({ isActive: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const existing = db.select().from(taxExemptions).where(eq(taxExemptions.id, req.params.id)).get();
  if (!existing || existing.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  const d = parsed.data;

  db.update(taxExemptions).set({
    ...(d.exemptionType !== undefined ? { exemptionType: d.exemptionType } : {}),
    ...(d.criteria !== undefined ? { criteriaJson: JSON.stringify(d.criteria) } : {}),
    ...(d.requiresEvidence !== undefined ? { requiresEvidence: d.requiresEvidence } : {}),
    ...(d.isActive !== undefined ? { isActive: d.isActive } : {}),
  }).where(eq(taxExemptions.id, existing.id)).run();

  logAudit({
    userId: req.auth!.userId, branchId: req.auth!.branchId, action: "tax_exemption_updated",
    module: "Finance", recordId: existing.id, details: Object.keys(d).join(", "), ipAddress: req.ip,
  });
  const saved = db.select().from(taxExemptions).where(eq(taxExemptions.id, existing.id)).get()!;
  res.json({ ...saved, criteriaJson: undefined, criteria: JSON.parse(saved.criteriaJson || "{}") });
});

// ─── B7 Document sequences ──────────────────────────────────────────────────
//
// Only the PREFIX and PADDING are editable. next_number is deliberately not:
// moving it forward creates a permanent gap in the audit trail, and moving it
// back guarantees a duplicate number the moment the next document is issued.
// A property that needs to continue an existing paper series sets the prefix
// and starts from 1 under it, which stays gapless.
router.get("/document-sequences", requireAuth, requirePermission("settings:documents"), (req: AuthedRequest, res) => {
  res.json(listSequences(req.auth!.branchId));
});

const sequenceSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  prefix: z.string().min(1).max(32),
  padWidth: z.number().int().min(1).max(12).optional(),
});

router.patch("/document-sequences", requireAuth, requirePermission("settings:documents"), (req: AuthedRequest, res) => {
  const parsed = sequenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const branchId = req.auth!.branchId;

  try {
    // Creates the row if the type has never been used. Configuring an unused
    // series is the ONLY moment its prefix can safely be set, so refusing
    // here (as this first did) would leave the two on-demand types --
    // complaint and trip -- permanently stuck on their default prefix.
    const { row, issued } = configureSequence(
      branchId, parsed.data.documentType, parsed.data.prefix, parsed.data.padWidth,
    );
    logAudit({
      userId: req.auth!.userId, branchId, action: "document_sequence_updated",
      module: "Settings", recordId: row.id,
      details: `${parsed.data.documentType}: prefix "${parsed.data.prefix}"${issued > 0 ? ` (${issued} already issued)` : ""}`,
      ipAddress: req.ip,
    });
    res.json({ ...row, configured: true, issued });
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

// ─── B9 Cancellation policies ───────────────────────────────────────────────
router.get("/cancellation-policies", requireAuth, requirePermission("settings:cancellation", "reservations:cancel"), (req: AuthedRequest, res) => {
  res.json(listPolicies(req.auth!.branchId));
});

const policySchema = z.object({
  code: z.string().min(1).max(24).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  freeCancellationHours: z.number().int().min(0).max(8760).default(24),
  penaltyType: z.enum(PENALTY_TYPES).default("first_night"),
  penaltyValueBp: z.number().int().min(0).max(10_000).nullable().optional(),
  penaltyFixedKobo: z.number().int().nonnegative().nullable().optional(),
  noShowPenaltyType: z.enum(PENALTY_TYPES).default("first_night"),
  noShowPenaltyValueBp: z.number().int().min(0).max(10_000).nullable().optional(),
  noShowPenaltyFixedKobo: z.number().int().nonnegative().nullable().optional(),
});

/** A rule that needs a value it does not have would silently charge zero. */
function validatePolicyShape(d: Partial<z.infer<typeof policySchema>>): string | null {
  const pairs: Array<[string | undefined, number | null | undefined, number | null | undefined]> = [
    [d.penaltyType, d.penaltyValueBp, d.penaltyFixedKobo],
    [d.noShowPenaltyType, d.noShowPenaltyValueBp, d.noShowPenaltyFixedKobo],
  ];
  for (const [type, bp, fixed] of pairs) {
    if (type === "percentage" && (bp == null || bp <= 0)) return "PERCENTAGE_REQUIRES_VALUE";
    if (type === "fixed" && (fixed == null || fixed <= 0)) return "FIXED_REQUIRES_AMOUNT";
  }
  return null;
}

router.post("/cancellation-policies", requireAuth, requirePermission("settings:cancellation"), (req: AuthedRequest, res) => {
  const parsed = policySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const branchId = req.auth!.branchId;
  const code = parsed.data.code.toUpperCase();

  const problem = validatePolicyShape(parsed.data);
  if (problem) return res.status(400).json({ error: problem });

  if (db.select().from(cancellationPolicies).where(and(
    eq(cancellationPolicies.branchId, branchId), eq(cancellationPolicies.code, code),
  )).get()) return res.status(409).json({ error: "CODE_IN_USE" });

  const id = nanoid();
  db.insert(cancellationPolicies).values({
    id, branchId, ...parsed.data, code,
    penaltyValueBp: parsed.data.penaltyValueBp ?? null,
    penaltyFixedKobo: parsed.data.penaltyFixedKobo ?? null,
    noShowPenaltyValueBp: parsed.data.noShowPenaltyValueBp ?? null,
    noShowPenaltyFixedKobo: parsed.data.noShowPenaltyFixedKobo ?? null,
    isActive: true, createdAt: new Date(),
  }).run();

  logAudit({
    userId: req.auth!.userId, branchId, action: "cancellation_policy_created", module: "Settings",
    recordId: id, details: `${code} — ${parsed.data.penaltyType}, free for ${parsed.data.freeCancellationHours}h`,
    ipAddress: req.ip,
  });
  res.status(201).json(db.select().from(cancellationPolicies).where(eq(cancellationPolicies.id, id)).get()!);
});

const policyPatchSchema = policySchema.partial().omit({ code: true }).extend({
  isActive: z.boolean().optional(),
});

router.patch("/cancellation-policies/:id", requireAuth, requirePermission("settings:cancellation"), (req: AuthedRequest, res) => {
  const policy = db.select().from(cancellationPolicies).where(eq(cancellationPolicies.id, req.params.id)).get();
  if (!policy || policy.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = policyPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const problem = validatePolicyShape({ ...policy, ...parsed.data } as never);
  if (problem) return res.status(400).json({ error: problem });

  // Changing a policy only affects cancellations from here on: the penalty is
  // computed at the moment it is charged, so a stay already cancelled keeps
  // the charge it was given.
  db.update(cancellationPolicies).set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(cancellationPolicies.id, policy.id)).run();

  logAudit({
    userId: req.auth!.userId, branchId: req.auth!.branchId, action: "cancellation_policy_updated",
    module: "Settings", recordId: policy.id, details: Object.keys(parsed.data).join(", "), ipAddress: req.ip,
  });
  res.json(db.select().from(cancellationPolicies).where(eq(cancellationPolicies.id, policy.id)).get()!);
});

// ─── ST-03 My Preferences ───────────────────────────────────────────────────
function serializePrefs(p: typeof userPreferences.$inferSelect) {
  let notificationPrefs: Record<string, boolean> = {};
  try { notificationPrefs = JSON.parse(p.notificationPrefsJson); } catch { /* malformed -- treat as none set */ }
  return { ...p, notificationPrefsJson: undefined, notificationPrefs };
}

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const existing = db.select().from(userPreferences).where(eq(userPreferences.userId, req.auth!.userId)).get();
  if (existing) return res.json(serializePrefs(existing));
  // No row yet -- return schema defaults without writing one until the
  // user actually saves something.
  res.json({
    userId: req.auth!.userId, language: "en", dateFormat: "DD/MM/YYYY", timeFormat: "24h",
    notificationPrefs: { reservations: true, housekeeping: true, maintenance: true, finance: true, doorLock: true, chat: true, shiftHandover: true },
    updatedAt: null,
  });
});

const updatePrefsSchema = z.object({
  language: z.string().optional(), dateFormat: z.string().optional(), timeFormat: z.enum(["24h", "12h"]).optional(),
  notificationPrefs: z.record(z.boolean()).optional(),
});

const DEFAULT_NOTIFICATION_PREFS = { reservations: true, housekeeping: true, maintenance: true, finance: true, doorLock: true, chat: true, shiftHandover: true };

router.post("/me", requireAuth, (req: AuthedRequest, res) => {
  const parsed = updatePrefsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const existing = db.select().from(userPreferences).where(eq(userPreferences.userId, req.auth!.userId)).get();
  const now = new Date();
  // Merge against the existing row's prefs if there is one, otherwise the
  // schema defaults -- never against {}, or a first-ever partial update
  // would silently drop every category the caller didn't mention.
  const baseNotifications = existing ? JSON.parse(existing.notificationPrefsJson) : DEFAULT_NOTIFICATION_PREFS;
  const mergedNotifications = parsed.data.notificationPrefs
    ? JSON.stringify({ ...baseNotifications, ...parsed.data.notificationPrefs })
    : (existing?.notificationPrefsJson ?? JSON.stringify(DEFAULT_NOTIFICATION_PREFS));

  // Read-then-upsert on a per-user row: IMMEDIATE so two concurrent saves
  // cannot both miss the existing row and race on the primary key.
  immediateTransaction(() => {
    if (existing) {
      db.update(userPreferences).set({
        language: parsed.data.language ?? existing.language,
        dateFormat: parsed.data.dateFormat ?? existing.dateFormat,
        timeFormat: parsed.data.timeFormat ?? existing.timeFormat,
        notificationPrefsJson: mergedNotifications,
        updatedAt: now,
      }).where(eq(userPreferences.userId, req.auth!.userId)).run();
    } else {
      db.insert(userPreferences).values({
        userId: req.auth!.userId,
        language: parsed.data.language ?? "en",
        dateFormat: parsed.data.dateFormat ?? "DD/MM/YYYY",
        timeFormat: parsed.data.timeFormat ?? "24h",
        notificationPrefsJson: mergedNotifications,
        updatedAt: now,
      }).run();
    }
  });

  const saved = db.select().from(userPreferences).where(eq(userPreferences.userId, req.auth!.userId)).get()!;
  res.json(serializePrefs(saved));
});

export default router;
