// Shared by GET /dashboard/overview and the Phase 3 sync client
// (services/sync.ts) so the numbers a manager sees on their own dashboard
// and the numbers pushed to the central server can never quietly drift
// apart from two independent implementations of "what is occupancy".
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { rooms, reservations, folioCharges, workOrders, users } from "../db/schema.js";

export interface BranchSnapshot {
  occupancyRate: number; revenueToday: number; activeGuests: number; openIssues: number;
  roomsTotal: number; adr: number; revpar: number; branchManagerName: string | null;
}

export function computeBranchSnapshot(branchId: string): BranchSnapshot {
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00.000Z`);
  const end = new Date(`${today}T23:59:59.999Z`);

  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const branchResIds = new Set(db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id));
  const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all();

  const todayCharges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all().filter(c => branchResIds.has(c.reservationId));
  const revenueToday = todayCharges.reduce((s, c) => s + c.amount, 0);
  const roomRevenue = todayCharges.filter(c => c.category === "Room").reduce((s, c) => s + c.amount, 0);

  const openWork = db.select().from(workOrders).where(eq(workOrders.branchId, branchId)).all().filter(w => w.status !== "completed");
  const manager = db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(and(eq(users.branchId, branchId), eq(users.role, "MGT"))).limit(1).get();

  return {
    occupancyRate: branchRooms.length > 0 ? Math.round((inHouse.length / branchRooms.length) * 1000) / 10 : 0,
    revenueToday,
    activeGuests: inHouse.length,
    openIssues: openWork.length,
    roomsTotal: branchRooms.length,
    adr: inHouse.length > 0 ? Math.round(roomRevenue / inHouse.length) : 0,
    revpar: branchRooms.length > 0 ? Math.round(roomRevenue / branchRooms.length) : 0,
    branchManagerName: manager ? `${manager.firstName} ${manager.lastName}` : null,
  };
}
