import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { folioCharges, payments } from "../db/schema.js";

export function folioSummary(reservationId: string) {
  const charges = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all();
  const paymentRows = db.select().from(payments).where(eq(payments.reservationId, reservationId)).all();
  const totalCharges = charges.reduce((sum, c) => sum + c.amount, 0);
  const totalPaid = paymentRows.reduce((sum, p) => sum + p.amount, 0);
  const balance = Math.round((totalCharges - totalPaid) * 100) / 100;
  return { charges, payments: paymentRows, totalCharges, totalPaid, balance };
}
