// R-01 Reservation Grid, R-02 New Reservation, FD-01 Check-In (steps 1-6),
// FD-10 Folio, FD-02 Check-Out & Settlement — the Phase 1 vertical slice.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq, ne, or, lt, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import { reservations, guests, rooms, folioCharges, payments } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { folioSummary } from "../services/folio.js";
import { revokeCredentialsForReservation } from "../services/locks/access.js";
import { logAudit } from "../services/audit.js";

const router = Router();

function loadReservationOrThrow(id: string, branchId: string) {
  const reservation = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!reservation || reservation.branchId !== branchId) return null;
  return reservation;
}

// R-01 Reservation Grid — list with guest name + room number joined in,
// since the grid renders both without a second round trip.
router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const rows = db.select({
    id: reservations.id,
    guestId: reservations.guestId,
    roomId: reservations.roomId,
    checkInDate: reservations.checkInDate,
    checkOutDate: reservations.checkOutDate,
    status: reservations.status,
    rate: reservations.rate,
    adults: reservations.adults,
    children: reservations.children,
    specialRequests: reservations.specialRequests,
    guestFirstName: guests.firstName,
    guestLastName: guests.lastName,
    roomNumber: rooms.number,
  })
    .from(reservations)
    .leftJoin(guests, eq(reservations.guestId, guests.id))
    .leftJoin(rooms, eq(reservations.roomId, rooms.id))
    .where(and(eq(reservations.branchId, branchId), ne(reservations.status, "cancelled")))
    .all();
  res.json(rows);
});

const createReservationSchema = z.object({
  guestId: z.string().optional(),
  newGuest: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }).optional(),
  roomId: z.string().optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  rate: z.number().positive(),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  specialRequests: z.string().optional(),
}).refine((d) => d.guestId || d.newGuest, { message: "guestId or newGuest is required" });

// R-02 New Reservation. Conflict detection per Blueprint: "Cannot submit
// while conflict exists" for the selected room + date range.
router.post("/", requireAuth, requirePermission("reservations:create"), (req: AuthedRequest, res) => {
  const parsed = createReservationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const branchId = req.auth!.branchId;

  const checkInDate = new Date(d.checkInDate);
  const checkOutDate = new Date(d.checkOutDate);
  if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime()) || checkOutDate <= checkInDate) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }

  let guestId = d.guestId;
  if (!guestId && d.newGuest) {
    guestId = nanoid();
    db.insert(guests).values({
      id: guestId,
      branchId,
      firstName: d.newGuest.firstName,
      lastName: d.newGuest.lastName,
      email: d.newGuest.email,
      phone: d.newGuest.phone,
      vip: false,
      blacklisted: false,
      createdAt: new Date(),
    }).run();
  }

  if (d.roomId) {
    const room = db.select().from(rooms).where(eq(rooms.id, d.roomId)).get();
    if (!room || room.branchId !== branchId) return res.status(400).json({ error: "ROOM_NOT_FOUND" });

    // Overlap: existing.checkIn < new.checkOut AND existing.checkOut > new.checkIn
    const conflict = db.select().from(reservations).where(and(
      eq(reservations.roomId, d.roomId),
      or(eq(reservations.status, "confirmed"), eq(reservations.status, "checked_in")),
      lt(reservations.checkInDate, checkOutDate),
      gt(reservations.checkOutDate, checkInDate),
    )).get();
    if (conflict) return res.status(409).json({ error: "ROOM_CONFLICT", conflictingReservationId: conflict.id });
  }

  const id = nanoid();
  const now = new Date();
  db.insert(reservations).values({
    id,
    branchId,
    guestId: guestId!,
    roomId: d.roomId,
    checkInDate,
    checkOutDate,
    status: "confirmed",
    rate: d.rate,
    adults: d.adults,
    children: d.children,
    specialRequests: d.specialRequests,
    createdBy: req.auth!.userId,
    createdAt: now,
  }).run();

  logAudit({ userId: req.auth!.userId, branchId, action: "reservation_created", module: "Reservations", recordId: id, ipAddress: req.ip });
  const created = db.select().from(reservations).where(eq(reservations.id, id)).get();
  res.status(201).json(created);
});

// FD-01 Steps 1-3 (select/verify/assign) and FD-10 folio all read this detail view.
router.get("/:id", requireAuth, (req: AuthedRequest, res) => {
  const reservation = loadReservationOrThrow(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });

  const guest = db.select().from(guests).where(eq(guests.id, reservation.guestId)).get();
  const room = reservation.roomId ? db.select().from(rooms).where(eq(rooms.id, reservation.roomId)).get() : null;
  const folio = folioSummary(reservation.id);

  res.json({ ...reservation, guest, room, folio });
});

const checkInSchema = z.object({ roomId: z.string().optional() });

// FD-01 Step 6 "Confirm Check-In" -- room -> Occupied, folio opens (folio
// itself is just the reservation's charges, created on first POST charge).
router.post("/:id/check-in", requireAuth, requirePermission("reservations:checkinout"), (req: AuthedRequest, res) => {
  const reservation = loadReservationOrThrow(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });
  if (reservation.status !== "confirmed" && reservation.status !== "pending") {
    return res.status(409).json({ error: "INVALID_STATUS", status: reservation.status });
  }

  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const roomId = parsed.data.roomId ?? reservation.roomId;
  if (!roomId) return res.status(400).json({ error: "NO_ROOM_ASSIGNED" });

  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  if (!room || room.branchId !== req.auth!.branchId) return res.status(400).json({ error: "ROOM_NOT_FOUND" });
  if (room.status !== "available") return res.status(409).json({ error: "ROOM_NOT_AVAILABLE", roomStatus: room.status });
  // Blueprint FD-01 step 3: room "must be Clean or Inspected to assign" --
  // this is the Housekeeping module (HK-01) actually gating Front Desk.
  if (room.housekeepingStatus !== "clean" && room.housekeepingStatus !== "inspected") {
    return res.status(409).json({ error: "ROOM_NOT_CLEAN", housekeepingStatus: room.housekeepingStatus });
  }

  db.update(reservations).set({ status: "checked_in", roomId }).where(eq(reservations.id, reservation.id)).run();
  db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, roomId)).run();

  // Post the room charge itself to the folio -- until now only ancillary
  // charges (restaurant, minibar, etc.) ever hit folio_charges, which meant
  // the room rate was never actually billed to the guest. Caught while
  // building FI-03 Daily Summary, whose "Room Revenue" category would
  // otherwise always read zero. One line item for the full stay, posted at
  // check-in; real PMS behavior (nightly auto-posting) is a later refinement.
  const nights = Math.max(1, Math.round((reservation.checkOutDate.getTime() - reservation.checkInDate.getTime()) / 86400000));
  db.insert(folioCharges).values({
    id: nanoid(),
    reservationId: reservation.id,
    category: "Room",
    description: `Room ${room.number} — ${nights} night${nights !== 1 ? "s" : ""}`,
    quantity: nights,
    unitPrice: reservation.rate,
    amount: Math.round(nights * reservation.rate * 100) / 100,
    postedBy: req.auth!.userId,
    postedAt: new Date(),
  }).run();

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "guest_checked_in", module: "Reservations", recordId: reservation.id, details: `Room ${room.number}`, ipAddress: req.ip });
  const updated = db.select().from(reservations).where(eq(reservations.id, reservation.id)).get();
  res.json(updated);
});

const postChargeSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPrice: z.number().nonnegative(),
});

// FD-10 "Post Manual Charge."
router.post("/:id/folio/charges", requireAuth, requirePermission("folio:postcharge"), (req: AuthedRequest, res) => {
  const reservation = loadReservationOrThrow(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });
  if (reservation.status !== "checked_in") return res.status(409).json({ error: "GUEST_NOT_IN_HOUSE" });

  const parsed = postChargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const amount = Math.round(d.quantity * d.unitPrice * 100) / 100;

  const id = nanoid();
  db.insert(folioCharges).values({
    id,
    reservationId: reservation.id,
    category: d.category,
    description: d.description,
    quantity: d.quantity,
    unitPrice: d.unitPrice,
    amount,
    postedBy: req.auth!.userId,
    postedAt: new Date(),
  }).run();

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "folio_charge_posted", module: "Finance", recordId: id, details: `${d.category}: ${d.description} (${amount})`, ipAddress: req.ip });
  res.status(201).json(folioSummary(reservation.id));
});

const checkOutSchema = z.object({
  paymentAmount: z.number().nonnegative().optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
});

// FD-02 "Settle & Release Room" -- refuses to complete while a balance
// remains, matching the screen's own "Settle Folio" framing.
router.post("/:id/check-out", requireAuth, requirePermission("reservations:checkinout"), async (req: AuthedRequest, res) => {
  const reservation = loadReservationOrThrow(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });
  if (reservation.status !== "checked_in") return res.status(409).json({ error: "INVALID_STATUS", status: reservation.status });

  const parsed = checkOutSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const { paymentAmount, paymentMethod } = parsed.data;

  if (paymentAmount && paymentAmount > 0) {
    if (!paymentMethod) return res.status(400).json({ error: "PAYMENT_METHOD_REQUIRED" });
    db.insert(payments).values({
      id: nanoid(),
      reservationId: reservation.id,
      amount: paymentAmount,
      method: paymentMethod,
      receivedBy: req.auth!.userId,
      receivedAt: new Date(),
    }).run();
  }

  const summary = folioSummary(reservation.id);
  if (summary.balance > 0) {
    return res.status(409).json({ error: "BALANCE_REMAINING", balance: summary.balance });
  }

  db.update(reservations).set({ status: "checked_out" }).where(eq(reservations.id, reservation.id)).run();
  // Room -> Housekeeping's queue. housekeepingStatus resets to "dirty"
  // regardless of what it was -- a guest just vacated it, it needs a real
  // clean pass before it's bookable again (HK-01 picks it up from here).
  db.update(rooms).set({ status: "cleaning", housekeepingStatus: "dirty" }).where(eq(rooms.id, reservation.roomId!)).run();

  // Blueprint 6.9: automatic revocation at check-out. Real TTLock calls
  // (or a real queue entry if TTLock is unreachable) -- not a UI-only
  // status flip. Never blocks check-out on the outcome: credentials are
  // time-limited and stop working at checkout time regardless, per 6.9's
  // own offline-queued note.
  const accessRevoked = await revokeCredentialsForReservation(reservation.id, "checkout", req.auth!.userId);

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "guest_checked_out", module: "Reservations", recordId: reservation.id, ipAddress: req.ip });
  res.json({ reservationId: reservation.id, status: "checked_out", folio: summary, accessRevoked });
});

export default router;
