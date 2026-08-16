// Backend Blueprint B6 — the tax engine.
//
// ONE function computes tax for the whole system. Every posting path calls
// it: night-audit room charges, manual folio charges, restaurant orders, and
// everything B15/B25 add later. The alternative -- each path applying "the
// branch tax rate" itself -- is how a hotel ends up charging VAT on the room
// but not on the minibar, and nobody notices for a year.
//
// THREE RULES THIS FILE ENFORCES
//
//   1. Tax is computed on an integer kobo base and returned as integer kobo
//      lines. lib/money.ts owns every rounding decision (mulRate,
//      extractInclusive); nothing here rounds on its own.
//
//   2. Ordering is explicit. Codes are applied by computation_order, and a
//      code that compounds on others includes their computed amounts in its
//      own base. Nigeria's service charge is applied first and is itself
//      VAT-able, which is exactly this mechanism -- not a special case.
//
//   3. An inclusive tax is EXTRACTED from the amount, never added to it, and
//      the extraction is exact: base + tax lines always equal the amount the
//      operator typed, to the kobo. See solveInclusiveBase below.
import { and, eq, isNull, lte, or, gt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { taxCodes, taxExemptions } from "../../db/schema.js";
import { addKobo, extractInclusive, mulRate, type Kobo } from "../../lib/money.js";

export type TaxCodeRow = typeof taxCodes.$inferSelect;

/** What the caller knows about the charge being taxed. */
export interface TaxContext {
  branchId: string;
  /** Folio charge category: "Room", "Restaurant", "Laundry"... */
  chargeCategory: string;
  /** Posting date -- selects the rate that was effective then. Defaults to now. */
  on?: Date;
  /**
   * Exemption claims recorded for this guest/stay ("diplomatic",
   * "corporate_account", ...). An exemption only suppresses a tax if it was
   * actually claimed; see exemptionApplies for the one exception.
   */
  exemptionTypes?: string[];
  guestType?: string | null;
  corporateAccountId?: string | null;
  /** Length of stay in nights, for long-stay exemptions. */
  nights?: number;
}

export interface TaxLine {
  taxCodeId: string;
  code: string;
  name: string;
  jurisdiction: string;
  taxType: string;
  rateBp: number;
  isInclusive: boolean;
  /** What this tax was computed on -- base plus any compounded amounts. */
  taxableBaseKobo: Kobo;
  amountKobo: Kobo;
  /** Which folio_charges.charge_kind the posted row gets. */
  chargeKind: "tax" | "service_charge";
  computationOrder: number;
}

export interface TaxComputation {
  /** The amount the caller passed in, before anything was extracted. */
  grossInputKobo: Kobo;
  /** Net base -- what the parent `base` folio row is posted at. */
  baseKobo: Kobo;
  lines: TaxLine[];
  taxTotalKobo: Kobo;
  /** baseKobo + taxTotalKobo. What the guest actually pays. */
  totalKobo: Kobo;
  /** Codes that would have applied but were suppressed by an exemption. */
  exemptedCodeIds: string[];
}

/** An empty result, for the (legitimate) case of a branch with no tax codes. */
function noTax(amountKobo: Kobo): TaxComputation {
  return {
    grossInputKobo: amountKobo, baseKobo: amountKobo, lines: [],
    taxTotalKobo: 0, totalKobo: amountKobo, exemptedCodeIds: [],
  };
}

function parseJsonArray(text: string): string[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    // A malformed applies_to/compounds_on must not take the posting path
    // down. Treated as "empty", which for applies_to means "all categories"
    // -- the conservative direction, since under-taxing is the failure that
    // reaches FIRS.
    return [];
  }
}

/**
 * Active codes for a branch, effective on `at`, that apply to `category`.
 *
 * Ordered by computation_order, then code, so the result is deterministic
 * even when two codes share an order -- a nondeterministic order would make
 * compounding results vary between runs on the same data.
 */
export function applicableTaxCodes(branchId: string, category: string, at: Date): TaxCodeRow[] {
  const rows = db.select().from(taxCodes).where(and(
    eq(taxCodes.branchId, branchId),
    eq(taxCodes.isActive, true),
    lte(taxCodes.effectiveFrom, at),
    or(isNull(taxCodes.effectiveTo), gt(taxCodes.effectiveTo, at)),
  )).all();

  return rows
    .filter(r => {
      const appliesTo = parseJsonArray(r.appliesToJson);
      return appliesTo.length === 0 || appliesTo.includes(category);
    })
    .sort((a, b) => a.computationOrder - b.computationOrder || a.code.localeCompare(b.code));
}

/**
 * Whether an exemption row suppresses its code for this context.
 *
 * THE RULE: an exemption applies when its criteria match AND its type was
 * claimed for this stay -- because "this guest is a diplomat" is a fact the
 * front desk records against evidence, not something the system can infer.
 *
 * `long_stay` is the one exception, and deliberately: the stay length is
 * already in the reservation, so requiring someone to also tick a box would
 * mean a 40-night guest gets charged the exemption they are entitled to
 * purely because nobody remembered.
 */
function exemptionApplies(
  exemption: typeof taxExemptions.$inferSelect,
  context: TaxContext,
): boolean {
  let criteria: Record<string, unknown> = {};
  try { criteria = JSON.parse(exemption.criteriaJson) as Record<string, unknown>; } catch { criteria = {}; }

  const minNights = typeof criteria.minNights === "number" ? criteria.minNights : null;
  if (minNights !== null && (context.nights ?? 0) < minNights) return false;

  const guestTypes = Array.isArray(criteria.guestTypes) ? criteria.guestTypes.map(String) : null;
  if (guestTypes && (!context.guestType || !guestTypes.includes(context.guestType))) return false;

  const accounts = Array.isArray(criteria.corporateAccountIds) ? criteria.corporateAccountIds.map(String) : null;
  if (accounts && (!context.corporateAccountId || !accounts.includes(context.corporateAccountId))) return false;

  const categories = Array.isArray(criteria.categories) ? criteria.categories.map(String) : null;
  if (categories && !categories.includes(context.chargeCategory)) return false;

  if (exemption.exemptionType === "long_stay") return minNights !== null;
  return (context.exemptionTypes ?? []).includes(exemption.exemptionType);
}

function exemptedCodeIds(context: TaxContext): Set<string> {
  const rows = db.select().from(taxExemptions).where(and(
    eq(taxExemptions.branchId, context.branchId),
    eq(taxExemptions.isActive, true),
  )).all();
  return new Set(rows.filter(e => exemptionApplies(e, context)).map(e => e.taxCodeId));
}

/**
 * One forward pass: given a net base, what does every code compute to?
 *
 * Compounding reads from `computed`, which only ever holds codes already
 * processed -- so a code can only compound on one that comes before it in
 * computation order. A forward reference silently contributes 0 rather than
 * throwing, because a half-posted charge is worse than a slightly-too-low
 * tax; the ordering is validated at configuration time instead
 * (see routes/settings.ts).
 */
function forwardPass(baseKobo: Kobo, codes: TaxCodeRow[]): Map<string, { amount: Kobo; taxableBase: Kobo }> {
  const computed = new Map<string, { amount: Kobo; taxableBase: Kobo }>();
  for (const code of codes) {
    const compoundedKobo = parseJsonArray(code.compoundsOnJson)
      .reduce((sum, id) => sum + (computed.get(id)?.amount ?? 0), 0);
    const taxableBase = baseKobo + compoundedKobo;
    computed.set(code.id, { amount: mulRate(taxableBase, code.rateBp), taxableBase });
  }
  return computed;
}

/**
 * Finds the integer base that an inclusive gross amount decomposes into.
 *
 * WHY A SEARCH AND NOT A FORMULA. The closed form (base = gross x 10000 /
 * (10000 + rate)) is exact for ONE inclusive tax and only approximate once
 * taxes compound on each other, because the effective aggregate rate stops
 * being a whole number of basis points. Rather than carry a scaled-integer
 * coefficient and argue about its precision, this estimates the base with
 * the closed form and then walks a few kobo either way, testing each
 * candidate with the same exact forward pass used for posting.
 *
 * The result is that base + inclusive tax lines equals the operator's amount
 * exactly, for any configuration, with no approximation anywhere in the
 * money path. If no candidate lands exactly (possible: f() can step by more
 * than one kobo), the closest base at or below the target is chosen and the
 * caller absorbs the residual into the last inclusive line.
 */
function solveInclusiveBase(grossKobo: Kobo, codes: TaxCodeRow[], inclusiveIds: Set<string>): Kobo {
  const inclusiveTotalAt = (base: Kobo) => {
    const computed = forwardPass(base, codes);
    let total = 0;
    for (const id of inclusiveIds) total += computed.get(id)?.amount ?? 0;
    return total;
  };

  const totalRateBp = codes
    .filter(c => inclusiveIds.has(c.id))
    .reduce((sum, c) => sum + c.rateBp, 0);
  // Starting guess, from money.ts's closed form -- exact for a single
  // inclusive code, which is the overwhelmingly common case, so the loop
  // below usually confirms it on its first iteration. Not the answer in
  // general: the answer is whichever nearby integer the exact forward pass
  // confirms.
  const candidate = extractInclusive(grossKobo, totalRateBp).baseKobo;

  let best = candidate;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let offset = -4; offset <= 4; offset++) {
    const base = candidate + offset;
    const delta = grossKobo - (base + inclusiveTotalAt(base));
    if (delta === 0) return base;
    // Prefer a base that leaves a small POSITIVE residual: the leftover kobo
    // then lands on the tax line rather than making the tax exceed the gross.
    const score = delta >= 0 ? delta : Math.abs(delta) + 1_000_000;
    if (score < bestDelta) { bestDelta = score; best = base; }
  }
  return best;
}

/**
 * THE entry point. Every posting path in the system routes through here.
 *
 * Returns the net base and one line per applicable tax. Callers post the
 * base as one folio_charges row and each line as its own child row -- see
 * services/tax/posting.ts, which is the only thing that should be doing it.
 */
export function computeTax(amountKobo: Kobo, context: TaxContext): TaxComputation {
  if (!Number.isInteger(amountKobo)) {
    throw new TypeError(`computeTax expects integer kobo, got ${amountKobo}`);
  }
  const at = context.on ?? new Date();
  const all = applicableTaxCodes(context.branchId, context.chargeCategory, at);
  if (all.length === 0) return noTax(amountKobo);

  const exempted = exemptedCodeIds(context);
  const codes = all.filter(c => !exempted.has(c.id));
  const suppressed = all.filter(c => exempted.has(c.id)).map(c => c.id);
  if (codes.length === 0) return { ...noTax(amountKobo), exemptedCodeIds: suppressed };

  const inclusiveIds = new Set(codes.filter(c => c.isInclusive).map(c => c.id));
  const baseKobo = inclusiveIds.size > 0
    ? solveInclusiveBase(amountKobo, codes, inclusiveIds)
    : amountKobo;

  const computed = forwardPass(baseKobo, codes);

  const lines: TaxLine[] = codes.map(code => {
    const result = computed.get(code.id)!;
    return {
      taxCodeId: code.id,
      code: code.code,
      name: code.name,
      jurisdiction: code.jurisdiction,
      taxType: code.taxType,
      rateBp: code.rateBp,
      isInclusive: code.isInclusive,
      taxableBaseKobo: result.taxableBase,
      amountKobo: result.amount,
      chargeKind: code.taxType === "service_charge" ? "service_charge" : "tax",
      computationOrder: code.computationOrder,
    };
  });

  // Exactness guarantee for inclusive pricing: whatever the operator typed
  // is what the guest pays. Any residual kobo the search could not place
  // goes on the last inclusive line, so base + inclusive taxes == gross with
  // no exception and no "off by one kobo" for anyone to explain.
  if (inclusiveIds.size > 0) {
    const inclusiveLines = lines.filter(l => inclusiveIds.has(l.taxCodeId));
    const inclusiveTotal = addKobo(...inclusiveLines.map(l => l.amountKobo));
    const residual = amountKobo - (baseKobo + inclusiveTotal);
    if (residual !== 0) {
      const last = inclusiveLines[inclusiveLines.length - 1];
      last.amountKobo += residual;
    }
  }

  const taxTotalKobo = lines.length > 0 ? addKobo(...lines.map(l => l.amountKobo)) : 0;
  return {
    grossInputKobo: amountKobo,
    baseKobo,
    lines,
    taxTotalKobo,
    totalKobo: baseKobo + taxTotalKobo,
    exemptedCodeIds: suppressed,
  };
}
