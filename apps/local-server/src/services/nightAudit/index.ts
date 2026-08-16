// Backend Blueprint B5 — the night audit.
//
// Closes one trading day: posts that night's room charges, resolves
// no-shows, freezes the day's revenue, and rolls the business date forward.
//
// TWO PROPERTIES MATTER MORE THAN ANYTHING ELSE HERE:
//
//   1. IDEMPOTENT. Every step records its own completion in steps_json, and
//      every write is keyed so a repeat is a no-op. A night audit that
//      double-posts when someone clicks twice is worse than one that does
//      not run.
//
//   2. ONE TRANSACTION PER DATE, never one across several. If the server was
//      off for three days, three days are audited in sequence and each
//      commits on its own. Batching them means a failure on day three
//      silently discards days one and two, and the operator has no way to
//      tell how far it got.
import { nanoid } from "nanoid";
import { and, eq, gte, lt, lte, ne } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  branches, reservations, rooms, folioCharges, payments,
  nightAuditRuns, dailyRevenue, noShowPostings,
} from "../../db/schema.js";
import { immediateTransaction } from "../../db/tx.js";
import { addKobo, formatNaira, mulRate } from "../../lib/money.js";
import { addDays, businessDateOf, daysBetween, expectedBusinessDate, formatBusinessDate } from "../../lib/businessDate.js";
import { logger } from "../../lib/logger.js";
import { logAudit } from "../audit.js";
import { postRoomChargeForNight, ROOM_CHARGE_CATEGORY } from "./roomCharges.js";
import { postNoShowPenalty } from "../cancellation/index.js";
import { releaseRoomNights } from "../roomInventory.js";
import { extendHorizon, releaseInventory } from "../availability/inventory.js";
import { runPreflight, type PreflightResult } from "./preflight.js";

export type StepStatus = "completed" | "skipped" | "failed" | "not_applicable";

export interface StepRecord {
  name: string;
  status: StepStatus;
  count?: number;
  detail?: string;
  error?: string;
}

export interface AuditRunResult {
  runId: string;
  businessDate: string;
  status: "completed" | "failed";
  steps: StepRecord[];
  totals: DailyTotals | null;
  error?: string;
}

export interface DailyTotals {
  roomsOccupied: number;
  roomsAvailable: number;
  roomsOoo: number;
  roomRevenueKobo: number;
  fnbRevenueKobo: number;
  otherRevenueKobo: number;
  totalRevenueKobo: number;
  taxCollectedKobo: number;
  adrKobo: number;
  revparKobo: number;
  occupancyBp: number;
  arrivals: number;
  departures: number;
  noShows: number;
  walkIns: number;
  discountsKobo: number;
  compsKobo: number;
}

/** F&B categories, for splitting revenue in the frozen day. */
const FNB_CATEGORIES = new Set(["Restaurant", "Bar", "Minibar", "Room Service"]);

export function getBranch(branchId: string) {
  return db.select().from(branches).where(eq(branches.id, branchId)).get() ?? null;
}

/**
 * How many trading days this branch is behind. 0 means the current business
 * date is still open and nothing is due.
 */
export function pendingNightCount(branchId: string, now: Date = new Date()): number {
  const branch = getBranch(branchId);
  if (!branch) return 0;
  const expected = expectedBusinessDate(branch.businessDateRollHour, now);
  return Math.max(0, daysBetween(branch.currentBusinessDate, expected));
}

function completedSteps(runId: string): Set<string> {
  const run = db.select().from(nightAuditRuns).where(eq(nightAuditRuns.id, runId)).get();
  if (!run) return new Set();
  const steps = JSON.parse(run.stepsJson) as StepRecord[];
  return new Set(steps.filter(s => s.status === "completed" || s.status === "not_applicable").map(s => s.name));
}

/**
 * Finds an unfinished run for this branch and date so a re-run resumes
 * rather than starting over. A `failed` run is resumable; a `completed` one
 * is not (that date is closed).
 */
function findResumableRun(branchId: string, businessDate: Date) {
  return db.select().from(nightAuditRuns).where(and(
    eq(nightAuditRuns.branchId, branchId),
    eq(nightAuditRuns.businessDate, businessDate),
    ne(nightAuditRuns.status, "completed"),
  )).get() ?? null;
}

function recordStep(runId: string, steps: StepRecord[], step: StepRecord) {
  const idx = steps.findIndex(s => s.name === step.name);
  if (idx >= 0) steps[idx] = step; else steps.push(step);
  db.update(nightAuditRuns).set({ stepsJson: JSON.stringify(steps) }).where(eq(nightAuditRuns.id, runId)).run();
}

/**
 * Audits a single business date. Caller supplies the date; this does NOT
 * decide which dates are due (see runNightAudit).
 */
function auditOneDate(
  branchId: string,
  businessDate: Date,
  operatorUserId: string | null,
  ipAddress?: string,
): AuditRunResult {
  const existing = findResumableRun(branchId, businessDate);
  const runId = existing?.id ?? nanoid();
  const steps: StepRecord[] = existing ? JSON.parse(existing.stepsJson) : [];
  const alreadyDone = existing ? completedSteps(existing.id) : new Set<string>();

  if (!existing) {
    db.insert(nightAuditRuns).values({
      id: runId, branchId, businessDate, status: "running",
      startedAt: new Date(), operatorUserId, stepsJson: "[]", exceptionsJson: "[]",
    }).run();
  } else {
    db.update(nightAuditRuns).set({ status: "running", error: null }).where(eq(nightAuditRuns.id, runId)).run();
  }

  try {
    return immediateTransaction(() => {
      // ── Step 1: preflight ──────────────────────────────────────────────
      const preflight = runPreflight(branchId, businessDate);
      db.update(nightAuditRuns)
        .set({ exceptionsJson: JSON.stringify(preflight.exceptions) })
        .where(eq(nightAuditRuns.id, runId)).run();
      recordStep(runId, steps, {
        name: "preflight", status: "completed",
        count: preflight.exceptions.length,
        detail: `${preflight.blocking.length} blocking, ${preflight.warnings.length} warning`,
      });

      // ── Step 2: post room charges ──────────────────────────────────────
      if (!alreadyDone.has("post_room_charges")) {
        const inHouse = db.select().from(reservations).where(and(
          eq(reservations.branchId, branchId),
          eq(reservations.status, "checked_in"),
        )).all().filter(r =>
          // Only bill a night the guest is actually occupying: arrival on or
          // before this date, departure strictly after it (checkout day is
          // not a night).
          businessDateOf(r.checkInDate) <= businessDate && businessDateOf(r.checkOutDate) > businessDate,
        );
        let posted = 0;
        for (const reservation of inHouse) {
          if (postRoomChargeForNight(reservation.id, businessDate, operatorUserId)) posted += 1;
        }
        recordStep(runId, steps, { name: "post_room_charges", status: "completed", count: posted });
      }

      // ── Step 3: process no-shows ───────────────────────────────────────
      if (!alreadyDone.has("process_no_shows")) {
        const due = db.select().from(reservations).where(and(
          eq(reservations.branchId, branchId),
          eq(reservations.status, "confirmed"),
          lte(reservations.checkInDate, addDays(businessDate, 1)),
        )).all().filter(r => businessDateOf(r.checkInDate) <= businessDate);

        let marked = 0;
        let penaltyTotalKobo = 0;
        for (const reservation of due) {
          const already = db.select().from(noShowPostings).where(and(
            eq(noShowPostings.reservationId, reservation.id),
            eq(noShowPostings.businessDate, businessDate),
          )).get();
          if (already) continue;

          db.update(reservations).set({ status: "no_show" }).where(eq(reservations.id, reservation.id)).run();

          // A REAL BUG, found while wiring B8's counter. Marking the status
          // was all this did: the guest's room stayed claimed in
          // room_night_inventory for the entire original date range, so a
          // room nobody turned up for could not be resold for the rest of
          // what would have been their stay. Both inventories are released
          // now -- the per-room claim and the per-type count.
          releaseRoomNights(reservation.id);
          if (reservation.roomTypeId) {
            releaseInventory(reservation.roomTypeId, reservation.checkInDate, reservation.checkOutDate);
          }
          // B9 CLOSES THE LOOP. This used to record `penaltyChargeId: null`
          // with a note that the amount awaited the cancellation-policy
          // engine -- honest at the time, but it meant a property running
          // this software absorbed every no-show for free. The engine exists
          // now, so the charge posts. It is idempotent on (reservation,
          // business date, category), so a re-run still cannot double-charge.
          const penalty = postNoShowPenalty(reservation.id, branchId, businessDate, operatorUserId);
          if (penalty) penaltyTotalKobo += penalty.totalKobo;

          db.insert(noShowPostings).values({
            id: nanoid(), reservationId: reservation.id, businessDate,
            penaltyChargeId: penalty?.chargeId ?? null,
            postedAt: new Date(), postedBy: operatorUserId,
          }).run();
          marked += 1;
        }
        recordStep(runId, steps, {
          name: "process_no_shows", status: "completed", count: marked,
          detail: marked === 0
            ? "no no-shows"
            : `${marked} marked, ${formatNaira(penaltyTotalKobo)} in penalties posted`,
        });
      }

      // ── Step 4: close the POS day ──────────────────────────────────────
      // pos_shifts is B15. Recorded as not_applicable rather than silently
      // omitted, so the run's step list stays an honest account of what a
      // full audit does and which parts this build actually performs.
      if (!alreadyDone.has("close_pos_day")) {
        recordStep(runId, steps, {
          name: "close_pos_day", status: "not_applicable",
          detail: "cash-drawer shifts arrive in B15",
        });
      }

      // ── Step 4b: extend the inventory horizon (B8) ─────────────────────
      // Without this the calendar's far edge walks backwards one day at a
      // time until bookings start falling off the end of it. Also refreshes
      // total_rooms / out_of_order on FUTURE nights from the live room list,
      // so a room taken out of service stops being sellable tomorrow rather
      // than whenever someone remembers to edit the calendar.
      if (!alreadyDone.has("extend_inventory_horizon")) {
        const created = extendHorizon(branchId, 400, addDays(businessDate, 1));
        recordStep(runId, steps, {
          name: "extend_inventory_horizon", status: "completed", count: created,
          detail: created > 0 ? `${created} night(s) added` : "horizon already complete",
        });
      }

      // ── Step 5: freeze daily_revenue ───────────────────────────────────
      const totals = computeDailyTotals(branchId, businessDate);
      const frozen = db.select().from(dailyRevenue).where(and(
        eq(dailyRevenue.branchId, branchId),
        eq(dailyRevenue.businessDate, businessDate),
      )).all().filter(r => r.supersededByRunId == null);

      if (frozen.length === 0) {
        db.insert(dailyRevenue).values({
          id: nanoid(), branchId, businessDate, ...totals,
          createdAt: new Date(), nightAuditRunId: runId,
        }).run();
        recordStep(runId, steps, { name: "freeze_daily_revenue", status: "completed" });
      } else {
        // Already frozen and not superseded -- this is a re-run of a date
        // that closed. Not an error: the whole point of idempotency is that
        // repeating the run changes nothing.
        recordStep(runId, steps, {
          name: "freeze_daily_revenue", status: "skipped",
          detail: "already frozen for this business date",
        });
      }

      // ── Step 6: roll the business date ─────────────────────────────────
      const branch = getBranch(branchId)!;
      if (businessDateOf(branch.currentBusinessDate).getTime() === businessDate.getTime()) {
        db.update(branches).set({
          currentBusinessDate: addDays(businessDate, 1),
          lastAuditRunId: runId,
        }).where(eq(branches.id, branchId)).run();
        recordStep(runId, steps, {
          name: "roll_business_date", status: "completed",
          detail: `${formatBusinessDate(businessDate)} -> ${formatBusinessDate(addDays(businessDate, 1))}`,
        });
      } else {
        recordStep(runId, steps, { name: "roll_business_date", status: "skipped", detail: "already rolled" });
      }

      db.update(nightAuditRuns).set({
        status: "completed", completedAt: new Date(), totalsJson: JSON.stringify(totals),
      }).where(eq(nightAuditRuns.id, runId)).run();

      logAudit({
        userId: operatorUserId, branchId, action: "night_audit_completed", module: "Finance",
        recordId: runId, details: `Business date ${formatBusinessDate(businessDate)} closed`, ipAddress,
      });

      return {
        runId, businessDate: formatBusinessDate(businessDate),
        status: "completed" as const, steps, totals,
      };
    });
  } catch (err) {
    // The transaction rolled back, so nothing this run did survives -- but
    // the run row itself was written before it opened, which is deliberate:
    // a failed audit must leave a record that it was attempted and why it
    // stopped, or the next operator has no idea anything went wrong.
    const message = err instanceof Error ? err.message : String(err);
    db.update(nightAuditRuns).set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(nightAuditRuns.id, runId)).run();
    logger.error({ err, runId, branchId, businessDate: formatBusinessDate(businessDate) }, "[night-audit] Run failed");
    return {
      runId, businessDate: formatBusinessDate(businessDate),
      status: "failed" as const, steps, totals: null, error: message,
    };
  }
}

/**
 * Runs the audit for every date that is due, oldest first.
 *
 * Each date gets its own transaction (see the header). If day two of three
 * fails, day one stays committed and the result reports exactly how far it
 * got -- rather than an all-or-nothing that loses work already done.
 */
export function runNightAudit(
  branchId: string,
  options: { operatorUserId?: string | null; ipAddress?: string; now?: Date; maxDates?: number } = {},
): AuditRunResult[] {
  const branch = getBranch(branchId);
  if (!branch) return [];

  const now = options.now ?? new Date();
  const expected = expectedBusinessDate(branch.businessDateRollHour, now);
  const results: AuditRunResult[] = [];
  const limit = options.maxDates ?? 400;

  let current = businessDateOf(branch.currentBusinessDate);
  while (current <= expected && results.length < limit) {
    const result = auditOneDate(branchId, current, options.operatorUserId ?? null, options.ipAddress);
    results.push(result);
    if (result.status === "failed") break; // stop at the first failure; the rest stay due
    const refreshed = getBranch(branchId)!;
    const next = businessDateOf(refreshed.currentBusinessDate);
    if (next.getTime() <= current.getTime()) break; // date did not advance; avoid spinning
    current = next;
  }
  return results;
}

/**
 * Computes a day's frozen totals from the ledger.
 *
 * Reads folio_charges/payments by business_date, so reversals (B4) net out
 * naturally -- a charge voided on the same day reduces that day's revenue,
 * which is the correct accounting treatment.
 */
export function computeDailyTotals(branchId: string, businessDate: Date): DailyTotals {
  const branchReservationIds = new Set(
    db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id),
  );

  const allCharges = db.select().from(folioCharges)
    .where(eq(folioCharges.businessDate, businessDate)).all()
    .filter(c => branchReservationIds.has(c.reservationId));

  // B6: revenue is NET of tax. Tax collected is money held on behalf of FIRS
  // and the state, not takings -- counting it as revenue would overstate the
  // day by 7.5% and make every ADR and RevPAR figure wrong.
  //
  // A service charge IS revenue: it is the property's own commercial charge,
  // remitted to nobody, so it stays in its category's bucket.
  const charges = allCharges.filter(c => c.chargeKind !== "tax");
  const taxCollectedKobo = addKobo(
    ...allCharges.filter(c => c.chargeKind === "tax").map(c => c.amountKobo),
  );

  const roomRevenueKobo = addKobo(...charges.filter(c => c.category === ROOM_CHARGE_CATEGORY).map(c => c.amountKobo));
  const fnbRevenueKobo = addKobo(...charges.filter(c => FNB_CATEGORIES.has(c.category)).map(c => c.amountKobo));
  const otherRevenueKobo = addKobo(
    ...charges.filter(c => c.category !== ROOM_CHARGE_CATEGORY && !FNB_CATEGORIES.has(c.category)).map(c => c.amountKobo),
  );
  const totalRevenueKobo = addKobo(roomRevenueKobo, fnbRevenueKobo, otherRevenueKobo);

  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, branchId)).all();
  const roomsOoo = branchRooms.filter(r => r.status === "out_of_service" || r.status === "maintenance").length;
  const roomsAvailable = branchRooms.length - roomsOoo;

  // Occupancy for THIS night: stays that had arrived and not yet departed.
  const allReservations = db.select().from(reservations).where(eq(reservations.branchId, branchId)).all();
  const occupying = allReservations.filter(r =>
    r.roomId != null
    && r.status !== "cancelled" && r.status !== "no_show"
    && businessDateOf(r.checkInDate) <= businessDate
    && businessDateOf(r.checkOutDate) > businessDate,
  );
  const roomsOccupied = occupying.length;

  const arrivals = allReservations.filter(r =>
    businessDateOf(r.checkInDate).getTime() === businessDate.getTime()
    && r.status !== "cancelled" && r.status !== "no_show").length;
  const departures = allReservations.filter(r =>
    businessDateOf(r.checkOutDate).getTime() === businessDate.getTime()
    && r.status !== "cancelled" && r.status !== "no_show").length;
  const noShows = db.select().from(noShowPostings).where(eq(noShowPostings.businessDate, businessDate)).all()
    .filter(n => branchReservationIds.has(n.reservationId)).length;

  // A walk-in is an arrival booked the same day it arrived.
  const walkIns = allReservations.filter(r =>
    businessDateOf(r.checkInDate).getTime() === businessDate.getTime()
    && businessDateOf(r.createdAt).getTime() === businessDate.getTime()).length;

  // ADR = room revenue / rooms sold. RevPAR = room revenue / rooms
  // available. Integer division keeps both in whole kobo.
  const adrKobo = roomsOccupied > 0 ? Math.round(roomRevenueKobo / roomsOccupied) : 0;
  const revparKobo = roomsAvailable > 0 ? Math.round(roomRevenueKobo / roomsAvailable) : 0;
  const occupancyBp = roomsAvailable > 0 ? Math.round((roomsOccupied / roomsAvailable) * 10_000) : 0;

  // Discounts and comps need their own charge kinds, which arrive with the
  // rate-plan work in B8 (a discount is a rate-plan concept, not a tax one).
  // Reported as 0 rather than guessed.
  return {
    roomsOccupied, roomsAvailable, roomsOoo,
    roomRevenueKobo, fnbRevenueKobo, otherRevenueKobo, totalRevenueKobo, taxCollectedKobo,
    adrKobo, revparKobo, occupancyBp,
    arrivals, departures, noShows, walkIns,
    discountsKobo: 0, compsKobo: 0,
  };
}

export { runPreflight, type PreflightResult };
