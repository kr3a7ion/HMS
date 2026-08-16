// D-01 My Dashboard (role-adaptive), D-02 Management Overview.
//
// Reuses the same tables/logic already built for Reports and every other
// module rather than inventing a parallel data model -- see
// server/src/routes/reports.ts for the shared date-range/nights helpers.
// A few Blueprint stat cards have no real backing data at all (Finance's
// "Discounts Applied" -- no discount workflow exists; Maintenance's
// "Assets Due for Service" -- Asset Register was deferred in the
// Maintenance pass) and are either shown as a real, structural zero or
// substituted with an equally real adjacent metric -- see ROADMAP.md.
import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  reservations, guests, rooms, folioCharges, payments, workOrders, workOrderEvents,
  restaurantOrders, restaurantOrderItems, restaurantTables, inspections, users,
} from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { computeBranchSnapshot } from "../services/branchKpis.js";
import { addKobo, valueKobo } from "../lib/money.js";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function todayRange() {
  const today = new Date().toISOString().slice(0, 10);
  return { start: new Date(`${today}T00:00:00.000Z`), end: new Date(`${today}T23:59:59.999Z`), today };
}

// Structured fields (refId/actor/room/action) alongside the existing
// label/detail so the Dashboard's Recent Activity table (the original
// Figma layout -- Ref ID | Guest/Dept | Room | Action | Time columns) has
// real data to render, not just a flattened one-line description.
function recentActivity(branchId: string, limit: number) {
  const { start } = { start: new Date(Date.now() - 2 * DAY_MS) }; // last 48h is plenty for a "recent" feed
  const branchResIds = new Set(db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id));

  const charges = db.select({
    id: folioCharges.id, postedAt: folioCharges.postedAt, category: folioCharges.category, description: folioCharges.description, amountKobo: folioCharges.amountKobo, reservationId: folioCharges.reservationId,
  }).from(folioCharges).where(gte(folioCharges.postedAt, start)).all().filter(c => branchResIds.has(c.reservationId));
  const chargeEvents = charges.map(c => {
    const res = db.select({ roomId: reservations.roomId, guestId: reservations.guestId }).from(reservations).where(eq(reservations.id, c.reservationId)).get();
    const room = res?.roomId ? db.select({ number: rooms.number }).from(rooms).where(eq(rooms.id, res.roomId)).get() : null;
    const guest = res?.guestId ? db.select({ firstName: guests.firstName, lastName: guests.lastName }).from(guests).where(eq(guests.id, res.guestId)).get() : null;
    const guestName = guest ? `${guest.firstName} ${guest.lastName}` : "Guest";
    return {
      type: "charge" as const, time: c.postedAt, refId: c.id, actor: guestName, room: room?.number ?? null,
      label: `${c.category} charge posted`, detail: `${guestName}${room ? ` · Room ${room.number}` : ""} · ₦${c.amountKobo.toLocaleString()}`,
    };
  });

  const woEvents = db.select({
    id: workOrderEvents.id, createdAt: workOrderEvents.createdAt, eventType: workOrderEvents.eventType, note: workOrderEvents.note, workOrderId: workOrderEvents.workOrderId, performedBy: workOrderEvents.performedBy,
  }).from(workOrderEvents).where(gte(workOrderEvents.createdAt, start)).all()
    .filter(e => db.select({ branchId: workOrders.branchId }).from(workOrders).where(eq(workOrders.id, e.workOrderId)).get()?.branchId === branchId)
    .map(e => {
      const performer = db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, e.performedBy)).get();
      const wo = db.select({ location: workOrders.location }).from(workOrders).where(eq(workOrders.id, e.workOrderId)).get();
      const performerName = performer ? `${performer.firstName} ${performer.lastName}` : "Staff";
      return {
        type: "maintenance" as const, time: e.createdAt, refId: e.id, actor: performerName, room: wo?.location ?? null,
        label: `Work order ${e.eventType.replace("_", " ")}`, detail: `${performerName}${e.note ? ` · ${e.note}` : ""}`,
      };
    });

  const closedOrders = db.select({ closedAt: restaurantOrders.closedAt, id: restaurantOrders.id, tableId: restaurantOrders.tableId, paidAmountKobo: restaurantOrders.paidAmountKobo })
    .from(restaurantOrders).where(and(eq(restaurantOrders.branchId, branchId), eq(restaurantOrders.status, "closed"), gte(restaurantOrders.closedAt, start))).all()
    .map(o => {
      const table = o.tableId ? db.select({ label: restaurantTables.label }).from(restaurantTables).where(eq(restaurantTables.id, o.tableId)).get() : null;
      const roomLabel = table ? `Table ${table.label}` : "Room Service";
      return {
        type: "restaurant" as const, time: o.closedAt!, refId: o.id, actor: "Restaurant", room: roomLabel,
        label: "Restaurant order closed", detail: `${roomLabel}${o.paidAmountKobo ? ` · ₦${o.paidAmountKobo.toLocaleString()}` : ""}`,
      };
    });

  return [...chargeEvents, ...woEvents, ...closedOrders]
    .sort((a, b) => b.time.getTime() - a.time.getTime())
    .slice(0, limit)
    .map(e => ({ ...e, time: e.time.toISOString() }));
}

// Room Status panel (the original Figma layout's per-status breakdown) --
// same `rooms.status` enum already used everywhere else (Front Desk, Room
// Assignment Board), just aggregated into counts here.
const ROOM_STATUS_LABELS: Record<string, string> = {
  occupied: "Occupied", available: "Available", cleaning: "Cleaning",
  reserved: "Reserved", maintenance: "Maintenance", out_of_service: "Out of Service",
};
function roomStatusBreakdown(branchRooms: Array<{ status: string }>) {
  const counts = new Map<string, number>();
  for (const r of branchRooms) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  return Object.entries(ROOM_STATUS_LABELS)
    .map(([key, label]) => ({ status: label, count: counts.get(key) ?? 0 }))
    .filter(s => s.count > 0);
}

// ─── D-01 My Dashboard ──────────────────────────────────────────────────────
// ?role= lets MGT/ORG preview another department's dashboard (the
// "Switch View" control) -- an authorization boundary, not just a display
// toggle, so it's enforced here rather than trusted from the client: only
// honored when the AUTHENTICATED caller's own role is MGT or ORG, silently
// ignored (falls back to the caller's real role) for anyone else so a
// Front Desk agent can't spoof viewing Finance's numbers.
router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const actualRole = req.auth!.role;
  const requestedRole = typeof req.query.role === "string" ? req.query.role : undefined;
  const canSwitch = actualRole === "MGT" || actualRole === "ORG";
  const role = canSwitch && requestedRole ? requestedRole : actualRole;
  const { start, end } = todayRange();
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const branchResIds = new Set(db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id));

  if (role === "FD") {
    const arrivals = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "confirmed"), gte(reservations.checkInDate, start), lte(reservations.checkInDate, end))).all();
    const departures = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"), gte(reservations.checkOutDate, start), lte(reservations.checkOutDate, end))).all();
    const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all();
    const outstanding = inHouse.reduce((sum, r) => {
      const charges = db.select().from(folioCharges).where(eq(folioCharges.reservationId, r.id)).all().reduce((s, c) => addKobo(s, c.amountKobo), 0);
      const paid = db.select().from(payments).where(eq(payments.reservationId, r.id)).all().reduce((s, p) => addKobo(s, p.amountKobo), 0);
      return sum + Math.max(0, charges - paid);
    }, 0);
    return res.json({
      role, stats: [
        { label: "Rooms Available", value: branchRooms.filter(r => r.status === "available").length, sub: `Of ${branchRooms.length} total rooms` },
        { label: "Check-ins Today", value: arrivals.length, sub: "Confirmed, awaiting arrival" },
        { label: "Check-outs Today", value: departures.length, sub: "Currently in house" },
        { label: "Outstanding Balance", value: outstanding, isCurrency: true, sub: `Across ${inHouse.length} in-house folios` },
      ],
      recentActivity: recentActivity(branchId, 8),
    });
  }

  if (role === "HK") {
    const dirty = branchRooms.filter(r => r.housekeepingStatus === "dirty").length;
    const inProgress = branchRooms.filter(r => r.housekeepingStatus === "in_progress").length;
    const cleanToday = db.select().from(inspections).where(and(eq(inspections.branchId, branchId), gte(inspections.createdAt, start), lte(inspections.createdAt, end), eq(inspections.result, "pass"))).all().length;
    const awaitingInspection = branchRooms.filter(r => r.housekeepingStatus === "clean").length;
    return res.json({
      role, stats: [
        { label: "Rooms to Clean", value: dirty, sub: `${branchRooms.filter(r => r.housekeepingStatus === "dirty" && r.priority).length} priority` },
        { label: "In Progress", value: inProgress, sub: "Currently being cleaned" },
        { label: "Completed Today", value: cleanToday, sub: "Passed inspection today" },
        { label: "Inspections Pending", value: awaitingInspection, sub: "Clean, awaiting supervisor sign-off" },
      ],
      recentActivity: recentActivity(branchId, 8),
    });
  }

  if (role === "MX") {
    const all = db.select().from(workOrders).where(eq(workOrders.branchId, branchId)).all();
    const open = all.filter(w => w.status !== "completed");
    const overdue = open.filter(w => (Date.now() - w.createdAt.getTime()) > 48 * 60 * 60 * 1000).length;
    const completedToday = all.filter(w => w.status === "completed" && w.closedAt && w.closedAt >= start && w.closedAt <= end).length;
    const reportedToday = all.filter(w => w.createdAt >= start && w.createdAt <= end).length;
    return res.json({
      role, stats: [
        { label: "Open Work Orders", value: open.length, sub: "All categories" },
        { label: "Overdue", value: overdue, sub: "Open > 48h" },
        { label: "Completed Today", value: completedToday, sub: "This shift" },
        // Substituted for Blueprint's "Assets Due for Service" -- Asset
        // Register (MX-04/05) was deferred in the Maintenance pass, so
        // there's no real asset-service-schedule data to show here.
        { label: "Reported Today", value: reportedToday, sub: "New work orders" },
      ],
      recentActivity: recentActivity(branchId, 8),
    });
  }

  if (role === "FIN") {
    const todayCharges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all().filter(c => branchResIds.has(c.reservationId));
    const todayPayments = db.select().from(payments).where(and(gte(payments.receivedAt, start), lte(payments.receivedAt, end))).all().filter(p => branchResIds.has(p.reservationId));
    const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all();
    const outstanding = inHouse.reduce((sum, r) => {
      const charges = db.select().from(folioCharges).where(eq(folioCharges.reservationId, r.id)).all().reduce((s, c) => addKobo(s, c.amountKobo), 0);
      const paid = db.select().from(payments).where(eq(payments.reservationId, r.id)).all().reduce((s, p) => addKobo(s, p.amountKobo), 0);
      return sum + Math.max(0, charges - paid);
    }, 0);
    return res.json({
      role, stats: [
        { label: "Revenue Today", value: addKobo(...todayCharges.map(c => c.amountKobo)), isCurrency: true, sub: "All categories" },
        { label: "Outstanding Balance", value: outstanding, isCurrency: true, sub: `${inHouse.length} in-house folios` },
        { label: "Payments Received", value: addKobo(...todayPayments.map(p => p.amountKobo)), isCurrency: true, sub: "Cash + card + transfer" },
        // Real, structural zero -- no discount/approval workflow exists
        // anywhere in this codebase yet (Rate Management has no discount
        // flow built), not a fabricated figure.
        { label: "Discounts Applied", value: 0, isCurrency: true, sub: "No discount workflow built yet" },
      ],
      recentActivity: recentActivity(branchId, 8),
    });
  }

  if (role === "RT") {
    const tables = db.select().from(restaurantTables).where(eq(restaurantTables.branchId, branchId)).all();
    const openOrders = db.select().from(restaurantOrders).where(and(eq(restaurantOrders.branchId, branchId))).all().filter(o => o.status === "open" || o.status === "sent_to_kitchen");
    const roomService = openOrders.filter(o => o.roomReservationId != null);
    const todayCharges = db.select().from(restaurantOrders).where(and(eq(restaurantOrders.branchId, branchId), eq(restaurantOrders.status, "closed"), gte(restaurantOrders.closedAt, start), lte(restaurantOrders.closedAt, end))).all();
    const todayRevenue = todayCharges.reduce((sum, o) => {
      const items = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, o.id)).all();
      return sum + addKobo(...items.map(i => valueKobo(i.unitPriceKobo, i.quantity)));
    }, 0);
    return res.json({
      role, stats: [
        { label: "Tables Occupied", value: `${tables.filter(t => t.status === "occupied").length}/${tables.length}`, sub: `${tables.length > 0 ? Math.round((tables.filter(t => t.status === "occupied").length / tables.length) * 100) : 0}% capacity` },
        { label: "Orders in Queue", value: openOrders.length, sub: "Open or sent to kitchen" },
        { label: "Room Service Pending", value: roomService.length, sub: "Not yet closed" },
        { label: "Today's Revenue", value: todayRevenue, isCurrency: true, sub: "F&B total" },
      ],
      recentActivity: recentActivity(branchId, 8),
    });
  }

  // MGT/ORG (and any role without a dedicated view above) get the same
  // branch-wide summary D-02 leads with.
  const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all();
  const todayCharges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all().filter(c => branchResIds.has(c.reservationId));
  const openWork = db.select().from(workOrders).where(eq(workOrders.branchId, branchId)).all().filter(w => w.status !== "completed");
  res.json({
    role, stats: [
      { label: "Occupancy Rate", value: branchRooms.length > 0 ? Math.round((inHouse.length / branchRooms.length) * 100) : 0, isPercent: true, sub: `${inHouse.length} of ${branchRooms.length} rooms occupied` },
      { label: "Revenue Today", value: addKobo(...todayCharges.map(c => c.amountKobo)), isCurrency: true, sub: "All categories" },
      { label: "Active Guests", value: inHouse.length, sub: "Currently in house" },
      { label: "Open Issues", value: openWork.length, sub: "Open work orders" },
    ],
    recentActivity: recentActivity(branchId, 8),
  });
});

// ─── D-02 Management Overview ───────────────────────────────────────────────
//
// A REAL GAP FOUND BY B17.7's ROUTE AUDIT, not by review. This carried
// `requireAuth` and nothing else, so every authenticated member of staff --
// a housekeeper, a waiter, a maintenance technician -- could read the
// property's 7-day revenue trend, occupancy and ADR. Nothing in the handler
// checked anything; the screen is called "Management Overview" and the
// endpoint behind it was open to everyone with a login.
//
// Gated on the same grants the revenue reports already use, so nobody who
// could not already see these figures loses access.
router.get("/overview", requireAuth, requirePermission("reports:revenue", "finance:read"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end } = todayRange();
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const branchResIds = new Set(db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id));

  // 7-day occupancy trend + revenue trend for the mini charts.
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10));
  const allActiveRes = db.select().from(reservations).where(eq(reservations.branchId, branchId)).all().filter(r => r.status === "checked_in" || r.status === "checked_out");
  const trend = days.map(day => {
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);
    const occupied = allActiveRes.filter(r => r.checkInDate <= dayEnd && r.checkOutDate > dayStart).length;
    const revenue = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, dayStart), lte(folioCharges.postedAt, dayEnd))).all().filter(c => branchResIds.has(c.reservationId)).reduce((s, c) => s + c.amountKobo, 0);
    return { date: day, occupancy: branchRooms.length > 0 ? Math.round((occupied / branchRooms.length) * 1000) / 10 : 0, revenue };
  });

  const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all();
  const arrivals = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "confirmed"), gte(reservations.checkInDate, start), lte(reservations.checkInDate, end))).all();
  const departures = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"), gte(reservations.checkOutDate, start), lte(reservations.checkOutDate, end))).all();

  const todayCharges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all().filter(c => branchResIds.has(c.reservationId));
  const byCategory = new Map<string, number>();
  for (const c of todayCharges) byCategory.set(c.category, addKobo(byCategory.get(c.category) ?? 0, c.amountKobo));

  // occupancyRate/revpar come from the shared snapshot helper so this
  // screen and the sync client (services/sync.ts) can never disagree on
  // what those two numbers mean.
  const snapshot = computeBranchSnapshot(branchId);

  const openWork = db.select().from(workOrders).where(eq(workOrders.branchId, branchId)).all().filter(w => w.status !== "completed");
  const overdueWork = openWork.filter(w => (Date.now() - w.createdAt.getTime()) > 48 * 60 * 60 * 1000).length;
  const dirtyRooms = branchRooms.filter(r => r.housekeepingStatus === "dirty").length;
  const openTables = db.select().from(restaurantTables).where(eq(restaurantTables.branchId, branchId)).all();
  const openOrders = db.select().from(restaurantOrders).where(eq(restaurantOrders.branchId, branchId)).all().filter(o => o.status === "open" || o.status === "sent_to_kitchen");

  res.json({
    occupancyRate: snapshot.occupancyRate,
    revparKobo: snapshot.revparKobo,
    inHouseCount: inHouse.length,
    arrivalsToday: arrivals.length,
    departuresToday: departures.length,
    revenueTodayKobo: addKobo(...todayCharges.map(c => c.amountKobo)),
    revenueByCategory: Array.from(byCategory.entries()).map(([category, amountKobo]) => ({ category, amountKobo })),
    occupancyTrend: trend.map(t => ({ date: t.date, occupancy: t.occupancy })),
    revenueTrend: trend.map(t => ({ date: t.date, revenue: t.revenue })),
    roomStatus: roomStatusBreakdown(branchRooms),
    roomsTotal: branchRooms.length,
    departmentKpis: [
      { department: "Housekeeping", metric: "Rooms Dirty", value: dirtyRooms, status: dirtyRooms > 5 ? "warning" : "success" },
      { department: "Maintenance", metric: "Open Work Orders", value: openWork.length, status: overdueWork > 0 ? "error" : "success" },
      { department: "Restaurant", metric: "Tables Occupied", value: `${openTables.filter(t => t.status === "occupied").length}/${openTables.length}`, status: "success" },
      { department: "Restaurant", metric: "Orders Open", value: openOrders.length, status: openOrders.length > 5 ? "warning" : "success" },
    ],
    recentActivity: recentActivity(branchId, 10),
  });
});

export default router;
