// Backend Blueprint B3 / invariant 3 — transactions and race elimination.
//
// WHY `db` AND NOT `tx` INSIDE THE CALLBACK. Drizzle hands the callback a
// `tx` handle, and the instinct is to use it. Here that would be actively
// worse. better-sqlite3 runs on a single connection, and BEGIN/COMMIT are
// connection-scoped, so *every* statement issued through the shared `db`
// handle during the callback is already inside the transaction -- including
// the ones inside helpers this code does not own the call site of
// (`logAudit`, `folioSummary`, `issueCardCredential`, the lock queue...).
//
// Using `tx` at the top level while those helpers keep using `db` would not
// put them outside the transaction (same connection), but it would create
// two names for one thing and invite someone to "fix" the helpers by
// threading a handle through. Verified empirically before relying on it: a
// helper writing via `db` inside a failing `db.transaction()` is rolled
// back with everything else.
//
// The practical consequence is the good one: an audit-log row written by a
// handler that then fails does not survive as a record of something that
// never happened.
import { db } from "./client.js";

/**
 * Raised when a room is already committed for one of the requested nights.
 * Carries the conflicting dates so the caller can say *which* nights are
 * gone rather than a bare "unavailable".
 */
export class RoomUnavailableError extends Error {
  constructor(public readonly roomId: string, public readonly conflictingDates: string[]) {
    super(
      conflictingDates.length === 1
        ? `Room is already booked for ${conflictingDates[0]}`
        : `Room is already booked for ${conflictingDates.length} of the requested nights`,
    );
    this.name = "RoomUnavailableError";
  }
}

/** True if `err` is SQLite's unique-constraint failure. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof (err as { code?: string })?.code === "string"
    && (err as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

/** True if the unique violation came from the given table/columns. */
export function isUniqueViolationOn(err: unknown, fragment: string): boolean {
  return isUniqueViolation(err) && String((err as Error).message ?? "").includes(fragment);
}

/**
 * Runs `fn` atomically. Use for handlers that perform more than one write
 * but do not re-check a condition they then act on.
 */
// NOTE ON SHAPE. The blueprint writes this as `db.transaction(() => {...})()`
// -- that is better-sqlite3's raw API, where `.transaction()` returns a
// function you then call. Drizzle's wrapper runs the callback directly and
// returns its result, so there is no trailing `()`. Verified against the
// installed drizzle-orm before relying on it.
export function transaction<T>(fn: () => T): T {
  return db.transaction(() => fn()) as T;
}

/**
 * Runs `fn` atomically with `BEGIN IMMEDIATE`, taking the write lock up
 * front instead of on the first write.
 *
 * Use for every check-then-write pair. A deferred transaction starts in
 * read mode and only upgrades when it writes, which leaves a window where
 * two callers can both read "available" before either writes. IMMEDIATE
 * closes that window: the second caller blocks (or gets SQLITE_BUSY) at
 * BEGIN rather than proceeding on a stale read.
 *
 * The condition must still be re-verified *inside* the callback -- taking
 * the lock does not make a read from before the lock true.
 */
export function immediateTransaction<T>(fn: () => T): T {
  return db.transaction(() => fn(), { behavior: "immediate" }) as T;
}
