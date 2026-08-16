// Backend Blueprint B6 — keeping the property's tax setting and its tax code
// in step.
//
// A branch has always carried tax_name / tax_rate_bp / tax_inclusive, and
// Settings > Hotel Configuration edits them. tax_codes is now the authority
// -- it is what every posting path computes from -- so those three columns
// would be a second, silently-diverging source of truth if nothing kept them
// aligned. This file is what keeps them aligned.
//
// THE ID IS DETERMINISTIC on purpose: `taxcode-legacy-<branchId>` is what
// migration 0006 created for every branch that already existed, so a save
// updates that row instead of accumulating a new code on every click.
import { and, eq, isNull, or, gt, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches, taxCodes } from "../../db/schema.js";

export function legacyTaxCodeId(branchId: string): string {
  return `taxcode-legacy-${branchId}`;
}

function fieldsFromBranch(branch: typeof branches.$inferSelect) {
  return {
    code: (branch.taxName || "VAT").toUpperCase().replace(/\s+/g, "_"),
    name: branch.taxName || "VAT",
    rateBp: branch.taxRateBp,
    isInclusive: branch.taxInclusive,
    // A 0% rate means the property has switched tax off. Leaving the code
    // active at 0% would post a zero-kobo line on every single charge.
    isActive: branch.taxRateBp > 0,
  };
}

/**
 * Creates the branch's tax code if it has none. NEVER updates an existing
 * one -- that distinction matters: this runs at startup for every branch, and
 * an update here would silently revert a rate an operator had deliberately
 * changed through /settings/tax-codes.
 */
export function ensureLegacyTaxCode(branchId: string): boolean {
  const branch = db.select().from(branches).where(eq(branches.id, branchId)).get();
  if (!branch) return false;
  const id = legacyTaxCodeId(branchId);
  if (db.select().from(taxCodes).where(eq(taxCodes.id, id)).get()) return false;

  db.insert(taxCodes).values({
    id, branchId, ...fieldsFromBranch(branch),
    jurisdiction: "federal", taxType: "vat",
    compoundsOnJson: "[]", appliesToJson: "[]", computationOrder: 100,
    // From the epoch: this rate was already the property's configured rate,
    // it simply was not being charged. Dating it from today would make a
    // back-dated night audit compute the night at no tax at all.
    effectiveFrom: new Date(0), effectiveTo: null, createdAt: new Date(),
  }).run();
  return true;
}

/**
 * Writes the branch's current tax columns onto its tax code, creating it if
 * needed. Called when an operator saves the Hotel Configuration screen --
 * an explicit action on that screen, unlike the startup path above.
 */
export function syncLegacyTaxCode(branchId: string): string | null {
  const branch = db.select().from(branches).where(eq(branches.id, branchId)).get();
  if (!branch) return null;
  const id = legacyTaxCodeId(branchId);

  if (ensureLegacyTaxCode(branchId)) return id;
  db.update(taxCodes).set({ ...fieldsFromBranch(branch), updatedAt: new Date() })
    .where(eq(taxCodes.id, id)).run();
  return id;
}

/** Every branch gets its code on boot, whatever path created the branch. */
export function ensureLegacyTaxCodesForAllBranches(): number {
  let created = 0;
  for (const branch of db.select({ id: branches.id }).from(branches).all()) {
    if (ensureLegacyTaxCode(branch.id)) created += 1;
  }
  return created;
}

/** Active codes in force right now -- what the settings screen should show. */
export function effectiveTaxCodes(branchId: string, at: Date = new Date()) {
  return db.select().from(taxCodes).where(and(
    eq(taxCodes.branchId, branchId),
    eq(taxCodes.isActive, true),
    lte(taxCodes.effectiveFrom, at),
    or(isNull(taxCodes.effectiveTo), gt(taxCodes.effectiveTo, at)),
  )).all().sort((a, b) => a.computationOrder - b.computationOrder || a.code.localeCompare(b.code));
}
