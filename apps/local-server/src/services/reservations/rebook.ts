// Backend Blueprint B10 — changing a reservation's dates, type or room.
//
// THE HIGHEST-RISK CODE IN THIS BATCH, and the reason it is one function
// rather than three handlers: a date change, a type change and a room move
// are the same operation underneath — give back what this stay holds, then
// take what it now needs — and every one of them touches TWO inventories:
//
//   * room_night_inventory  (B3) — per room per night, UNIQUE. The guarantee.
//   * inventory_calendar    (B8) — per type per night, a count. The answer.
//
// If those two come apart, the symptom is not an error. It is a room that
// looks free and is not, or one that looks sold and is empty, discovered by
// a guest standing at the desk. So both move together, inside the caller's
// IMMEDIATE transaction, and if the new dates cannot be taken the release is
// rolled back with everything else -- the stay keeps exactly what it had.
//
// RELEASE-THEN-CLAIM, not claim-then-release, and the order is load-bearing:
// extending a stay in the same room would otherwise conflict with itself,
// because the nights it already holds are the nights it is asking for.
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { reservations, rooms } from "../../db/schema.js";
import { claimRoomNights, releaseRoomNights } from "../roomInventory.js";
import { claimInventory, releaseInventory, nightsOf } from "../availability/inventory.js";
import { HandlerError } from "../../lib/handlerError.js";

type Reservation = typeof reservations.$inferSelect;

export interface RebookTarget {
  checkInDate?: Date;
  checkOutDate?: Date;
  roomTypeId?: string | null;
  roomId?: string | null;
}

export interface RebookResult {
  changed: boolean;
  oversoldDates: string[];
  previous: { checkInDate: Date; checkOutDate: Date; roomTypeId: string | null; roomId: string | null };
}

/** Statuses whose inventory is actually held. A cancelled stay holds none. */
const HOLDS_INVENTORY = new Set(["confirmed", "pending", "checked_in"]);

/**
 * Moves a reservation's inventory to a new shape and writes the reservation
 * row. Caller MUST already be inside immediateTransaction.
 *
 * Returns `changed: false` and touches nothing when the target is identical
 * to what the stay already holds -- a PATCH that resends the same dates is a
 * normal thing for a form to do, and re-claiming would be a needless risk.
 */
export function rebookReservation(
  reservation: Reservation,
  target: RebookTarget,
  extra: Partial<Reservation> = {},
): RebookResult {
  const previous = {
    checkInDate: reservation.checkInDate,
    checkOutDate: reservation.checkOutDate,
    roomTypeId: reservation.roomTypeId,
    roomId: reservation.roomId,
  };

  const checkInDate = target.checkInDate ?? reservation.checkInDate;
  const checkOutDate = target.checkOutDate ?? reservation.checkOutDate;
  const roomTypeId = target.roomTypeId !== undefined ? target.roomTypeId : reservation.roomTypeId;
  const roomId = target.roomId !== undefined ? target.roomId : reservation.roomId;

  if (checkOutDate <= checkInDate) throw new HandlerError(400, "INVALID_DATE_RANGE");
  if (nightsOf(checkInDate, checkOutDate).length === 0) throw new HandlerError(400, "INVALID_DATE_RANGE");

  const inventoryMoved =
    checkInDate.getTime() !== reservation.checkInDate.getTime()
    || checkOutDate.getTime() !== reservation.checkOutDate.getTime()
    || roomTypeId !== reservation.roomTypeId
    || roomId !== reservation.roomId;

  if (!inventoryMoved) {
    if (Object.keys(extra).length > 0) {
      db.update(reservations).set(extra).where(eq(reservations.id, reservation.id)).run();
    }
    return { changed: false, oversoldDates: [], previous };
  }

  const holds = HOLDS_INVENTORY.has(reservation.status);
  let oversoldDates: string[] = [];

  if (holds) {
    // ── Give back everything this stay currently holds ──────────────────
    releaseRoomNights(reservation.id);
    if (reservation.roomTypeId) {
      releaseInventory(reservation.roomTypeId, reservation.checkInDate, reservation.checkOutDate);
    }

    // ── Take the new shape ─────────────────────────────────────────────
    // Any failure here throws, the transaction rolls back, and the release
    // above is undone with it -- the stay is left exactly as it was.
    if (roomTypeId) {
      oversoldDates = claimInventory(reservation.branchId, roomTypeId, checkInDate, checkOutDate).oversoldDates;
    }
    if (roomId) {
      claimRoomNights(reservation.branchId, roomId, reservation.id, checkInDate, checkOutDate);
    }
  }

  db.update(reservations).set({
    checkInDate, checkOutDate, roomTypeId, roomId, ...extra,
  }).where(eq(reservations.id, reservation.id)).run();

  return { changed: true, oversoldDates, previous };
}

/**
 * Checks that a room is a legitimate home for this reservation.
 *
 * `allowTypeChange` is the explicit upgrade flag: putting a guest in a room
 * of a different type is a real and common thing to do, but it changes what
 * they are occupying and therefore what the property has left to sell, so it
 * must be deliberate rather than a side effect of picking the nearest free
 * room.
 */
export function validateRoomForReservation(
  branchId: string,
  roomId: string,
  reservation: Reservation,
  options: { allowTypeChange?: boolean; requireClean?: boolean } = {},
) {
  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get();
  if (!room || room.branchId !== branchId) throw new HandlerError(400, "ROOM_NOT_FOUND");

  if (room.status === "out_of_service" || room.status === "maintenance") {
    throw new HandlerError(409, "ROOM_OUT_OF_SERVICE", { roomStatus: room.status });
  }

  if (
    reservation.roomTypeId && room.roomTypeId
    && room.roomTypeId !== reservation.roomTypeId
    && !options.allowTypeChange
  ) {
    throw new HandlerError(409, "ROOM_TYPE_MISMATCH", {
      bookedRoomTypeId: reservation.roomTypeId,
      roomRoomTypeId: room.roomTypeId,
      message: "That room is a different type than the one booked. Pass allowTypeChange to upgrade or downgrade deliberately.",
    });
  }

  // Blueprint FD-01 step 3: a guest is not put into a room that has not been
  // cleaned. Only enforced at check-in -- assigning a room in advance to one
  // that is still dirty is normal, because housekeeping has all day.
  if (options.requireClean && room.housekeepingStatus !== "clean" && room.housekeepingStatus !== "inspected") {
    throw new HandlerError(409, "ROOM_NOT_CLEAN", { housekeepingStatus: room.housekeepingStatus });
  }

  return room;
}
