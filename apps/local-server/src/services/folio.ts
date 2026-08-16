// Backend Blueprint B2. All amounts are integer kobo; see lib/money.ts.
//
// The old implementation ended with
//   const balance = Math.round((totalCharges - totalPaid) * 100) / 100;
// which existed purely to hide float drift -- summing naira as doubles left
// a balance a fraction of a kobo off, and the round papered over it. In
// integer kobo the subtraction is exact, so that line is deleted rather
// than reimplemented.
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { folioCharges, payments } from "../db/schema.js";
import { addKobo, subKobo, type Kobo } from "../lib/money.js";

export interface FolioSummary {
  charges: typeof folioCharges.$inferSelect[];
  payments: typeof payments.$inferSelect[];
  totalChargesKobo: Kobo;
  totalPaidKobo: Kobo;
  balanceKobo: Kobo;
  /** B6: the net-of-tax portion. totalNetKobo + totalTaxKobo = totalChargesKobo. */
  totalNetKobo: Kobo;
  totalTaxKobo: Kobo;
  totalServiceChargeKobo: Kobo;
}

export function folioSummary(reservationId: string): FolioSummary {
  const charges = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all();
  const paymentRows = db.select().from(payments).where(eq(payments.reservationId, reservationId)).all();
  const totalChargesKobo = addKobo(...charges.map(c => c.amountKobo));
  const totalPaidKobo = addKobo(...paymentRows.map(p => p.amountKobo));

  // Split by charge_kind, not by category: a VAT line on a room charge
  // carries category "Room" so it stays grouped with what it taxes on the
  // printed folio. The kind is what says whether it is tax.
  const sumOfKind = (kind: string) =>
    addKobo(...charges.filter(c => c.chargeKind === kind).map(c => c.amountKobo));

  return {
    charges,
    payments: paymentRows,
    totalChargesKobo,
    totalPaidKobo,
    balanceKobo: subKobo(totalChargesKobo, totalPaidKobo),
    totalNetKobo: sumOfKind("base"),
    totalTaxKobo: sumOfKind("tax"),
    totalServiceChargeKobo: sumOfKind("service_charge"),
  };
}
