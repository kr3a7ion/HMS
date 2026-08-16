// Backend Blueprint B5 / invariant 9 — the business date.
//
// A hotel's trading day does not end at midnight. It ends when the night
// audit runs, typically around 03:00, after the late bar has closed and
// before the early breakfast shift. A drink sold at 01:30 belongs to the
// previous trading day, and putting it in "today" is how a day's revenue
// total stops being reproducible.
//
// So the business date is STORED per branch (branches.current_business_date)
// and only ever moves when the night audit rolls it. It is not derived from
// the clock -- deriving it would mean the day silently advances at midnight
// while the audit has not run, and the two would disagree.
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { branches } from "../db/schema.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the calendar date containing `at`. */
export function businessDateOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** ISO yyyy-mm-dd, the form used in API responses and log lines. */
export function formatBusinessDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The branch's current business date -- the one every financial row posted
 * right now must be stamped with.
 *
 * Falls back to today's calendar date only when the branch row is missing,
 * which in practice means a test fixture that never seeded one. A real
 * branch always has this column (migration 0005 backfills it NOT NULL).
 */
export function currentBusinessDate(branchId?: string): Date {
  if (branchId) {
    const branch = db.select({ d: branches.currentBusinessDate }).from(branches).where(eq(branches.id, branchId)).get();
    if (branch?.d) return businessDateOf(branch.d);
  }
  return businessDateOf(new Date());
}

/**
 * What the business date *should* be by the wall clock, given the branch's
 * roll hour. The night audit compares this against the stored value to work
 * out how many days it is behind -- if the server was off for three days,
 * three days need auditing, in order.
 *
 * Before the roll hour, the trading day is still yesterday's.
 */
export function expectedBusinessDate(rollHour: number, now: Date = new Date()): Date {
  const today = businessDateOf(now);
  return now.getUTCHours() < rollHour ? addDays(today, -1) : today;
}

/** Whole days from `from` to `to`. Negative if `to` precedes `from`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((businessDateOf(to).getTime() - businessDateOf(from).getTime()) / DAY_MS);
}
