// Shared by GET /dashboard/overview and the Phase 3 sync client
// (services/sync.ts) so the numbers a manager sees on their own dashboard
// and the numbers pushed to the central server can never quietly drift
// apart from two independent implementations of "what is occupancy".
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { rooms, reservations, folioCharges, workOrders, users, branches, dailyRevenue } from "../db/schema.js";
import { businessDateOf } from "../lib/businessDate.js";
import { addKobo } from "../lib/money.js";

// occupancyRate is a percentage; every *Kobo field is integer minor units
// (B2). services/sync.ts converts the money fields to naira floats at the
// wire boundary because central's schema still speaks naira until B20 --
// that conversion is the only place a float appears.
export interface BranchSnapshot {
  occupancyRate: number; revenueTodayKobo: number; activeGuests: number; openIssues: number;
  roomsTotal: number; adrKobo: number; revparKobo: number; branchManagerName: string | null;
}

/**
 * Backend Blueprint B5 DoD: "sync KPI payload now sources from
 * daily_revenue". Once a day has been closed by the night audit its numbers
 * are frozen, and re-deriving them from live rows would let the KPI central
 * sees drift away from the day the property actually reported -- e.g. after
 * a late void. So a CLOSED day is read back verbatim.
 *
 * The current, still-open business day has no frozen row yet, so it is
 * computed live using the same function the audit itself will use to freeze
 * it. That keeps one definition of "what is a day's revenue" rather than two
 * that can disagree.
 */
export function computeBranchSnapshot(branchId: string): BranchSnapshot {
  const branch = db.select().from(branches).where(eq(branches.id, branchId)).get();
  if (branch) {
    const businessDate = businessDateOf(branch.currentBusinessDate);
    const frozen = db.select().from(dailyRevenue).where(and(
      eq(dailyRevenue.branchId, branchId),
      eq(dailyRevenue.businessDate, businessDate),
    )).all().find(r => r.supersededByRunId == null);

    if (frozen) {
      const manager = db.select({ firstName: users.firstName, lastName: users.lastName }).from(users)
        .where(and(eq(users.branchId, branchId), eq(users.role, "MGT"))).limit(1).get();
      const inHouseCount = db.select().from(reservations).where(and(
        eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"),
      )).all().length;
      const openWork = db.select().from(workOrders).where(eq(workOrders.branchId, branchId)).all()
        .filter(w => w.status !== "completed");
      return {
        occupancyRate: frozen.occupancyBp / 100,
        revenueTodayKobo: frozen.totalRevenueKobo,
        activeGuests: inHouseCount,
        openIssues: openWork.length,
        roomsTotal: frozen.roomsAvailable + frozen.roomsOoo,
        adrKobo: frozen.adrKobo,
        revparKobo: frozen.revparKobo,
        branchManagerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
      };
    }
  }
  return computeLiveSnapshot(branchId);
}

function computeLiveSnapshot(branchId: string): BranchSnapshot {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(`${today}T23:59:59.999Z`);

  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const branchResIds = new Set(db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id));
  const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all();

  const todayCharges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all().filter(c => branchResIds.has(c.reservationId));
  const revenueTodayKobo = addKobo(...todayCharges.map(c => c.amountKobo));
  const roomRevenueKobo = addKobo(...todayCharges.filter(c => c.category === "Room").map(c => c.amountKobo));

  const openWork = db.select().from(workOrders).where(eq(workOrders.branchId, branchId)).all().filter(w => w.status !== "completed");
  const manager = db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.branchId, branchId), eq(users.role, "MGT"))).limit(1).get();

  return {
    occupancyRate: branchRooms.length > 0 ? Math.round((inHouse.length / branchRooms.length) * 1000) / 10 : 0,
    revenueTodayKobo,
    activeGuests: inHouse.length,
    openIssues: openWork.length,
    roomsTotal: branchRooms.length,
    // Integer kobo division, so these stay whole minor units rather than
    // becoming fractional kobo.
    adrKobo: inHouse.length > 0 ? Math.round(roomRevenueKobo / inHouse.length) : 0,
    revparKobo: branchRooms.length > 0 ? Math.round(roomRevenueKobo / branchRooms.length) : 0,
    branchManagerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
  };
}
