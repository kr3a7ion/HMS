// Backend Blueprint B3 — room-night inventory.
//
// One row per room per night, with UNIQUE (room_id, stay_date). That index
// is the only thing that actually prevents a double booking; every check in
// application code is a courtesy that produces a better error message
// slightly earlier.
//
// A stay from the 1st to the 3rd occupies the nights of the 1st and 2nd.
// The checkout date is not a night, which is what makes a same-day turnover
// (one guest out on the 3rd, another in on the 3rd) legal.
import { nanoid } from "nanoid";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { roomNightInventory } from "../db/schema.js";
import { RoomUnavailableError, isUniqueViolationOn } from "../db/tx.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the given date -- the canonical key for a stay night. */
function toNight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Every night occupied by a stay: check-in inclusive, check-out exclusive.
 * Returns [] for a zero- or negative-length stay, which the caller should
 * have rejected already.
 */
export function nightsBetween(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  for (let t = toNight(checkIn).getTime(); t < toNight(checkOut).getTime(); t += DAY_MS) {
    nights.push(new Date(t));
  }
  return nights;
}

/**
 * Claims every night of a stay for a room. MUST be called inside the same
 * transaction as the reservation insert -- otherwise the reservation and
 * its inventory can disagree, which is worse than having neither.
 *
 * Translates SQLite's unique violation into a typed RoomUnavailableError
 * naming the conflicting nights, so the caller can tell the guest which
 * dates are gone rather than just "no".
 */
export function claimRoomNights(
  branchId: string,
  roomId: string,
  reservationId: string,
  checkIn: Date,
  checkOut: Date,
): void {
  const nights = nightsBetween(checkIn, checkOut);
  const createdAt = new Date();
  for (const night of nights) {
    try {
      db.insert(roomNightInventory).values({
        id: nanoid(), branchId, roomId, stayDate: night, reservationId, createdAt,
      }).run();
    } catch (err) {
      if (isUniqueViolationOn(err, "room_night_inventory")) {
        // Report every conflicting night, not just the one that tripped
        // first -- a caller offering alternatives needs the whole picture.
        // Safe to read here: the transaction is about to roll back anyway.
        const conflicts = findConflictingNights(roomId, nights);
        throw new RoomUnavailableError(roomId, conflicts.map(d => d.toISOString().slice(0, 10)));
      }
      throw err;
    }
  }
}

/** Which of `nights` are already claimed for this room. */
export function findConflictingNights(roomId: string, nights: Date[]): Date[] {
  return findConflicts(roomId, nights).map(r => r.stayDate);
}

/**
 * Conflicting nights AND who holds them.
 *
 * The reservation id comes straight out of room_night_inventory, so the
 * caller can name the clashing booking without scanning the reservations
 * table -- which matters because B8's definition of done is that no code
 * path derives availability from such a scan. This table is authoritative
 * (its UNIQUE index is the actual guarantee), so the friendly error and the
 * constraint can no longer disagree about what is free.
 */
export function findConflicts(roomId: string, nights: Date[]): Array<{ stayDate: Date; reservationId: string }> {
  if (nights.length === 0) return [];
  return db.select({
    stayDate: roomNightInventory.stayDate,
    reservationId: roomNightInventory.reservationId,
  })
    .from(roomNightInventory)
    .where(and(eq(roomNightInventory.roomId, roomId), inArray(roomNightInventory.stayDate, nights)))
    .all();
}

/**
 * Releases every night held by a reservation. Called when a stay is
 * cancelled, marked no-show, or has its room changed -- the room must
 * become immediately rebookable, which it does not if the rows linger.
 */
export function releaseRoomNights(reservationId: string): number {
  const held = db.select({ id: roomNightInventory.id })
    .from(roomNightInventory)
    .where(eq(roomNightInventory.reservationId, reservationId))
    .all();
  if (held.length === 0) return 0;
  db.delete(roomNightInventory).where(eq(roomNightInventory.reservationId, reservationId)).run();
  return held.length;
}
