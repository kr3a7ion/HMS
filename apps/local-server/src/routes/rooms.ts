import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { rooms, reservations, guests, roomTypes } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { businessDateOf, currentBusinessDate, formatBusinessDate } from "../lib/businessDate.js";

const router = Router();

// R-01 Reservation Grid / FD-03 Room Assignment / FD-01 Step 3 all read this.
router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, req.auth!.branchId)).all();
  res.json(branchRooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })));
});

// Backend Blueprint B10 — GET /rooms/assignment-board?date
//
// The one screen the front desk works from at the start of a shift: every
// room, its booking status, its housekeeping status, who is arriving into it
// and who is leaving it. Assembled server-side because doing it client-side
// means four requests and a join in the browser, and the four can disagree
// with each other if a booking lands between them.
router.get("/assignment-board", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;

  // Defaults to the BUSINESS date, not the wall clock: before the roll hour
  // the trading day is still yesterday's, and the night porter working this
  // board needs yesterday's arrivals, not an empty list.
  const raw = req.query.date;
  let date = currentBusinessDate(branchId);
  if (typeof raw === "string" && raw !== "") {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return res.status(400).json({ error: "INVALID_DATE" });
    date = businessDateOf(parsed);
  }

  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const typeById = new Map(
    db.select().from(roomTypes).where(eq(roomTypes.branchId, branchId)).all().map(t => [t.id, t]),
  );
  const guestById = new Map(
    db.select().from(guests).where(eq(guests.branchId, branchId)).all().map(g => [g.id, g]),
  );
  const branchReservations = db.select().from(reservations)
    .where(eq(reservations.branchId, branchId)).all()
    .filter(r => r.status !== "cancelled");

  const nameOf = (guestId: string) => {
    const guest = guestById.get(guestId);
    return guest ? `${guest.firstName} ${guest.lastName}`.trim() : null;
  };
  const brief = (r: typeof reservations.$inferSelect) => ({
    reservationId: r.id,
    guestName: nameOf(r.guestId),
    vip: guestById.get(r.guestId)?.vip ?? false,
    status: r.status,
    checkInDate: r.checkInDate,
    checkOutDate: r.checkOutDate,
    rateKobo: r.rateKobo,
  });

  const board = branchRooms.map(room => {
    const forRoom = branchReservations.filter(r => r.roomId === room.id);
    return {
      roomId: room.id,
      number: room.number,
      floor: room.floor,
      type: room.type,
      roomTypeId: room.roomTypeId,
      roomTypeName: room.roomTypeId ? typeById.get(room.roomTypeId)?.name ?? null : null,
      status: room.status,
      housekeepingStatus: room.housekeepingStatus,
      dnd: room.dnd,
      priority: room.priority,
      arrival: forRoom.find(r =>
        businessDateOf(r.checkInDate).getTime() === date.getTime()
        && (r.status === "confirmed" || r.status === "pending")) ?? null,
      departure: forRoom.find(r =>
        businessDateOf(r.checkOutDate).getTime() === date.getTime()
        && r.status === "checked_in") ?? null,
      occupant: forRoom.find(r =>
        r.status === "checked_in"
        && businessDateOf(r.checkInDate) <= date
        && businessDateOf(r.checkOutDate) > date) ?? null,
    };
  }).map(row => ({
    ...row,
    arrival: row.arrival ? brief(row.arrival) : null,
    departure: row.departure ? brief(row.departure) : null,
    occupant: row.occupant ? brief(row.occupant) : null,
  })).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  // Unassigned arrivals are the reason this board exists: rooms that need a
  // guest put in them today. Listing them beside the grid is what turns it
  // from a status display into a work queue.
  const unassignedArrivals = branchReservations
    .filter(r => r.roomId == null
      && businessDateOf(r.checkInDate).getTime() === date.getTime()
      && (r.status === "confirmed" || r.status === "pending"))
    .map(r => ({
      ...brief(r),
      roomTypeId: r.roomTypeId,
      roomTypeName: r.roomTypeId ? typeById.get(r.roomTypeId)?.name ?? null : null,
    }));

  res.json({
    businessDate: formatBusinessDate(date),
    summary: {
      total: board.length,
      occupied: board.filter(r => r.status === "occupied").length,
      available: board.filter(r => r.status === "available").length,
      cleaning: board.filter(r => r.status === "cleaning").length,
      outOfService: board.filter(r => r.status === "out_of_service" || r.status === "maintenance").length,
      arrivals: board.filter(r => r.arrival).length + unassignedArrivals.length,
      departures: board.filter(r => r.departure).length,
      unassignedArrivals: unassignedArrivals.length,
    },
    rooms: board,
    unassignedArrivals,
  });
});

export default router;
