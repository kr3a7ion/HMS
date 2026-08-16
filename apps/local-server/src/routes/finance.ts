// FI-01 Folio Management (Finance view), FI-03 Daily Summary.
// FI-02 Invoice & Receipts, FI-04 Accounts Payable, FI-05 Revenue Reports
// are a separate pass -- see ROADMAP.md.
import { Router } from "express";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { reservations, guests, rooms, folioCharges, payments } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { folioSummary } from "../services/folio.js";
import { addKobo, subKobo } from "../lib/money.js";
import { logAudit } from "../services/audit.js";

const router = Router();

function folioStatus(reservationStatus: string, disputed: boolean, balanceKobo: number): "open" | "closed" | "disputed" {
  if (disputed) return "disputed";
  if (reservationStatus === "checked_out" && balanceKobo <= 0) return "closed";
  return "open";
}

// FI-01. Every reservation that's ever had a folio (i.e. reached check-in),
// not just today's in-house guests -- Front Desk's /front-desk/folio only
// shows currently checked-in guests; this is the broader Finance view.
router.get("/folios", requireAuth, requirePermission("folio:read"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const minBalance = req.query.minBalance === "true";
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;

  const conditions = [eq(reservations.branchId, branchId)];
  if (dateFrom) conditions.push(gte(reservations.checkInDate, dateFrom));
  if (dateTo) conditions.push(lte(reservations.checkInDate, dateTo));

  const rows = db.select({
    id: reservations.id, status: reservations.status, disputed: reservations.disputed,
    checkInDate: reservations.checkInDate, checkOutDate: reservations.checkOutDate,
    guestFirstName: guests.firstName, guestLastName: guests.lastName, roomNumber: rooms.number,
  })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .leftJoin(rooms, eq(reservations.roomId, rooms.id))
    .where(and(...conditions))
    .all()
    // Only reservations that reached check-in have a folio worth showing.
    .filter(r => r.status === "checked_in" || r.status === "checked_out");

  let result = rows.map(r => {
    const folio = folioSummary(r.id);
    return { ...r, totalChargesKobo: folio.totalChargesKobo, totalPaidKobo: folio.totalPaidKobo, balanceKobo: folio.balanceKobo, folioStatus: folioStatus(r.status, r.disputed, folio.balanceKobo) };
  });

  if (statusFilter) result = result.filter(r => r.folioStatus === statusFilter);
  if (minBalance) result = result.filter(r => r.balanceKobo > 0);

  res.json(result);
});

const disputeSchema = z.object({ disputed: z.boolean() });

router.post("/folios/:id/dispute", requireAuth, requirePermission("folio:write"), (req: AuthedRequest, res) => {
  const reservation = db.select().from(reservations).where(eq(reservations.id, req.params.id)).get();
  if (!reservation || reservation.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = disputeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  db.update(reservations).set({ disputed: parsed.data.disputed }).where(eq(reservations.id, reservation.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: parsed.data.disputed ? "folio_disputed" : "folio_dispute_cleared", module: "Finance", recordId: reservation.id, ipAddress: req.ip });
  res.json({ ok: true });
});

// FI-03. Aggregates real folio_charges (by category) and real payments (by
// method) for one calendar day, branch-scoped. No cash-drawer reconciliation
// (opening/closing petty cash) -- nothing in the schema tracks a physical
// cash drawer, so that section of the Blueprint's mock stays out until
// there's a real till/session concept to back it.
router.get("/daily-summary", requireAuth, requirePermission("finance:read"), (req: AuthedRequest, res) => {
  const dateParam = typeof req.query.date === "string" ? req.query.date : new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${dateParam}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateParam}T23:59:59.999Z`);
  const branchId = req.auth!.branchId;

  const branchReservationIds = new Set(
    db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id),
  );

  const charges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, dayStart), lte(folioCharges.postedAt, dayEnd))).all()
    .filter(c => branchReservationIds.has(c.reservationId));
  const paymentRows = db.select().from(payments).where(and(gte(payments.receivedAt, dayStart), lte(payments.receivedAt, dayEnd))).all()
    .filter(p => branchReservationIds.has(p.reservationId));

  const byCategory = new Map<string, { amountKobo: number; txn: number }>();
  for (const c of charges) {
    const entry = byCategory.get(c.category) ?? { amountKobo: 0, txn: 0 };
    entry.amountKobo = addKobo(entry.amountKobo, c.amountKobo); entry.txn += 1;
    byCategory.set(c.category, entry);
  }
  const byMethod = new Map<string, number>();
  for (const p of paymentRows) byMethod.set(p.method, addKobo(byMethod.get(p.method) ?? 0, p.amountKobo));

  const totalRevenueKobo = addKobo(...charges.map(c => c.amountKobo));
  const totalPaymentsKobo = addKobo(...paymentRows.map(p => p.amountKobo));

  res.json({
    date: dateParam,
    totalRevenueKobo,
    transactionCount: charges.length,
    revenueByCategory: Array.from(byCategory.entries()).map(([category, v]) => ({ category, ...v })),
    paymentsByMethod: Array.from(byMethod.entries()).map(([method, amountKobo]) => ({ method, amountKobo })),
    totalPaymentsKobo,
    outstandingBalanceKobo: subKobo(totalRevenueKobo, totalPaymentsKobo),
  });
});

export default router;
