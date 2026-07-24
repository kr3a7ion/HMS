// RP-01 Occupancy, RP-02 Revenue (also backs Finance's FI-05 "Revenue
// Reports" nav entry -- same screen, see App.tsx), RP-03 Department,
// RP-04 Guest Analytics, RP-05 Inventory, RP-06 Staff.
//
// Every number here is a real aggregation over existing tables -- no new
// business logic tables were invented just to feed a chart. Where the
// Blueprint asks for a metric this schema genuinely can't produce (no
// historical instrumentation, no cost/loyalty/feedback model), the field
// is omitted rather than faked; see ROADMAP.md for the metric-by-metric
// list of what's real vs. deliberately dropped.
import { Router } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  reservations, guests, rooms, folioCharges, users, workOrders, restaurantOrders,
  restaurantOrderItems, inspections, products, stockTransactions, purchaseOrders,
  purchaseOrderItems, suppliers, attendance, shifts,
} from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function parseRange(req: AuthedRequest): { start: Date; end: Date; startStr: string; endStr: string } {
  const endStr = typeof req.query.end === "string" ? req.query.end : new Date().toISOString().slice(0, 10);
  const startStr = typeof req.query.start === "string" ? req.query.start : new Date(new Date(endStr).getTime() - 29 * DAY_MS).toISOString().slice(0, 10);
  return { start: new Date(`${startStr}T00:00:00.000Z`), end: new Date(`${endStr}T23:59:59.999Z`), startStr, endStr };
}

function nightsBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

// ─── RP-01 Occupancy Reports ────────────────────────────────────────────────
router.get("/occupancy", requireAuth, requirePermission("reports:occupancy"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end, startStr, endStr } = parseRange(req);
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const allRes = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), lte(reservations.checkInDate, end), gte(reservations.checkOutDate, start))).all();
  const rangeCreated = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), gte(reservations.checkInDate, start), lte(reservations.checkInDate, end))).all();

  // Occupied-nights per day: a reservation occupies its room for every
  // night of its stay, provided it actually happened (checked_in/out) --
  // cancelled/no_show bookings never occupied a room.
  const stayed = allRes.filter(r => r.status === "checked_in" || r.status === "checked_out");
  const byDay: Record<string, number> = {};
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const dayStr = d.toISOString().slice(0, 10);
    const dayStart = new Date(`${dayStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dayStr}T23:59:59.999Z`);
    const occupied = stayed.filter(r => r.checkInDate <= dayEnd && r.checkOutDate > dayStart).length;
    byDay[dayStr] = branchRooms.length > 0 ? Math.round((occupied / branchRooms.length) * 1000) / 10 : 0;
  }

  const roomTypeMap = new Map(branchRooms.map(r => [r.id, r.type]));
  const nightsByType = new Map<string, number>();
  const roomsByType = new Map<string, number>();
  for (const r of branchRooms) roomsByType.set(r.type, (roomsByType.get(r.type) ?? 0) + 1);
  for (const r of stayed) {
    if (!r.roomId) continue;
    const type = roomTypeMap.get(r.roomId);
    if (!type) continue;
    const overlapStart = r.checkInDate > start ? r.checkInDate : start;
    const overlapEnd = r.checkOutDate < end ? r.checkOutDate : end;
    nightsByType.set(type, (nightsByType.get(type) ?? 0) + nightsBetween(overlapStart, overlapEnd));
  }
  const totalRangeDays = nightsBetween(start, end) || 1;
  const occupancyByRoomType = Array.from(roomsByType.entries()).map(([type, count]) => ({
    type, occupancy: Math.round(((nightsByType.get(type) ?? 0) / (count * totalRangeDays)) * 1000) / 10,
  }));

  const noShow = rangeCreated.filter(r => r.status === "no_show").length;
  const cancelled = rangeCreated.filter(r => r.status === "cancelled").length;
  const checkedOut = rangeCreated.filter(r => r.status === "checked_out");
  const alos = checkedOut.length > 0 ? checkedOut.reduce((s, r) => s + nightsBetween(r.checkInDate, r.checkOutDate), 0) / checkedOut.length : 0;

  const roomRevenue = db.select().from(folioCharges).where(and(eq(folioCharges.category, "Room"), gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all()
    .filter(c => stayed.some(r => r.id === c.reservationId))
    .reduce((s, c) => s + c.amount, 0);
  const roomNightsSold = stayed.reduce((s, r) => {
    const overlapStart = r.checkInDate > start ? r.checkInDate : start;
    const overlapEnd = r.checkOutDate < end ? r.checkOutDate : end;
    return s + nightsBetween(overlapStart, overlapEnd);
  }, 0);
  const adr = roomNightsSold > 0 ? roomRevenue / roomNightsSold : 0;
  const revpar = branchRooms.length > 0 ? roomRevenue / (branchRooms.length * totalRangeDays) : 0;

  res.json({
    start: startStr, end: endStr,
    avgOccupancy: Object.values(byDay).length > 0 ? Math.round((Object.values(byDay).reduce((a, b) => a + b, 0) / Object.values(byDay).length) * 10) / 10 : 0,
    noShowRate: rangeCreated.length > 0 ? Math.round((noShow / rangeCreated.length) * 1000) / 10 : 0,
    cancellationRate: rangeCreated.length > 0 ? Math.round((cancelled / rangeCreated.length) * 1000) / 10 : 0,
    avgLengthOfStay: Math.round(alos * 10) / 10,
    occupancyByDay: Object.entries(byDay).map(([date, occupancy]) => ({ date, occupancy })),
    occupancyByRoomType,
    adr: Math.round(adr), revpar: Math.round(revpar),
    // Gross Operating Profit % is deliberately not here -- it needs a real
    // expense/cost-of-goods ledger tied to revenue, which nothing in this
    // schema tracks yet (Accounts Payable records bills, not a P&L).
  });
});

// ─── RP-02 Revenue Reports (also Finance's FI-05) ───────────────────────────
router.get("/revenue", requireAuth, requirePermission("reports:revenue"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end, startStr, endStr } = parseRange(req);
  const branchResIds = new Set(db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id));

  const charges = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all().filter(c => branchResIds.has(c.reservationId));

  const byDay = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const c of charges) {
    const day = c.postedAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + c.amount);
    byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + c.amount);
  }
  const totalRevenue = charges.reduce((s, c) => s + c.amount, 0);

  const rangeDays = nightsBetween(start, end) || 1;
  const prevStart = new Date(start.getTime() - rangeDays * DAY_MS);
  const prevEnd = new Date(start.getTime() - 1);
  const prevRevenue = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, prevStart), lte(folioCharges.postedAt, prevEnd))).all()
    .filter(c => branchResIds.has(c.reservationId)).reduce((s, c) => s + c.amount, 0);

  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const roomRevenue = charges.filter(c => c.category === "Room").reduce((s, c) => s + c.amount, 0);
  const stayed = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), lte(reservations.checkInDate, end), gte(reservations.checkOutDate, start))).all()
    .filter(r => r.status === "checked_in" || r.status === "checked_out");
  const roomNightsSold = stayed.reduce((s, r) => {
    const overlapStart = r.checkInDate > start ? r.checkInDate : start;
    const overlapEnd = r.checkOutDate < end ? r.checkOutDate : end;
    return s + nightsBetween(overlapStart, overlapEnd);
  }, 0);

  res.json({
    start: startStr, end: endStr, totalRevenue,
    changeVsPreviousPeriod: prevRevenue > 0 ? Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 1000) / 10 : null,
    revenueByDay: Array.from(byDay.entries()).map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
    revenueByCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })),
    adr: roomNightsSold > 0 ? Math.round(roomRevenue / roomNightsSold) : 0,
    revpar: branchRooms.length > 0 ? Math.round(roomRevenue / (branchRooms.length * rangeDays)) : 0,
  });
});

// ─── RP-03 Department Reports ───────────────────────────────────────────────
// Every authenticated role sees their own department; MGT/ORG may pass
// ?dept=FD|HK|MX|RT to view any of them, or omit it for a branch-wide
// summary. Some Blueprint metrics (Front Desk avg processing time,
// walk-in rate; Housekeeping rooms-cleaned-per-attendant, avg turnaround;
// Restaurant kitchen ticket time) need event-level instrumentation this
// schema doesn't have -- current-state room/attendant assignment and
// order status don't carry a history of *when* each transition happened,
// only work orders and folio charges do. Those metrics are omitted; see
// ROADMAP.md.
router.get("/department", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end, startStr, endStr } = parseRange(req);
  const requested = typeof req.query.dept === "string" ? req.query.dept : undefined;
  const isManager = req.auth!.role === "MGT" || req.auth!.role === "ORG";
  const dept = isManager ? requested : req.auth!.role;

  if (dept === "FD") {
    const checkIns = db.select().from(folioCharges).where(and(eq(folioCharges.category, "Room"), gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all()
      .filter(c => db.select().from(reservations).where(eq(reservations.id, c.reservationId)).get()?.branchId === branchId).length;
    const checkOuts = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_out"), gte(reservations.checkOutDate, start), lte(reservations.checkOutDate, end))).all().length;
    return res.json({ department: "FD", start: startStr, end: endStr, metrics: { checkIns, checkOuts } });
  }
  if (dept === "HK") {
    const insp = db.select().from(inspections).where(and(eq(inspections.branchId, branchId), gte(inspections.createdAt, start), lte(inspections.createdAt, end))).all();
    const passRate = insp.length > 0 ? Math.round((insp.filter(i => i.result === "pass").length / insp.length) * 1000) / 10 : null;
    const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
    return res.json({ department: "HK", start: startStr, end: endStr, metrics: {
      inspectionsLogged: insp.length, inspectionPassRate: passRate,
      roomsCurrentlyClean: branchRooms.filter(r => r.housekeepingStatus === "clean" || r.housekeepingStatus === "inspected").length,
      dndFlagged: branchRooms.filter(r => r.dnd).length,
    } });
  }
  if (dept === "MX") {
    const created = db.select().from(workOrders).where(and(eq(workOrders.branchId, branchId), gte(workOrders.createdAt, start), lte(workOrders.createdAt, end))).all();
    const closed = created.filter(w => w.status === "completed" && w.closedAt);
    const avgResolutionHrs = closed.length > 0 ? closed.reduce((s, w) => s + (w.closedAt!.getTime() - w.createdAt.getTime()) / (60 * 60 * 1000), 0) / closed.length : null;
    const overdue = created.filter(w => w.status !== "completed" && (Date.now() - w.createdAt.getTime()) > 48 * 60 * 60 * 1000).length;
    return res.json({ department: "MX", start: startStr, end: endStr, metrics: {
      created: created.length, closed: closed.length,
      avgResolutionHours: avgResolutionHrs != null ? Math.round(avgResolutionHrs * 10) / 10 : null,
      overdueRate: created.length > 0 ? Math.round((overdue / created.length) * 1000) / 10 : 0,
    } });
  }
  if (dept === "RT") {
    const closedOrders = db.select().from(restaurantOrders).where(and(eq(restaurantOrders.branchId, branchId), eq(restaurantOrders.status, "closed"), gte(restaurantOrders.closedAt, start), lte(restaurantOrders.closedAt, end))).all();
    let totalCheckValue = 0;
    const itemCounts = new Map<string, number>();
    for (const o of closedOrders) {
      const items = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, o.id)).all();
      totalCheckValue += items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      for (const i of items) itemCounts.set(i.name, (itemCounts.get(i.name) ?? 0) + i.quantity);
    }
    const popularItems = Array.from(itemCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, quantity]) => ({ name, quantity }));
    return res.json({ department: "RT", start: startStr, end: endStr, metrics: {
      ordersClosed: closedOrders.length,
      avgCheckSize: closedOrders.length > 0 ? Math.round(totalCheckValue / closedOrders.length) : 0,
      popularItems,
    } });
  }

  // Branch-wide summary (no dept, or a dept without its own breakdown yet).
  const revenue = db.select().from(folioCharges).where(and(gte(folioCharges.postedAt, start), lte(folioCharges.postedAt, end))).all()
    .filter(c => db.select().from(reservations).where(eq(reservations.id, c.reservationId)).get()?.branchId === branchId)
    .reduce((s, c) => s + c.amount, 0);
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const inHouse = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), eq(reservations.status, "checked_in"))).all().length;
  const openOrders = db.select().from(workOrders).where(and(eq(workOrders.branchId, branchId))).all().filter(w => w.status !== "completed").length;
  res.json({ department: "ALL", start: startStr, end: endStr, metrics: {
    revenue, occupancyNow: branchRooms.length > 0 ? Math.round((inHouse / branchRooms.length) * 1000) / 10 : 0,
    activeGuests: inHouse, openWorkOrders: openOrders,
  } });
});

// ─── RP-04 Guest Analytics ───────────────────────────────────────────────────
// Loyalty tier distribution and complaint volume trend are deliberately
// not here -- neither a loyalty-program data model (points/tiers) nor a
// structured guest-feedback/complaints table exists. Shift Handover's
// guestComplaints field is freeform text per handover, not a queryable
// log. See ROADMAP.md.
router.get("/guest-analytics", requireAuth, requirePermission("reports:guests"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end, startStr, endStr } = parseRange(req);
  const rangeRes = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), gte(reservations.checkInDate, start), lte(reservations.checkInDate, end))).all()
    .filter(r => r.status === "checked_in" || r.status === "checked_out");

  const byGuest = new Map<string, number>();
  for (const r of rangeRes) byGuest.set(r.guestId, (byGuest.get(r.guestId) ?? 0) + 1);
  const repeatGuests = Array.from(byGuest.values()).filter(n => n > 1).length;
  const totalGuests = byGuest.size;

  const checkedOut = rangeRes.filter(r => r.status === "checked_out");
  const alos = checkedOut.length > 0 ? checkedOut.reduce((s, r) => s + nightsBetween(r.checkInDate, r.checkOutDate), 0) / checkedOut.length : 0;

  const branchGuests = db.select().from(guests).where(eq(guests.branchId, branchId)).all();
  const byNationality = new Map<string, number>();
  for (const g of branchGuests) {
    const key = g.nationality?.trim() || "Unspecified";
    byNationality.set(key, (byNationality.get(key) ?? 0) + 1);
  }

  // Repeat vs New Guests — Monthly (the original Figma chart, restored
  // with real data): its own fixed 6-month lookback, independent of the
  // start/end query range above, same as Dashboard's 7-day trend chart
  // uses a fixed window separate from its other stats. Same simplified
  // "repeat" definition as repeatGuestRate above (>1 stay within the
  // window counts as repeat) applied per-month instead of once overall.
  const monthsBack = 6;
  const monthlyBuckets: Array<{ monthStart: Date; monthEnd: Date; label: string }> = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    monthlyBuckets.push({ monthStart, monthEnd, label: d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) });
  }
  const allRangeRes = db.select().from(reservations).where(and(eq(reservations.branchId, branchId), gte(reservations.checkInDate, monthlyBuckets[0].monthStart), lte(reservations.checkInDate, monthlyBuckets[monthlyBuckets.length - 1].monthEnd))).all()
    .filter(r => r.status === "checked_in" || r.status === "checked_out");
  const repeatVsNewByMonth = monthlyBuckets.map(({ monthStart, monthEnd, label }) => {
    const inMonth = allRangeRes.filter(r => r.checkInDate >= monthStart && r.checkInDate < monthEnd);
    const guestCounts = new Map<string, number>();
    for (const r of inMonth) guestCounts.set(r.guestId, (guestCounts.get(r.guestId) ?? 0) + 1);
    const total = guestCounts.size;
    const repeat = Array.from(guestCounts.values()).filter(n => n > 1).length;
    return {
      month: label,
      repeat: total > 0 ? Math.round((repeat / total) * 100) : 0,
      new: total > 0 ? Math.round(((total - repeat) / total) * 100) : 0,
    };
  });

  res.json({
    start: startStr, end: endStr,
    repeatGuestRate: totalGuests > 0 ? Math.round((repeatGuests / totalGuests) * 1000) / 10 : 0,
    newGuestRate: totalGuests > 0 ? Math.round(((totalGuests - repeatGuests) / totalGuests) * 1000) / 10 : 0,
    avgStayDuration: Math.round(alos * 10) / 10,
    nationalityBreakdown: Array.from(byNationality.entries()).map(([nationality, count]) => ({ nationality, count })).sort((a, b) => b.count - a.count),
    repeatVsNewByMonth,
  });
});

// ─── RP-05 Inventory Reports ────────────────────────────────────────────────
// "Low-stock frequency" (Blueprint) would need replaying the
// stock_transactions ledger to reconstruct point-in-time stock levels over
// time -- shown instead as a current stock-status-by-category snapshot,
// which is what the rest of Inventory already uses (see stockStatus() on
// the frontend). See ROADMAP.md.
router.get("/inventory", requireAuth, requirePermission("reports:inventory"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end, startStr, endStr } = parseRange(req);

  const items = db.select().from(products).where(eq(products.branchId, branchId)).all();
  const totalStockValue = items.reduce((s, p) => s + p.currentStock * p.unitCost, 0);
  const critical = items.filter(p => p.currentStock <= p.reorderThreshold).length;
  const low = items.filter(p => p.currentStock > p.reorderThreshold && p.currentStock <= p.parLevel).length;

  const byCategoryStatus = new Map<string, { ok: number; low: number; critical: number }>();
  for (const p of items) {
    const entry = byCategoryStatus.get(p.category) ?? { ok: 0, low: 0, critical: 0 };
    if (p.currentStock <= p.reorderThreshold) entry.critical++;
    else if (p.currentStock <= p.parLevel) entry.low++;
    else entry.ok++;
    byCategoryStatus.set(p.category, entry);
  }

  const consumption = db.select().from(stockTransactions).where(and(eq(stockTransactions.branchId, branchId), eq(stockTransactions.type, "out"), gte(stockTransactions.createdAt, start), lte(stockTransactions.createdAt, end))).all();
  const productMap = new Map(items.map(p => [p.id, p]));
  const consumptionByCategory = new Map<string, number>();
  for (const t of consumption) {
    const product = productMap.get(t.productId);
    if (!product) continue;
    const value = Math.abs(t.quantity) * product.unitCost;
    consumptionByCategory.set(product.category, (consumptionByCategory.get(product.category) ?? 0) + value);
  }

  const receivedPOs = db.select().from(purchaseOrders).where(and(eq(purchaseOrders.branchId, branchId), eq(purchaseOrders.status, "received"), gte(purchaseOrders.receivedAt, start), lte(purchaseOrders.receivedAt, end))).all();
  const supplierSpend = new Map<string, number>();
  for (const po of receivedPOs) {
    const poItems = db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)).all();
    const value = poItems.reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const supplier = db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).get();
    const key = supplier?.name ?? "Unknown";
    supplierSpend.set(key, (supplierSpend.get(key) ?? 0) + value);
  }

  res.json({
    start: startStr, end: endStr, totalStockValue, criticalItems: critical, lowStockItems: low,
    supplierSpend: Array.from(supplierSpend.entries()).map(([supplier, amount]) => ({ supplier, amount })),
    totalSupplierSpend: Array.from(supplierSpend.values()).reduce((a, b) => a + b, 0),
    consumptionByCategory: Array.from(consumptionByCategory.entries()).map(([category, value]) => ({ category, value })),
    stockStatusByCategory: Array.from(byCategoryStatus.entries()).map(([category, v]) => ({ category, ...v })),
  });
});

// ─── RP-06 Staff Reports ────────────────────────────────────────────────────
// "Hours worked" assumes an 8-hour standard shift (Morning/Evening/Night)
// since shifts are scheduled as day-parts, not clocked start/end times --
// there's no time clock in this schema. Overtime is dropped entirely for
// the same reason: it needs actual-vs-scheduled clock times to mean
// anything. "Shift coverage gaps" is shown as unstaffed shift-slots
// (date x shift-type with zero people assigned), not a severity-ranked gap
// analysis. See ROADMAP.md.
const STANDARD_SHIFT_HOURS = 8;

router.get("/staff", requireAuth, requirePermission("reports:staff"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const { start, end, startStr, endStr } = parseRange(req);
  const startDateStr = startStr, endDateStr = endStr;

  const staff = db.select().from(users).where(and(eq(users.branchId, branchId), eq(users.status, "active"))).all();
  const deptOf = new Map(staff.map(s => [s.id, s.department ?? "Unassigned"]));

  const shiftRows = db.select().from(shifts).where(and(eq(shifts.branchId, branchId), gte(shifts.date, startDateStr), lte(shifts.date, endDateStr))).all();
  const hoursByDept = new Map<string, number>();
  for (const s of shiftRows) {
    if (s.shiftType === "Off") continue;
    const dept = deptOf.get(s.userId) ?? "Unassigned";
    hoursByDept.set(dept, (hoursByDept.get(dept) ?? 0) + STANDARD_SHIFT_HOURS);
  }

  const attendanceRows = db.select().from(attendance).where(and(eq(attendance.branchId, branchId), gte(attendance.date, startDateStr), lte(attendance.date, endDateStr))).all();
  const overallAttendance = attendanceRows.length > 0 ? Math.round((attendanceRows.filter(a => a.status === "present").length / attendanceRows.length) * 1000) / 10 : null;
  const attendanceByDept = new Map<string, { present: number; total: number }>();
  for (const a of attendanceRows) {
    const dept = deptOf.get(a.userId) ?? "Unassigned";
    const entry = attendanceByDept.get(dept) ?? { present: 0, total: 0 };
    entry.total++; if (a.status === "present") entry.present++;
    attendanceByDept.set(dept, entry);
  }

  // Unstaffed shift-slots: for each department that has any shift rows in
  // range, days x shift-types with zero staff assigned.
  const OPERATIONAL_SHIFT_TYPES = ["Morning", "Evening", "Night"] as const;
  const deptDates = new Set(shiftRows.map(s => `${deptOf.get(s.userId)}|${s.date}|${s.shiftType}`));
  let unstaffedSlots = 0;
  const deptsWithShifts = new Set(shiftRows.map(s => deptOf.get(s.userId)));
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + DAY_MS)) {
    const dateStr = d.toISOString().slice(0, 10);
    for (const dept of deptsWithShifts) {
      for (const st of OPERATIONAL_SHIFT_TYPES) {
        if (!deptDates.has(`${dept}|${dateStr}|${st}`)) unstaffedSlots++;
      }
    }
  }

  res.json({
    start: startStr, end: endStr,
    totalHoursWorked: Array.from(hoursByDept.values()).reduce((a, b) => a + b, 0),
    hoursByDepartment: Array.from(hoursByDept.entries()).map(([department, hours]) => ({ department, hours })),
    overallAttendanceRate: overallAttendance,
    attendanceByDepartment: Array.from(attendanceByDept.entries()).map(([department, v]) => ({ department, rate: Math.round((v.present / v.total) * 1000) / 10 })),
    unstaffedShiftSlots: unstaffedSlots,
  });
});

export default router;
