// Backend Blueprint B8 — availability from a counter, never from a scan.
//
// WHAT THIS REPLACES. Availability used to be answered by scanning
// reservations for overlapping date ranges. That answers "is THIS room
// free?" but not "how many Deluxe can I still sell on the 14th?", which is
// the question a booking engine actually asks -- and the scan gets slower
// every month the property operates.
//
// So there is a counter per (type, night), and booking increments it INSIDE
// the same transaction as the reservation insert. The two can therefore never
// disagree, which is what a nightly recount job would otherwise be papering
// over. The DoD for this batch is precisely that no code path derives
// availability by scanning reservations.
//
// NOTE ON THE TWO INVENTORY TABLES, because they look redundant and are not:
//   * room_night_inventory (B3) is per ROOM per night, UNIQUE, and is what
//     makes double-booking a specific room impossible.
//   * inventory_calendar (here) is per TYPE per night, a count, and is what
//     makes "how many left?" answerable without scanning.
// The first is a guarantee, the second is a question. Both are needed.
import { nanoid } from "nanoid";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { inventoryCalendar, roomTypes, rooms } from "../../db/schema.js";
import { HandlerError } from "../../lib/handlerError.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function midnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Nights occupied by a stay: arrival inclusive, departure exclusive. */
export function nightsOf(checkIn: Date, checkOut: Date): Date[] {
  const nights: Date[] = [];
  for (let t = midnight(checkIn).getTime(); t < midnight(checkOut).getTime(); t += DAY_MS) {
    nights.push(new Date(t));
  }
  return nights;
}

/**
 * Ensures a row exists for every (type, night) in the range.
 *
 * A missing row is NOT "sold out" and is not "unlimited" -- it is "we have
 * not built the calendar that far yet", and both other readings are wrong in
 * a way that either loses bookings or oversells. Creating on demand from the
 * live room count means a booking beyond the horizon still works.
 */
export function ensureInventoryRows(branchId: string, roomTypeId: string, nights: Date[]): void {
  if (nights.length === 0) return;
  const existing = new Set(
    db.select({ stayDate: inventoryCalendar.stayDate }).from(inventoryCalendar)
      .where(and(
        eq(inventoryCalendar.roomTypeId, roomTypeId),
        inArray(inventoryCalendar.stayDate, nights),
      )).all().map(r => r.stayDate.getTime()),
  );
  const missing = nights.filter(n => !existing.has(n.getTime()));
  if (missing.length === 0) return;

  const typeRooms = db.select().from(rooms).where(eq(rooms.roomTypeId, roomTypeId)).all();
  const total = typeRooms.length;
  const ooo = typeRooms.filter(r => r.status === "out_of_service" || r.status === "maintenance").length;

  for (const night of missing) {
    db.insert(inventoryCalendar).values({
      id: nanoid(), branchId, roomTypeId, stayDate: night,
      totalRooms: total, sold: 0, blocked: 0, outOfOrder: ooo, overbookingLimit: 0,
    }).run();
  }
}

export interface NightAvailability {
  stayDate: Date;
  totalRooms: number;
  sold: number;
  blocked: number;
  outOfOrder: number;
  overbookingLimit: number;
  /** total - sold - blocked - out_of_order. May be negative if oversold. */
  available: number;
  /** available + overbooking_limit: what may still actually be sold. */
  sellable: number;
}

function toAvailability(row: typeof inventoryCalendar.$inferSelect): NightAvailability {
  const available = row.totalRooms - row.sold - row.blocked - row.outOfOrder;
  return {
    stayDate: row.stayDate,
    totalRooms: row.totalRooms, sold: row.sold, blocked: row.blocked,
    outOfOrder: row.outOfOrder, overbookingLimit: row.overbookingLimit,
    available,
    sellable: available + row.overbookingLimit,
  };
}

/** Per-night availability for one type over a range. */
export function availabilityForType(
  branchId: string, roomTypeId: string, from: Date, to: Date,
): NightAvailability[] {
  const nights = nightsOf(from, to);
  if (nights.length === 0) return [];
  ensureInventoryRows(branchId, roomTypeId, nights);

  const rows = db.select().from(inventoryCalendar).where(and(
    eq(inventoryCalendar.roomTypeId, roomTypeId),
    gte(inventoryCalendar.stayDate, nights[0]),
    lte(inventoryCalendar.stayDate, nights[nights.length - 1]),
  )).all();

  const byDate = new Map(rows.map(r => [r.stayDate.getTime(), r]));
  return nights.map(n => {
    const row = byDate.get(n.getTime());
    return row ? toAvailability(row) : {
      stayDate: n, totalRooms: 0, sold: 0, blocked: 0, outOfOrder: 0,
      overbookingLimit: 0, available: 0, sellable: 0,
    };
  });
}

export function activeRoomTypes(branchId: string) {
  return db.select().from(roomTypes).where(and(
    eq(roomTypes.branchId, branchId),
    eq(roomTypes.isActive, true),
  )).all().sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

export class NoInventoryError extends Error {
  constructor(
    public readonly roomTypeId: string,
    public readonly soldOutDates: string[],
  ) {
    super(
      soldOutDates.length === 1
        ? `No rooms of this type are available for ${soldOutDates[0]}`
        : `No rooms of this type are available for ${soldOutDates.length} of the requested nights`,
    );
    this.name = "NoInventoryError";
  }
}

export interface ClaimResult {
  /** Nights sold beyond total_rooms, permitted by the overbooking limit. */
  oversoldDates: string[];
}

/**
 * Takes one room of `roomTypeId` for every night of the stay.
 *
 * MUST run inside the caller's IMMEDIATE transaction, alongside the
 * reservation insert. Increment-outside-the-transaction is how a counter and
 * its bookings drift apart.
 *
 * Selling past total_rooms is allowed ONLY up to overbooking_limit, and the
 * caller is told which nights went over rather than finding out at check-in.
 * Silent oversell is the failure mode this whole table exists to prevent.
 */
export function claimInventory(
  branchId: string, roomTypeId: string, checkIn: Date, checkOut: Date,
): ClaimResult {
  const nights = nightsOf(checkIn, checkOut);
  if (nights.length === 0) return { oversoldDates: [] };
  ensureInventoryRows(branchId, roomTypeId, nights);

  const rows = db.select().from(inventoryCalendar).where(and(
    eq(inventoryCalendar.roomTypeId, roomTypeId),
    inArray(inventoryCalendar.stayDate, nights),
  )).all();
  const byDate = new Map(rows.map(r => [r.stayDate.getTime(), r]));

  // Check EVERY night before writing any of them. A partial claim would
  // leave the guest holding three nights of a five-night stay.
  const soldOut: string[] = [];
  const oversold: string[] = [];
  for (const night of nights) {
    const row = byDate.get(night.getTime());
    if (!row) { soldOut.push(night.toISOString().slice(0, 10)); continue; }
    const a = toAvailability(row);
    if (a.sellable <= 0) soldOut.push(night.toISOString().slice(0, 10));
    else if (a.available <= 0) oversold.push(night.toISOString().slice(0, 10));
  }
  if (soldOut.length > 0) throw new NoInventoryError(roomTypeId, soldOut);

  for (const night of nights) {
    const row = byDate.get(night.getTime())!;
    db.update(inventoryCalendar).set({ sold: row.sold + 1 })
      .where(eq(inventoryCalendar.id, row.id)).run();
  }
  return { oversoldDates: oversold };
}

/**
 * Gives back the nights a stay held. Called on cancellation, no-show, and
 * any date or type change -- the rooms must become sellable again
 * immediately, which they do not if the counter is left high.
 *
 * Clamped at zero: a counter that has already been corrected elsewhere must
 * not be driven negative by a late release, because a negative `sold` reads
 * as extra availability that does not exist.
 */
export function releaseInventory(
  roomTypeId: string, checkIn: Date, checkOut: Date,
): void {
  const nights = nightsOf(checkIn, checkOut);
  if (nights.length === 0) return;
  const rows = db.select().from(inventoryCalendar).where(and(
    eq(inventoryCalendar.roomTypeId, roomTypeId),
    inArray(inventoryCalendar.stayDate, nights),
  )).all();
  for (const row of rows) {
    db.update(inventoryCalendar).set({ sold: Math.max(0, row.sold - 1) })
      .where(eq(inventoryCalendar.id, row.id)).run();
  }
}

/**
 * Extends the calendar horizon to `days` ahead, and refreshes total_rooms /
 * out_of_order on future rows from the live room list.
 *
 * Run nightly by the audit. Without it the horizon walks backwards one day
 * at a time until bookings start falling off the end of it.
 *
 * Only FUTURE rows are refreshed: a past night's total is a historical fact
 * (that is how many rooms the property had that night), and rewriting it
 * would change occupancy figures that have already been reported.
 */
export function extendHorizon(branchId: string, days = 400, now: Date = new Date()): number {
  const types = db.select().from(roomTypes).where(eq(roomTypes.branchId, branchId)).all();
  const today = midnight(now);
  let created = 0;

  for (const type of types) {
    const nights: Date[] = [];
    for (let i = 0; i < days; i++) nights.push(new Date(today.getTime() + i * DAY_MS));

    const before = db.select({ id: inventoryCalendar.id }).from(inventoryCalendar)
      .where(eq(inventoryCalendar.roomTypeId, type.id)).all().length;
    ensureInventoryRows(branchId, type.id, nights);
    const after = db.select({ id: inventoryCalendar.id }).from(inventoryCalendar)
      .where(eq(inventoryCalendar.roomTypeId, type.id)).all().length;
    created += after - before;

    const typeRooms = db.select().from(rooms).where(eq(rooms.roomTypeId, type.id)).all();
    const total = typeRooms.length;
    const ooo = typeRooms.filter(r => r.status === "out_of_service" || r.status === "maintenance").length;
    for (const row of db.select().from(inventoryCalendar).where(and(
      eq(inventoryCalendar.roomTypeId, type.id),
      gte(inventoryCalendar.stayDate, today),
    )).all()) {
      if (row.totalRooms !== total || row.outOfOrder !== ooo) {
        db.update(inventoryCalendar).set({ totalRooms: total, outOfOrder: ooo })
          .where(eq(inventoryCalendar.id, row.id)).run();
      }
    }
  }
  return created;
}

/** Resolves a room type by id, scoped to the branch. */
export function requireRoomType(branchId: string, roomTypeId: string) {
  const type = db.select().from(roomTypes).where(eq(roomTypes.id, roomTypeId)).get();
  if (!type || type.branchId !== branchId) throw new HandlerError(400, "ROOM_TYPE_NOT_FOUND");
  return type;
}
