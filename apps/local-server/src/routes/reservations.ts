// R-01 Reservation Grid, R-02 New Reservation, FD-01 Check-In (steps 1-6),
// FD-10 Folio, FD-02 Check-Out & Settlement — the Phase 1 vertical slice.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq, ne, or, lt, gt } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  reservations, guests, rooms, folioCharges, payments, ratePlans,
  roomTypes, accessCredentials, invoices, auditLog, noShowPostings,
} from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { folioSummary } from "../services/folio.js";
import { mulKobo, formatNaira } from "../lib/money.js";
import { revokeCredentialsForReservation } from "../services/locks/access.js";
import { logAudit } from "../services/audit.js";
import { immediateTransaction, transaction, RoomUnavailableError } from "../db/tx.js";
import { HandlerError, isHandlerError } from "../lib/handlerError.js";
import { claimRoomNights, releaseRoomNights, findConflicts, nightsBetween } from "../services/roomInventory.js";
import { claimInventory, releaseInventory, NoInventoryError, requireRoomType } from "../services/availability/inventory.js";
import { defaultRatePlan, resolveRate } from "../services/availability/rates.js";
import { rebookReservation, validateRoomForReservation } from "../services/reservations/rebook.js";
import { cancelReservation, previewCancellation, postNoShowPenalty } from "../services/cancellation/index.js";
import { roleHasAnyPermission } from "../auth/permissions.js";
import { postRoomChargeForNight } from "../services/nightAudit/roomCharges.js";
import { businessDateOf, formatBusinessDate } from "../lib/businessDate.js";
import { paginate, parsePageOptions } from "../lib/pagination.js";
import { currentBusinessDate } from "../lib/businessDate.js";
import { postOutstandingRoomNights } from "../services/nightAudit/roomCharges.js";
import { postChargeWithTax } from "../services/tax/posting.js";

const router = Router();

/**
 * Turns an error thrown out of a transaction into the right HTTP response.
 * Anything unrecognised is re-thrown to Express's error handler rather than
 * being flattened into a 500 here -- a real bug should reach the error log
 * with its stack, not be disguised as a handled condition.
 */
function respondToHandlerError(res: import("express").Response, err: unknown, roomId?: string | null) {
  if (isHandlerError(err)) {
    return res.status(err.status).json({ error: err.code, ...err.detail });
  }
  if (err instanceof NoInventoryError) {
    // Type-level sell-out (B8). Distinct from ROOM_UNAVAILABLE, which is a
    // specific room being taken -- the caller can offer a different type for
    // one and a different room for the other, so they must not be conflated.
    return res.status(409).json({
      error: "NO_INVENTORY",
      roomTypeId: err.roomTypeId,
      soldOutDates: err.soldOutDates,
    });
  }
  if (err instanceof RoomUnavailableError) {
    // The unique index fired -- someone else took at least one of these
    // nights between the availability check and the insert. This is the
    // race the constraint exists to catch, so it is a normal 409, not a
    // server fault.
    return res.status(409).json({
      error: "ROOM_UNAVAILABLE",
      roomId: err.roomId ?? roomId ?? null,
      conflictingDates: err.conflictingDates,
    });
  }
  throw err;
}

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
    rateKobo: reservations.rateKobo,
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
  // Backend Blueprint B8. Booking a TYPE is the normal case; a specific room
  // is assigned at check-in. Supplying roomId still works and derives the
  // type from the room.
  roomTypeId: z.string().optional(),
  ratePlanId: z.string().optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  // Integer kobo (B2 / invariant 2). The client sends minor units; nothing
  // in this API accepts or returns a naira float.
  //
  // B8 makes this OPTIONAL: when a room type is known the rate comes from
  // the rate calendar, which is the whole point of having one. An explicit
  // rateKobo still wins -- negotiated and comp rates are real -- but it is
  // now a deliberate override rather than the only way to set a price.
  rateKobo: z.number().int().positive().optional(),
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

  // Everything below is one IMMEDIATE transaction (B3 / invariant 3). It is
  // a check-then-write: availability is read, then acted on. A deferred
  // transaction would start in read mode and only take the write lock at
  // the first INSERT, leaving a window where two requests both read "free".
  //
  // The guest insert is inside too -- creating a walk-in guest and then
  // failing to seat them would leave an orphan guest record behind.
  const id = nanoid();
  const now = new Date();
  try {
    const created = immediateTransaction(() => {
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

      let roomTypeId = d.roomTypeId ?? null;

      if (d.roomId) {
        const room = db.select().from(rooms).where(eq(rooms.id, d.roomId)).get();
        if (!room || room.branchId !== branchId) throw new HandlerError(400, "ROOM_NOT_FOUND");
        // A named room settles the type; an explicit conflicting one is a
        // mistake worth surfacing rather than silently resolving either way.
        if (roomTypeId && room.roomTypeId && roomTypeId !== room.roomTypeId) {
          throw new HandlerError(400, "ROOM_TYPE_MISMATCH", { roomTypeId: room.roomTypeId });
        }
        roomTypeId = room.roomTypeId ?? roomTypeId;

        // Re-read INSIDE the transaction. A conflict check performed before
        // BEGIN IMMEDIATE would be a read the lock does not make true.
        //
        // B8: this reads room_night_inventory (the authoritative per-room
        // per-night table) rather than scanning reservations for overlapping
        // ranges. Same answer, but it is the table the UNIQUE index actually
        // guards, so the friendly error and the guarantee can no longer
        // disagree -- and no code path derives availability from a scan.
        const conflicts = findConflicts(d.roomId, nightsBetween(checkInDate, checkOutDate));
        if (conflicts.length > 0) {
          // Same ROOM_CONFLICT contract as before, and now strictly more
          // useful: the clashing booking's id comes from the inventory row
          // itself, and the exact nights come with it.
          throw new HandlerError(409, "ROOM_CONFLICT", {
            conflictingReservationId: conflicts[0].reservationId,
            conflictingDates: conflicts.map(c => c.stayDate.toISOString().slice(0, 10)).sort(),
          });
        }
      }

      // B8 rate resolution. An explicit rateKobo wins (negotiated rates are
      // real); otherwise the calendar prices it. Refusing to guess is
      // deliberate -- a reservation with no resolvable rate would otherwise
      // be booked at zero.
      let rateKobo = d.rateKobo ?? null;
      let ratePlanId = d.ratePlanId ?? null;
      if (rateKobo == null) {
        if (!roomTypeId) throw new HandlerError(400, "RATE_REQUIRED", {
          message: "Supply rateKobo, or a roomTypeId/roomId so the rate can be resolved from the rate calendar.",
        });
        const plan = ratePlanId
          ? db.select().from(ratePlans).where(eq(ratePlans.id, ratePlanId)).get() ?? null
          : defaultRatePlan(branchId);
        if (!plan || plan.branchId !== branchId) throw new HandlerError(400, "NO_RATE_PLAN");
        ratePlanId = plan.id;

        // The stay total, priced night by night -- the same resolver the
        // quote endpoint uses, so a quote and a booking cannot disagree.
        let total = 0;
        for (const night of nightsBetween(checkInDate, checkOutDate)) {
          const resolved = resolveRate(plan.id, roomTypeId, night);
          if (resolved.rateKobo == null) {
            throw new HandlerError(409, "NO_RATE_FOR_DATE", { stayDate: night.toISOString().slice(0, 10) });
          }
          if (resolved.stopSell) {
            throw new HandlerError(409, "STOP_SELL", { stayDate: night.toISOString().slice(0, 10) });
          }
          total += resolved.rateKobo;
        }
        // reservations.rateKobo is the NIGHTLY rate (the night audit posts
        // one night at a time against it), so store the average rather than
        // the stay total. They are equal for a flat rate, and for a varying
        // one this keeps the stay total correct to the kobo.
        const nightCount = nightsBetween(checkInDate, checkOutDate).length;
        rateKobo = Math.round(total / nightCount);
      }

      db.insert(reservations).values({
        id,
        branchId,
        guestId: guestId!,
        roomId: d.roomId,
        roomTypeId,
        ratePlanId,
        checkInDate,
        checkOutDate,
        status: "confirmed",
        rateKobo,
        adults: d.adults,
        children: d.children,
        specialRequests: d.specialRequests,
        createdBy: req.auth!.userId,
        createdAt: now,
      }).run();

      // The real double-booking guard: one row per night, UNIQUE on
      // (room_id, stay_date). The overlap check above is the friendly
      // error; THIS is the guarantee. Two concurrent bookings for the same
      // night cannot both land here regardless of how they interleave.
      if (d.roomId) claimRoomNights(branchId, d.roomId, id, checkInDate, checkOutDate);

      // B8: the type-level counter, incremented in THIS transaction so the
      // count and the bookings can never disagree. Throws NoInventoryError
      // if any night is sold out; returns the nights that went into the
      // controlled oversell allowance so the caller can be told.
      let oversoldDates: string[] = [];
      if (roomTypeId) {
        oversoldDates = claimInventory(branchId, roomTypeId, checkInDate, checkOutDate).oversoldDates;
      }

      logAudit({ userId: req.auth!.userId, branchId, action: "reservation_created", module: "Reservations", recordId: id, ipAddress: req.ip });
      return {
        reservation: db.select().from(reservations).where(eq(reservations.id, id)).get(),
        oversoldDates,
      };
    });
    // An oversell is permitted but never silent: the desk needs to know it
    // has sold past its physical rooms while there is still time to act.
    res.status(201).json(created.oversoldDates.length > 0
      ? { ...created.reservation, warning: "OVERSOLD", oversoldDates: created.oversoldDates }
      : created.reservation);
  } catch (err) {
    return respondToHandlerError(res, err, d.roomId);
  }
});

// ─── B10 list endpoints ─────────────────────────────────────────────────
//
// REGISTERED BEFORE `/:id` DELIBERATELY. Express matches in order, so a
// `/search` declared after `/:id` never runs -- it is swallowed as a
// reservation whose id is the literal string "search", which 404s and looks
// like a data problem rather than a routing one.

/** Joins the rows a list screen needs so the client makes one request. */
function decorate(rows: (typeof reservations.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const guestById = new Map(db.select().from(guests).where(eq(guests.branchId, rows[0].branchId)).all().map(g => [g.id, g]));
  const roomById = new Map(db.select().from(rooms).where(eq(rooms.branchId, rows[0].branchId)).all().map(r => [r.id, r]));
  const typeById = new Map(db.select().from(roomTypes).where(eq(roomTypes.branchId, rows[0].branchId)).all().map(t => [t.id, t]));

  return rows.map(r => {
    const guest = guestById.get(r.guestId);
    const room = r.roomId ? roomById.get(r.roomId) : null;
    const type = r.roomTypeId ? typeById.get(r.roomTypeId) : null;
    return {
      ...r,
      guestName: guest ? `${guest.firstName} ${guest.lastName}`.trim() : null,
      guestPhone: guest?.phone ?? null,
      guestEmail: guest?.email ?? null,
      vip: guest?.vip ?? false,
      roomNumber: room?.number ?? null,
      roomTypeName: type?.name ?? null,
      roomTypeCode: type?.code ?? null,
    };
  });
}

const ACTIVE_STATUSES = ["confirmed", "pending", "checked_in"];

// GET /reservations/search — name|number|phone|email|room|range|status|plan
router.get("/search", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  try {
    const page = parsePageOptions(req.query as Record<string, unknown>);
    let rows = db.select().from(reservations).where(eq(reservations.branchId, branchId)).all();

    const { q, status, from, to, ratePlanId, roomTypeId, roomNumber } = req.query;
    if (typeof status === "string" && status !== "") {
      const wanted = new Set(status.split(","));
      rows = rows.filter(r => wanted.has(r.status));
    }
    if (typeof ratePlanId === "string") rows = rows.filter(r => r.ratePlanId === ratePlanId);
    if (typeof roomTypeId === "string") rows = rows.filter(r => r.roomTypeId === roomTypeId);
    // Range means "stays that overlap it", not "stays contained by it" -- a
    // guest already in-house on the from-date is the one the desk is looking
    // for, and a containment filter would hide them.
    if (typeof from === "string" && from !== "") {
      const fromDate = new Date(from);
      if (!Number.isNaN(fromDate.getTime())) rows = rows.filter(r => r.checkOutDate > fromDate);
    }
    if (typeof to === "string" && to !== "") {
      const toDate = new Date(to);
      if (!Number.isNaN(toDate.getTime())) rows = rows.filter(r => r.checkInDate < toDate);
    }

    let decorated = decorate(rows);
    if (typeof roomNumber === "string" && roomNumber !== "") {
      decorated = decorated.filter(r => r.roomNumber === roomNumber);
    }
    if (typeof q === "string" && q.trim() !== "") {
      const needle = q.trim().toLowerCase();
      decorated = decorated.filter(r =>
        r.id.toLowerCase().includes(needle)
        || (r.guestName ?? "").toLowerCase().includes(needle)
        || (r.guestPhone ?? "").toLowerCase().includes(needle)
        || (r.guestEmail ?? "").toLowerCase().includes(needle)
        || (r.roomNumber ?? "").toLowerCase().includes(needle));
    }

    // Newest arrivals first: that is what a search screen wants at the top.
    const result = paginate(decorated, page, r => r.checkInDate.toISOString(), "desc");
    res.json(result);
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

/**
 * The date a front-desk list means by "today".
 *
 * THE BUSINESS DATE, not the wall clock (invariant 9). At 01:30 with a 3am
 * roll hour the trading day is still yesterday's, so the arrivals list must
 * still show yesterday's arrivals -- the night porter is working that list,
 * and switching it at midnight would lose the guests still due in.
 */
function listDate(req: AuthedRequest): Date {
  const raw = req.query.date;
  if (typeof raw === "string" && raw !== "") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return businessDateOf(parsed);
  }
  return currentBusinessDate(req.auth!.branchId);
}

router.get("/arrivals", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const date = listDate(req);
  const rows = db.select().from(reservations).where(eq(reservations.branchId, branchId)).all()
    .filter(r => businessDateOf(r.checkInDate).getTime() === date.getTime()
      && r.status !== "cancelled");
  res.json({
    businessDate: formatBusinessDate(date),
    ...paginate(decorate(rows), parsePageOptions(req.query as Record<string, unknown>), r => r.id),
  });
});

router.get("/departures", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const date = listDate(req);
  const rows = db.select().from(reservations).where(eq(reservations.branchId, branchId)).all()
    .filter(r => businessDateOf(r.checkOutDate).getTime() === date.getTime()
      && r.status !== "cancelled" && r.status !== "no_show");

  // Departures is the one list where the outstanding balance is not
  // decoration: a clerk cannot check anyone out without knowing what they
  // owe, and making the screen fetch it per row would be one request per
  // departing guest every time the list refreshes. Paginate FIRST so the
  // folio work is bounded by page size, not by the whole day's departures.
  const page = paginate(decorate(rows), parsePageOptions(req.query as Record<string, unknown>), r => r.id);
  res.json({
    businessDate: formatBusinessDate(date),
    ...page,
    items: page.items.map(r => {
      const folio = folioSummary(r.id);
      return {
        ...r,
        totalChargesKobo: folio.totalChargesKobo,
        totalPaidKobo: folio.totalPaidKobo,
        balanceKobo: folio.balanceKobo,
      };
    }),
  });
});

router.get("/in-house", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const rows = db.select().from(reservations).where(and(
    eq(reservations.branchId, branchId),
    eq(reservations.status, "checked_in"),
  )).all();
  res.json({
    businessDate: formatBusinessDate(currentBusinessDate(branchId)),
    ...paginate(decorate(rows), parsePageOptions(req.query as Record<string, unknown>), r => r.roomNumber ?? "~"),
  });
});

// FD-01 Steps 1-3 (select/verify/assign) and FD-10 folio all read this detail view.
router.get("/:id", requireAuth, (req: AuthedRequest, res) => {
  const reservation = loadReservationOrThrow(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });

  const guest = db.select().from(guests).where(eq(guests.id, reservation.guestId)).get();
  const room = reservation.roomId ? db.select().from(rooms).where(eq(rooms.id, reservation.roomId)).get() : null;
  const folio = folioSummary(reservation.id);
  const roomType = reservation.roomTypeId
    ? db.select().from(roomTypes).where(eq(roomTypes.id, reservation.roomTypeId)).get() ?? null
    : null;
  const ratePlan = reservation.ratePlanId
    ? db.select().from(ratePlans).where(eq(ratePlans.id, reservation.ratePlanId)).get() ?? null
    : null;

  // B10: the detail view is what FD-01 renders, so everything that screen
  // shows is resolved here rather than in five more round trips.
  // Named columns, not select(): access_credentials carries the raw TTLock
  // API response for debugging, and a reservation detail view is no place to
  // hand that to a browser. credentialReference is already the masked hint
  // (e.g. "74**12"), which is what the screen actually displays.
  const credentials = db.select({
    id: accessCredentials.id,
    credentialType: accessCredentials.credentialType,
    credentialReference: accessCredentials.credentialReference,
    validFrom: accessCredentials.validFrom,
    validTo: accessCredentials.validTo,
    status: accessCredentials.status,
    isDuplicate: accessCredentials.isDuplicate,
    issuedAt: accessCredentials.issuedAt,
    revokedAt: accessCredentials.revokedAt,
    revokeReason: accessCredentials.revokeReason,
    syncStatus: accessCredentials.syncStatus,
  }).from(accessCredentials)
    .where(eq(accessCredentials.reservationId, reservation.id)).all();

  const invoiceRows = db.select().from(invoices)
    .where(eq(invoices.reservationId, reservation.id)).all()
    .sort((a, b) => b.sequenceNumber - a.sequenceNumber);
  const history = db.select().from(auditLog)
    .where(eq(auditLog.recordId, reservation.id)).all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);

  res.json({
    ...reservation, guest, room, roomType, ratePlan, folio,
    credentials, invoices: invoiceRows, history,
  });
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

  // Three writes (reservation status, room status, folio charge) plus a
  // check-then-write on room availability -- IMMEDIATE so the status read
  // below cannot go stale between reading and acting, and transactional so
  // a failure part-way cannot leave a guest checked in to a room that was
  // never marked occupied, or occupied with no room charge on the folio.
  try {
    const updated = immediateTransaction(() => {
      // Re-read room state INSIDE the transaction (blueprint B3: "re-read
      // room status inside the transaction and fail if not assignable").
      const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
      if (!room || room.branchId !== req.auth!.branchId) throw new HandlerError(400, "ROOM_NOT_FOUND");
      if (room.status !== "available") throw new HandlerError(409, "ROOM_NOT_AVAILABLE", { roomStatus: room.status });
      // Blueprint FD-01 step 3: room "must be Clean or Inspected to assign" --
      // this is the Housekeeping module (HK-01) actually gating Front Desk.
      if (room.housekeepingStatus !== "clean" && room.housekeepingStatus !== "inspected") {
        throw new HandlerError(409, "ROOM_NOT_CLEAN", { housekeepingStatus: room.housekeepingStatus });
      }

      // Re-read the reservation too: two concurrent check-ins on the same
      // reservation would otherwise both pass the status check made before
      // the transaction opened, and both post a room charge.
      const current = db.select().from(reservations).where(eq(reservations.id, reservation.id)).get();
      if (!current) throw new HandlerError(404, "NOT_FOUND");
      if (current.status !== "confirmed" && current.status !== "pending") {
        throw new HandlerError(409, "INVALID_STATUS", { status: current.status });
      }

      db.update(reservations).set({ status: "checked_in", roomId }).where(eq(reservations.id, reservation.id)).run();
      db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, roomId)).run();

      // If check-in assigned a different room than the booking held, move
      // the night claims with it -- otherwise the old room stays blocked
      // and the new one is bookable out from under this guest.
      if (roomId !== current.roomId) {
        releaseRoomNights(reservation.id);
        claimRoomNights(req.auth!.branchId, roomId, reservation.id, reservation.checkInDate, reservation.checkOutDate);
      }

      // NO ROOM CHARGE IS POSTED HERE ANY MORE (B5). This used to post the
      // whole stay as one line at check-in, which the code itself flagged as
      // a stand-in for "real PMS behavior (nightly auto-posting)". That is
      // now what happens: the night audit posts one night per night, stamped
      // with that night's business date, so occupancy and revenue reconcile.
      // Leaving both would double-bill every guest.
      //
      // A guest who departs before the next audit is settled at check-out --
      // see postOutstandingRoomNights there.

      logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "guest_checked_in", module: "Reservations", recordId: reservation.id, details: `Room ${room.number}`, ipAddress: req.ip });
      return db.select().from(reservations).where(eq(reservations.id, reservation.id)).get();
    });
    res.json(updated);
  } catch (err) {
    return respondToHandlerError(res, err, roomId);
  }
});

const postChargeSchema = z.object({
  category: z.string().min(1),
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  unitPriceKobo: z.number().int().nonnegative(),
});

// FD-10 "Post Manual Charge."
router.post("/:id/folio/charges", requireAuth, requirePermission("folio:postcharge"), (req: AuthedRequest, res) => {
  const reservation = loadReservationOrThrow(req.params.id, req.auth!.branchId);
  if (!reservation) return res.status(404).json({ error: "NOT_FOUND" });
  if (reservation.status !== "checked_in") return res.status(409).json({ error: "GUEST_NOT_IN_HOUSE" });

  const parsed = postChargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  const amountKobo = mulKobo(d.unitPriceKobo, d.quantity);

  // B6: base row + one row per applicable tax, in one transaction. A base
  // charge that lands without its tax lines bills the guest the wrong amount
  // and leaves nothing on the folio explaining why.
  const posted = transaction(() => {
    const result = postChargeWithTax({
      reservationId: reservation.id,
      branchId: req.auth!.branchId,
      category: d.category,
      description: d.description,
      quantity: d.quantity,
      unitPriceKobo: d.unitPriceKobo,
      amountKobo,
      postedBy: req.auth!.userId,
      businessDate: currentBusinessDate(req.auth!.branchId),
    });
    logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "folio_charge_posted", module: "Finance", recordId: result.chargeId, details: `${d.category}: ${d.description} (${formatNaira(result.totalKobo)}${result.taxTotalKobo !== 0 ? ` incl. ${formatNaira(result.taxTotalKobo)} tax` : ""})`, ipAddress: req.ip });
    return result;
  });

  res.status(201).json({ ...folioSummary(reservation.id), postedChargeId: posted.chargeId, taxTotalKobo: posted.taxTotalKobo });
});

const checkOutSchema = z.object({
  paymentAmountKobo: z.number().int().nonnegative().optional(),
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
  const { paymentAmountKobo, paymentMethod } = parsed.data;

  if (paymentAmountKobo && paymentAmountKobo > 0 && !paymentMethod) {
    return res.status(400).json({ error: "PAYMENT_METHOD_REQUIRED" });
  }

  // A short payment must still be KEPT while check-out is refused -- the
  // guest genuinely handed over that cash, and rolling it back would lose
  // a real payment. So the outcome is returned rather than thrown:
  // returning normally commits, which banks the payment either way, and
  // only the release-the-room half is conditional.
  //
  // IMMEDIATE because this is a check-then-write on the balance; two
  // concurrent check-outs must not both read a zero balance and both
  // release the room.
  const outcome = immediateTransaction(() => {
    const current = db.select().from(reservations).where(eq(reservations.id, reservation.id)).get();
    if (!current) throw new HandlerError(404, "NOT_FOUND");
    if (current.status !== "checked_in") throw new HandlerError(409, "INVALID_STATUS", { status: current.status });

    if (paymentAmountKobo && paymentAmountKobo > 0) {
      db.insert(payments).values({
        id: nanoid(),
        reservationId: reservation.id,
        amountKobo: paymentAmountKobo,
        method: paymentMethod!,
        receivedBy: req.auth!.userId,
        receivedAt: new Date(),
        businessDate: currentBusinessDate(req.auth!.branchId),
      }).run();
    }

    // Bill any nights not yet posted by a night audit. Without this a guest
    // who checks in and leaves the same day -- before any audit runs -- would
    // be charged nothing for the room and could settle at zero.
    postOutstandingRoomNights(reservation.id, currentBusinessDate(req.auth!.branchId), req.auth!.userId);

    const summary = folioSummary(reservation.id);
    if (summary.balanceKobo > 0) {
      return { settled: false as const, summary };
    }

    db.update(reservations).set({ status: "checked_out" }).where(eq(reservations.id, reservation.id)).run();
    // Room -> Housekeeping's queue. housekeepingStatus resets to "dirty"
    // regardless of what it was -- a guest just vacated it, it needs a real
    // clean pass before it's bookable again (HK-01 picks it up from here).
    db.update(rooms).set({ status: "cleaning", housekeepingStatus: "dirty" }).where(eq(rooms.id, reservation.roomId!)).run();
    // The stay is over: free the nights so the room is immediately
    // rebookable. Without this the room stays blocked in inventory for the
    // rest of the original date range.
    releaseRoomNights(reservation.id);

    // B8 type-level counter. Only nights from the current business date
    // FORWARD are released -- the nights already stayed were genuinely sold,
    // and decrementing them would rewrite occupancy history that has already
    // been frozen into daily_revenue. On an on-time departure this range is
    // empty and nothing moves; on an early one it puts the remaining nights
    // back on sale, which is the case that matters.
    if (reservation.roomTypeId) {
      const today = currentBusinessDate(req.auth!.branchId);
      const releaseFrom = today > reservation.checkInDate ? today : reservation.checkInDate;
      if (releaseFrom < reservation.checkOutDate) {
        releaseInventory(reservation.roomTypeId, releaseFrom, reservation.checkOutDate);
      }
    }
    return { settled: true as const, summary };
  });

  if (!outcome.settled) {
    return res.status(409).json({ error: "BALANCE_REMAINING", balanceKobo: outcome.summary.balanceKobo });
  }
  const summary = outcome.summary;

  // Blueprint 6.9: automatic revocation at check-out. Real TTLock calls
  // (or a real queue entry if TTLock is unreachable) -- not a UI-only
  // status flip. Never blocks check-out on the outcome: credentials are
  // time-limited and stop working at checkout time regardless, per 6.9's
  // own offline-queued note.
  const accessRevoked = await revokeCredentialsForReservation(reservation.id, "checkout", req.auth!.userId);

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "guest_checked_out", module: "Reservations", recordId: reservation.id, ipAddress: req.ip });
  res.json({ reservationId: reservation.id, status: "checked_out", folio: summary, accessRevoked });
});

// ─── B10 lifecycle mutations ────────────────────────────────────────────

const patchSchema = z.object({
  checkInDate: z.coerce.date().optional(),
  checkOutDate: z.coerce.date().optional(),
  roomTypeId: z.string().nullable().optional(),
  roomId: z.string().nullable().optional(),
  ratePlanId: z.string().nullable().optional(),
  rateKobo: z.number().int().positive().optional(),
  adults: z.number().int().min(1).optional(),
  children: z.number().int().min(0).optional(),
  specialRequests: z.string().max(2000).nullable().optional(),
  /** Required to move into a room of a different type. */
  allowTypeChange: z.boolean().optional(),
});

// PATCH /reservations/:id — dates, type, room, rate, plan, guests, requests.
//
// The blueprint calls this the highest-risk handler in the batch and it is:
// a date or type change has to revalidate availability and move BOTH
// inventories atomically. All of that lives in rebookReservation, which runs
// inside this IMMEDIATE transaction -- if the new dates cannot be taken, the
// release of the old ones rolls back with it and the stay is untouched.
router.patch("/:id", requireAuth, requirePermission("reservations:create"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;

  try {
    const result = immediateTransaction(() => {
      // Re-read inside the lock: everything below decides based on this row.
      const current = db.select().from(reservations).where(eq(reservations.id, req.params.id)).get();
      if (!current || current.branchId !== branchId) throw new HandlerError(404, "NOT_FOUND");
      if (current.status === "checked_out" || current.status === "cancelled") {
        // Amending a closed stay would move inventory for nights that have
        // already been billed and reported.
        throw new HandlerError(409, "INVALID_STATUS", { status: current.status });
      }
      if (current.status === "checked_in" && d.checkInDate
        && d.checkInDate.getTime() !== current.checkInDate.getTime()) {
        throw new HandlerError(409, "ARRIVAL_LOCKED", {
          message: "The guest has already arrived; the arrival date can no longer be changed.",
        });
      }

      if (d.roomId) {
        validateRoomForReservation(branchId, d.roomId, current, { allowTypeChange: d.allowTypeChange });
      }
      if (d.roomTypeId) requireRoomType(branchId, d.roomTypeId);

      const extra: Record<string, unknown> = {};
      if (d.ratePlanId !== undefined) extra.ratePlanId = d.ratePlanId;
      if (d.rateKobo !== undefined) extra.rateKobo = d.rateKobo;
      if (d.adults !== undefined) extra.adults = d.adults;
      if (d.children !== undefined) extra.children = d.children;
      if (d.specialRequests !== undefined) extra.specialRequests = d.specialRequests;

      const outcome = rebookReservation(current, {
        checkInDate: d.checkInDate,
        checkOutDate: d.checkOutDate,
        roomTypeId: d.roomTypeId,
        roomId: d.roomId,
      }, extra);

      // Re-price only when the dates or type moved AND no explicit rate was
      // given. A rate the operator typed is never silently overwritten.
      if (outcome.changed && d.rateKobo === undefined) {
        const updated = db.select().from(reservations).where(eq(reservations.id, current.id)).get()!;
        const repriced = repriceStay(branchId, updated);
        if (repriced != null) {
          db.update(reservations).set({ rateKobo: repriced }).where(eq(reservations.id, current.id)).run();
        }
      }

      logAudit({
        userId: req.auth!.userId, branchId, action: "reservation_amended", module: "Reservations",
        recordId: current.id,
        details: Object.keys({ ...d }).filter(k => k !== "allowTypeChange").join(", ")
          + (outcome.changed
            ? ` — ${formatBusinessDate(outcome.previous.checkInDate)}→${formatBusinessDate(outcome.previous.checkOutDate)} becomes ${formatBusinessDate(d.checkInDate ?? outcome.previous.checkInDate)}→${formatBusinessDate(d.checkOutDate ?? outcome.previous.checkOutDate)}`
            : ""),
        ipAddress: req.ip,
      });
      return { reservation: db.select().from(reservations).where(eq(reservations.id, current.id)).get()!, outcome };
    });

    res.json(result.outcome.oversoldDates.length > 0
      ? { ...result.reservation, warning: "OVERSOLD", oversoldDates: result.outcome.oversoldDates }
      : result.reservation);
  } catch (err) {
    return respondToHandlerError(res, err, d.roomId ?? undefined);
  }
});

/** Nightly rate for a stay's current shape, or null if it cannot be priced. */
function repriceStay(branchId: string, reservation: typeof reservations.$inferSelect): number | null {
  if (!reservation.roomTypeId) return null;
  const plan = reservation.ratePlanId
    ? db.select().from(ratePlans).where(eq(ratePlans.id, reservation.ratePlanId)).get() ?? null
    : defaultRatePlan(branchId);
  if (!plan) return null;

  const nights = nightsBetween(reservation.checkInDate, reservation.checkOutDate);
  if (nights.length === 0) return null;
  let total = 0;
  for (const night of nights) {
    const resolved = resolveRate(plan.id, reservation.roomTypeId, night);
    // A single unpriced night means the stay cannot be repriced honestly, so
    // the existing rate stands rather than being partially recomputed.
    if (resolved.rateKobo == null) return null;
    total += resolved.rateKobo;
  }
  return Math.round(total / nights.length);
}

const assignRoomSchema = z.object({
  roomId: z.string().min(1),
  allowTypeChange: z.boolean().optional(),
});

// POST /reservations/:id/assign-room — validates type match + HK status.
router.post("/:id/assign-room", requireAuth, requirePermission("reservations:checkinout"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const parsed = assignRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const current = db.select().from(reservations).where(eq(reservations.id, req.params.id)).get();
      if (!current || current.branchId !== branchId) throw new HandlerError(404, "NOT_FOUND");
      if (current.status !== "confirmed" && current.status !== "pending") {
        throw new HandlerError(409, "INVALID_STATUS", { status: current.status });
      }

      const room = validateRoomForReservation(branchId, parsed.data.roomId, current, {
        allowTypeChange: parsed.data.allowTypeChange,
      });

      // An upgrade or downgrade changes what the guest occupies, so it
      // changes what the property has left to sell. Moving the type across
      // with the room is what keeps inventory truthful.
      const typeChanged = room.roomTypeId != null && room.roomTypeId !== current.roomTypeId;
      const outcome = rebookReservation(current, {
        roomId: room.id,
        ...(typeChanged ? { roomTypeId: room.roomTypeId } : {}),
      });

      // The rate implication is recorded, never applied silently: what the
      // guest pays after an upgrade is a commercial decision, not an
      // arithmetic one.
      const updated = db.select().from(reservations).where(eq(reservations.id, current.id)).get()!;
      const indicativeRateKobo = typeChanged ? repriceStay(branchId, updated) : null;

      logAudit({
        userId: req.auth!.userId, branchId, action: "reservation_room_assigned", module: "Reservations",
        recordId: current.id,
        details: `Room ${room.number}`
          + (typeChanged ? ` — type changed, rate card says ${indicativeRateKobo != null ? formatNaira(indicativeRateKobo) : "no rate"} vs ${formatNaira(current.rateKobo)} booked` : ""),
        ipAddress: req.ip,
      });
      return { reservation: updated, room, typeChanged, indicativeRateKobo, outcome };
    });

    res.json({
      ...result.reservation,
      assignedRoomNumber: result.room.number,
      typeChanged: result.typeChanged,
      // Advisory only. The desk decides whether to charge the difference.
      indicativeRateKobo: result.indicativeRateKobo,
      ...(result.outcome.oversoldDates.length > 0
        ? { warning: "OVERSOLD", oversoldDates: result.outcome.oversoldDates } : {}),
    });
  } catch (err) {
    return respondToHandlerError(res, err, parsed.data.roomId);
  }
});

const moveRoomSchema = z.object({
  roomId: z.string().min(1),
  reason: z.string().min(3).max(500),
  allowTypeChange: z.boolean().optional(),
});

// POST /reservations/:id/move-room — for a guest already in-house.
router.post("/:id/move-room", requireAuth, requirePermission("reservations:checkinout"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const parsed = moveRoomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const current = db.select().from(reservations).where(eq(reservations.id, req.params.id)).get();
      if (!current || current.branchId !== branchId) throw new HandlerError(404, "NOT_FOUND");
      if (current.status !== "checked_in") throw new HandlerError(409, "GUEST_NOT_IN_HOUSE", { status: current.status });
      if (!current.roomId) throw new HandlerError(409, "NO_ROOM_ASSIGNED");
      if (current.roomId === parsed.data.roomId) throw new HandlerError(409, "ALREADY_IN_ROOM");

      const from = db.select().from(rooms).where(eq(rooms.id, current.roomId)).get()!;
      const to = validateRoomForReservation(branchId, parsed.data.roomId, current, {
        allowTypeChange: parsed.data.allowTypeChange,
        requireClean: true,
      });
      if (to.status === "occupied") throw new HandlerError(409, "ROOM_OCCUPIED");

      const typeChanged = to.roomTypeId != null && to.roomTypeId !== current.roomTypeId;
      rebookReservation(current, {
        roomId: to.id,
        ...(typeChanged ? { roomTypeId: to.roomTypeId } : {}),
      });

      // The room the guest left needs cleaning before anyone else goes in.
      db.update(rooms).set({ status: "cleaning", housekeepingStatus: "dirty" }).where(eq(rooms.id, from.id)).run();
      db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, to.id)).run();

      logAudit({
        userId: req.auth!.userId, branchId, action: "reservation_room_moved", module: "Reservations",
        recordId: current.id,
        details: `Room ${from.number} → ${to.number} — ${parsed.data.reason}`,
        ipAddress: req.ip,
      });
      return { reservation: db.select().from(reservations).where(eq(reservations.id, current.id)).get()!, from, to };
    });

    res.json({
      ...result.reservation,
      movedFrom: result.from.number,
      movedTo: result.to.number,
    });
  } catch (err) {
    return respondToHandlerError(res, err, parsed.data.roomId);
  }
});

const extendSchema = z.object({ checkOutDate: z.coerce.date() });

// POST /reservations/:id/extend — revalidates availability for the new nights.
router.post("/:id/extend", requireAuth, requirePermission("reservations:checkinout"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const parsed = extendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  try {
    const result = immediateTransaction(() => {
      const current = db.select().from(reservations).where(eq(reservations.id, req.params.id)).get();
      if (!current || current.branchId !== branchId) throw new HandlerError(404, "NOT_FOUND");
      if (current.status !== "checked_in" && current.status !== "confirmed") {
        throw new HandlerError(409, "INVALID_STATUS", { status: current.status });
      }
      if (parsed.data.checkOutDate <= current.checkOutDate) {
        throw new HandlerError(400, "NOT_AN_EXTENSION", {
          message: "The new departure must be later than the current one. Use PATCH to shorten a stay.",
        });
      }

      // rebookReservation releases the whole stay and re-claims it, which is
      // why the extra nights being unavailable leaves NOTHING changed rather
      // than a half-extended stay: the release rolls back with the claim.
      const outcome = rebookReservation(current, { checkOutDate: parsed.data.checkOutDate });

      const addedNights = nightsBetween(current.checkOutDate, parsed.data.checkOutDate).length;
      logAudit({
        userId: req.auth!.userId, branchId, action: "reservation_extended", module: "Reservations",
        recordId: current.id,
        details: `+${addedNights} night(s) — departure ${formatBusinessDate(current.checkOutDate)} → ${formatBusinessDate(parsed.data.checkOutDate)}`,
        ipAddress: req.ip,
      });
      return {
        reservation: db.select().from(reservations).where(eq(reservations.id, current.id)).get()!,
        addedNights, outcome,
      };
    });

    // The added nights are NOT charged here. The night audit posts one night
    // per night against the reservation's rate (B5), so it picks the new
    // nights up on its own -- and posting them now would double-bill.
    res.json({
      ...result.reservation,
      addedNights: result.addedNights,
      ...(result.outcome.oversoldDates.length > 0
        ? { warning: "OVERSOLD", oversoldDates: result.outcome.oversoldDates } : {}),
    });
  } catch (err) {
    return respondToHandlerError(res, err);
  }
});

// GET /reservations/:id/cancellation-preview
//
// MANDATORY, per the blueprint, and it earns that: a guest is told what
// cancelling costs BEFORE it happens, computed by the same function that will
// charge them. Cancelling first and presenting the penalty afterwards is how a
// front desk ends up arguing about money it has already taken.
router.get("/:id/cancellation-preview", requireAuth, requirePermission("reservations:cancel"), (req: AuthedRequest, res) => {
  try {
    const preview = previewCancellation(req.params.id, req.auth!.branchId);
    res.json({
      ...preview,
      display: {
        penalty: formatNaira(preview.penalty.amountKobo),
        penaltyWithTax: formatNaira(preview.penaltyWithTaxKobo),
        paid: formatNaira(preview.paidKobo),
        refundable: formatNaira(Math.max(0, preview.refundableKobo)),
        stillOwed: preview.refundableKobo < 0 ? formatNaira(-preview.refundableKobo) : null,
      },
    });
  } catch (err) {
    return respondToHandlerError(res, err);
  }
});

const cancelSchema = z.object({
  reason: z.string().min(3).max(500),
  waivePenalty: z.boolean().optional(),
  waiverReason: z.string().max(500).optional(),
});

// POST /reservations/:id/cancel — one transaction: penalty → status →
// release both inventories → audit.
router.post("/:id/cancel", requireAuth, requirePermission("reservations:cancel"), (req: AuthedRequest, res) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  // Waiving is a separate grant from cancelling. Without the split, every
  // cancellation becomes free the moment a guest complains loudly enough at
  // the desk.
  if (parsed.data.waivePenalty && !roleHasAnyPermission(req.auth!.role, ["reservations:waive_penalty"])) {
    return res.status(403).json({
      error: "FORBIDDEN", required: "reservations:waive_penalty",
      message: "Cancelling is permitted, but waiving the penalty is not.",
    });
  }

  try {
    const result = immediateTransaction(() => {
      const outcome = cancelReservation(req.params.id, {
        reason: parsed.data.reason,
        waivePenalty: parsed.data.waivePenalty,
        waiverReason: parsed.data.waiverReason,
        actorUserId: req.auth!.userId,
        branchId: req.auth!.branchId,
      });
      logAudit({
        userId: req.auth!.userId, branchId: req.auth!.branchId, action: "reservation_cancelled",
        module: "Reservations", recordId: req.params.id,
        details: `${parsed.data.reason} — penalty ${outcome.penaltyWaived
          ? `WAIVED (${formatNaira(outcome.penalty.amountKobo)} — ${parsed.data.waiverReason})`
          : formatNaira(outcome.penaltyChargedKobo)} — ${outcome.releasedNights} night(s) released`,
        ipAddress: req.ip,
      });
      return outcome;
    });

    res.json({
      ...result,
      reservation: db.select().from(reservations).where(eq(reservations.id, req.params.id)).get(),
      folio: folioSummary(req.params.id),
    });
  } catch (err) {
    return respondToHandlerError(res, err);
  }
});

const noShowSchema = z.object({ note: z.string().max(500).optional() });

// POST /reservations/:id/no-show — the manual counterpart to the night
// audit's automatic pass, for when the desk knows before 3am.
router.post("/:id/no-show", requireAuth, requirePermission("reservations:checkinout"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const parsed = noShowSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const result = immediateTransaction(() => {
      const current = db.select().from(reservations).where(eq(reservations.id, req.params.id)).get();
      if (!current || current.branchId !== branchId) throw new HandlerError(404, "NOT_FOUND");
      if (current.status !== "confirmed" && current.status !== "pending") {
        throw new HandlerError(409, "INVALID_STATUS", { status: current.status });
      }

      const businessDate = currentBusinessDate(branchId);
      const already = db.select().from(noShowPostings).where(and(
        eq(noShowPostings.reservationId, current.id),
        eq(noShowPostings.businessDate, businessDate),
      )).get();
      if (already) throw new HandlerError(409, "ALREADY_RECORDED");

      db.update(reservations).set({ status: "no_show" }).where(eq(reservations.id, current.id)).run();

      // Same release the night audit does: a room nobody turned up for must
      // become sellable again immediately, in both inventories.
      releaseRoomNights(current.id);
      if (current.roomTypeId) {
        releaseInventory(current.roomTypeId, current.checkInDate, current.checkOutDate);
      }

      // B9 CLOSES THE LOOP. This used to record the no-show with a null
      // penalty and a note saying the amount "awaits the cancellation-policy
      // engine" -- honest at the time, but it meant the property absorbed
      // every no-show for free. The engine exists now, so the charge posts.
      const penalty = postNoShowPenalty(current.id, branchId, businessDate, req.auth!.userId);

      db.insert(noShowPostings).values({
        id: nanoid(), reservationId: current.id, businessDate,
        penaltyChargeId: penalty?.chargeId ?? null,
        postedAt: new Date(), postedBy: req.auth!.userId,
      }).run();

      logAudit({
        userId: req.auth!.userId, branchId, action: "reservation_no_show", module: "Reservations",
        recordId: current.id,
        details: `Marked no-show for ${formatBusinessDate(businessDate)}`
          + (parsed.data.note ? ` — ${parsed.data.note}` : "")
          + (penalty
            ? ` — penalty ${formatNaira(penalty.totalKobo)} (${penalty.basis})`
            : " — no penalty under this branch's policy"),
        ipAddress: req.ip,
      });
      return {
        reservation: db.select().from(reservations).where(eq(reservations.id, current.id)).get()!,
        penalty,
      };
    });

    res.json({
      ...result.reservation,
      penaltyPosted: result.penalty != null,
      penaltyKobo: result.penalty?.totalKobo ?? 0,
      penaltyBasis: result.penalty?.basis ?? "No penalty under this branch's cancellation policy.",
      folio: folioSummary(req.params.id),
    });
  } catch (err) {
    return respondToHandlerError(res, err);
  }
});

const walkInSchema = z.object({
  guest: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  roomId: z.string().min(1),
  checkOutDate: z.coerce.date(),
  rateKobo: z.number().int().positive().optional(),
  ratePlanId: z.string().optional(),
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  depositKobo: z.number().int().positive().optional(),
  depositMethod: z.enum(["cash", "card", "transfer"]).optional(),
  specialRequests: z.string().max(2000).optional(),
});

// POST /reservations/walk-in — guest + reservation + assignment + check-in +
// first night + deposit, ALL IN ONE TRANSACTION.
//
// Any failure leaves nothing: no orphan guest, no reservation without a room,
// no charge against a stay that does not exist. That is the whole point of
// the endpoint -- the same sequence done as five API calls from a browser
// fails halfway roughly as often as the network does, and the desk is then
// left cleaning up records by hand while a guest waits.
router.post("/walk-in", requireAuth, requirePermission("reservations:checkinout"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const parsed = walkInSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;

  if (d.depositKobo && !d.depositMethod) {
    return res.status(400).json({ error: "PAYMENT_METHOD_REQUIRED" });
  }

  try {
    const result = immediateTransaction(() => {
      const businessDate = currentBusinessDate(branchId);
      const checkInDate = businessDate;
      if (d.checkOutDate <= checkInDate) throw new HandlerError(400, "INVALID_DATE_RANGE");

      const room = db.select().from(rooms).where(eq(rooms.id, d.roomId)).get();
      if (!room || room.branchId !== branchId) throw new HandlerError(400, "ROOM_NOT_FOUND");
      if (room.status !== "available") throw new HandlerError(409, "ROOM_NOT_AVAILABLE", { roomStatus: room.status });
      if (room.housekeepingStatus !== "clean" && room.housekeepingStatus !== "inspected") {
        throw new HandlerError(409, "ROOM_NOT_CLEAN", { housekeepingStatus: room.housekeepingStatus });
      }

      const guestId = nanoid();
      db.insert(guests).values({
        id: guestId, branchId,
        firstName: d.guest.firstName, lastName: d.guest.lastName,
        email: d.guest.email, phone: d.guest.phone,
        vip: false, blacklisted: false, createdAt: new Date(),
      }).run();

      // Price from the rate card unless told otherwise, same rule as a
      // normal booking -- a walk-in is not an excuse to sell at any number.
      const plan = d.ratePlanId
        ? db.select().from(ratePlans).where(eq(ratePlans.id, d.ratePlanId)).get() ?? null
        : defaultRatePlan(branchId);
      let rateKobo = d.rateKobo ?? null;
      if (rateKobo == null) {
        if (!room.roomTypeId || !plan) throw new HandlerError(400, "RATE_REQUIRED");
        let total = 0;
        for (const night of nightsBetween(checkInDate, d.checkOutDate)) {
          const resolved = resolveRate(plan.id, room.roomTypeId, night);
          if (resolved.rateKobo == null) {
            throw new HandlerError(409, "NO_RATE_FOR_DATE", { stayDate: formatBusinessDate(night) });
          }
          if (resolved.stopSell) throw new HandlerError(409, "STOP_SELL", { stayDate: formatBusinessDate(night) });
          total += resolved.rateKobo;
        }
        rateKobo = Math.round(total / nightsBetween(checkInDate, d.checkOutDate).length);
      }

      const reservationId = nanoid();
      db.insert(reservations).values({
        id: reservationId, branchId, guestId,
        roomId: room.id, roomTypeId: room.roomTypeId, ratePlanId: plan?.id ?? null,
        checkInDate, checkOutDate: d.checkOutDate,
        status: "checked_in",
        rateKobo, adults: d.adults, children: d.children,
        specialRequests: d.specialRequests,
        createdBy: req.auth!.userId, createdAt: new Date(),
      }).run();

      claimRoomNights(branchId, room.id, reservationId, checkInDate, d.checkOutDate);
      let oversoldDates: string[] = [];
      if (room.roomTypeId) {
        oversoldDates = claimInventory(branchId, room.roomTypeId, checkInDate, d.checkOutDate).oversoldDates;
      }
      db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, room.id)).run();

      // The first night is posted immediately -- with tax, through the B6
      // engine like every other posting path. A walk-in who leaves before
      // the audit runs would otherwise owe nothing for the room.
      postRoomChargeForNight(reservationId, businessDate, req.auth!.userId);

      if (d.depositKobo) {
        db.insert(payments).values({
          id: nanoid(), reservationId, amountKobo: d.depositKobo,
          method: d.depositMethod!, receivedBy: req.auth!.userId,
          receivedAt: new Date(), businessDate,
        }).run();
      }

      logAudit({
        userId: req.auth!.userId, branchId, action: "walk_in_checked_in", module: "Reservations",
        recordId: reservationId,
        details: `${d.guest.firstName} ${d.guest.lastName} → Room ${room.number} at ${formatNaira(rateKobo)}/night`
          + (d.depositKobo ? `, deposit ${formatNaira(d.depositKobo)} ${d.depositMethod}` : ""),
        ipAddress: req.ip,
      });

      return {
        reservation: db.select().from(reservations).where(eq(reservations.id, reservationId)).get()!,
        room, oversoldDates,
      };
    });

    res.status(201).json({
      ...result.reservation,
      roomNumber: result.room.number,
      folio: folioSummary(result.reservation.id),
      ...(result.oversoldDates.length > 0
        ? { warning: "OVERSOLD", oversoldDates: result.oversoldDates } : {}),
    });
  } catch (err) {
    return respondToHandlerError(res, err, d.roomId);
  }
});

export default router;
