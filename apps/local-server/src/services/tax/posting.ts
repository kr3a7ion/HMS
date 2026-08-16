// Backend Blueprint B6 — the one way a charge reaches the folio.
//
// THE DoD FOR THIS BATCH IS "no posting path bypasses the engine". This file
// is how that is achievable rather than aspirational: there is exactly one
// function that writes a folio charge, it always calls computeTax, and
// scripts/lint-invariants.mjs fails the build if anyone adds a
// db.insert(folioCharges) anywhere else.
//
// Every posted charge is one `base` row plus one child row per applicable
// tax. The base row's amount is NET -- for an inclusive tax the base is
// smaller than what the operator typed, and the difference is the tax line,
// so the folio total is unchanged and the breakdown is visible.
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { folioCharges } from "../../db/schema.js";
import { computeTax, type TaxComputation, type TaxContext } from "./engine.js";
import { basisPointsToPercent, type Kobo } from "../../lib/money.js";

export interface PostChargeInput {
  reservationId: string;
  branchId: string;
  category: string;
  description: string;
  quantity: number;
  unitPriceKobo: Kobo;
  /**
   * The amount as the operator/caller means it: exclusive of any exclusive
   * tax, inclusive of any inclusive tax. Normally quantity x unitPrice.
   */
  amountKobo: Kobo;
  postedBy: string;
  businessDate: Date;
  postedAt?: Date;
  /** Guest/stay facts that can suppress a tax. See engine.exemptionApplies. */
  taxContext?: Omit<TaxContext, "branchId" | "chargeCategory" | "on">;
}

export interface PostedCharge {
  chargeId: string;
  /** Net base actually written to the parent row. */
  baseKobo: Kobo;
  taxChargeIds: string[];
  taxTotalKobo: Kobo;
  /** Base + tax: what this posting added to the folio balance. */
  totalKobo: Kobo;
  computation: TaxComputation;
}

/**
 * Posts a charge and its tax lines.
 *
 * CALLER MUST BE IN A TRANSACTION when the surrounding handler does anything
 * else -- this writes 1 + n rows, and a base charge that lands without its
 * tax lines is a guest billed the wrong amount with nothing to show why.
 */
export function postChargeWithTax(input: PostChargeInput): PostedCharge {
  const postedAt = input.postedAt ?? new Date();
  const computation = computeTax(input.amountKobo, {
    branchId: input.branchId,
    chargeCategory: input.category,
    // Rates are effective-dated against the BUSINESS date, not the wall
    // clock: a charge belonging to yesterday's trading day must compute at
    // yesterday's rate, or a rate change lands on the wrong day's revenue.
    on: input.businessDate,
    ...input.taxContext,
  });

  const chargeId = nanoid();
  // unitPrice is scaled down alongside the amount when an inclusive tax is
  // extracted, so quantity x unitPrice still reconciles to the line total on
  // the printed folio. Integer quantities divide exactly in the common case;
  // where they do not, the amount is authoritative and the unit price is
  // presentational.
  const unitPriceKobo = input.quantity > 0 && computation.baseKobo !== input.amountKobo
    ? Math.round(computation.baseKobo / input.quantity)
    : input.unitPriceKobo;

  db.insert(folioCharges).values({
    id: chargeId,
    reservationId: input.reservationId,
    category: input.category,
    description: input.description,
    quantity: input.quantity,
    unitPriceKobo,
    amountKobo: computation.baseKobo,
    postedBy: input.postedBy,
    postedAt,
    businessDate: input.businessDate,
    chargeKind: "base",
  }).run();

  const taxChargeIds: string[] = [];
  for (const line of computation.lines) {
    if (line.amountKobo === 0) continue; // a 0% code posts no line
    const taxChargeId = nanoid();
    db.insert(folioCharges).values({
      id: taxChargeId,
      reservationId: input.reservationId,
      category: input.category,
      description: `${line.name} (${formatRate(line.rateBp)}${line.isInclusive ? ", inclusive" : ""})`,
      quantity: 1,
      unitPriceKobo: line.amountKobo,
      amountKobo: line.amountKobo,
      postedBy: input.postedBy,
      postedAt,
      businessDate: input.businessDate,
      parentChargeId: chargeId,
      chargeKind: line.chargeKind,
      taxCodeId: line.taxCodeId,
    }).run();
    taxChargeIds.push(taxChargeId);
  }

  return {
    chargeId,
    baseKobo: computation.baseKobo,
    taxChargeIds,
    taxTotalKobo: computation.taxTotalKobo,
    totalKobo: computation.totalKobo,
    computation,
  };
}

/** 750 -> "7.5%". Presentation only. */
export function formatRate(basisPoints: number): string {
  return `${basisPointsToPercent(basisPoints)}%`;
}

/** Every child line of a charge, in posting order. */
export function taxLinesOf(chargeId: string) {
  return db.select().from(folioCharges).where(eq(folioCharges.parentChargeId, chargeId)).all();
}
