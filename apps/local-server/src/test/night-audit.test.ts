// Backend Blueprint B5 — business date and night audit.
//
// The headline is the 30-day reconciliation: a simulated month of arrivals,
// stayovers and departures where the sum of the frozen daily_revenue rows
// must equal the sum of the room charges in the ledger, with ADR and RevPAR
// matching hand-computed values. That is the test that would catch the
// whole batch being subtly wrong.
import { test, describe, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { nanoid } from "nanoid";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
// Midday, deliberately: `now` at midnight is BEFORE the 3am roll hour, so
// the trading day would still be the previous one and one fewer day would be
// due. That is correct behaviour (see the roll-hour test) but not what these
// fixtures mean by "it is now the 3rd".
const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

let orgId: string;
let branchId: string;
let userId: string;

// Each test gets a clean branch so business dates never collide.
beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const { organizations, branches, users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  orgId = nanoid();
  branchId = nanoid();
  userId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "NA Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "NA Branch", createdAt: new Date(),
    currentBusinessDate: utc("2026-04-01"), businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `na-${userId}@example.com`,
    passwordHash: await hashPassword("x"), role: "FIN",
    firstName: "Night", lastName: "Auditor", status: "active", createdAt: new Date(),
  }).run();
});

afterEach(async () => { /* rows are per-branch; nothing to tear down */ });

async function makeRoom() {
  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(rooms).values({ id, branchId, number: `N${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
  return id;
}

async function makeStay(roomId: string, checkIn: string, checkOut: string, rateKobo: number, status = "checked_in") {
  const { db } = await import("../db/client.js");
  const { guests, reservations } = await import("../db/schema.js");
  const guestId = nanoid();
  db.insert(guests).values({ id: guestId, branchId, firstName: "Stay", lastName: "Guest", vip: false, blacklisted: false, createdAt: utc(checkIn) }).run();
  const id = nanoid();
  db.insert(reservations).values({
    id, branchId, guestId, roomId, status,
    checkInDate: utc(checkIn), checkOutDate: utc(checkOut),
    rateKobo, createdBy: userId, createdAt: utc(checkIn),
  }).run();
  return id;
}

describe("business date", () => {
  test("only moves when the audit rolls it -- not with the wall clock", async () => {
    const { getBranch, runNightAudit } = await import("../services/nightAudit/index.js");
    const { formatBusinessDate } = await import("../lib/businessDate.js");

    assert.equal(formatBusinessDate(getBranch(branchId)!.currentBusinessDate), "2026-04-01");
    // Wall clock is far ahead, but nothing has rolled it.
    runNightAudit(branchId, { now: at("2026-04-03"), operatorUserId: userId });
    // Midday on the 3rd is past the roll hour, so the 3rd is itself due:
    // 04-01, 04-02 and 04-03 all close, leaving 04-04 open.
    assert.equal(formatBusinessDate(getBranch(branchId)!.currentBusinessDate), "2026-04-04");
  });

  test("before the roll hour, the trading day is still yesterday's", async () => {
    const { expectedBusinessDate, formatBusinessDate } = await import("../lib/businessDate.js");
    // 01:30 UTC with a 3am roll hour -> still the previous day.
    assert.equal(formatBusinessDate(expectedBusinessDate(3, new Date("2026-04-10T01:30:00Z"))), "2026-04-09");
    // 04:00 -> the new day has begun.
    assert.equal(formatBusinessDate(expectedBusinessDate(3, new Date("2026-04-10T04:00:00Z"))), "2026-04-10");
  });
});

describe("room charge posting", () => {
  test("posts one night per night, not the whole stay at once", async () => {
    const roomId = await makeRoom();
    const reservationId = await makeStay(roomId, "2026-04-01", "2026-04-04", 5_000_000);
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    runNightAudit(branchId, { now: at("2026-04-04"), operatorUserId: userId });

    const roomCharges = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all()
      .filter(c => c.category === "Room");
    // Nights of 04-01, 04-02, 04-03. Checkout day (04-04) is not a night.
    assert.equal(roomCharges.length, 3, "one charge per night occupied");
    const dates = roomCharges.map(c => c.businessDate.toISOString().slice(0, 10)).sort();
    assert.deepEqual(dates, ["2026-04-01", "2026-04-02", "2026-04-03"]);
    for (const c of roomCharges) assert.equal(c.amountKobo, 5_000_000);
  });

  test("running the audit twice for the same date posts no duplicate charges", async () => {
    const roomId = await makeRoom();
    const reservationId = await makeStay(roomId, "2026-04-01", "2026-04-05", 5_000_000);
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    runNightAudit(branchId, { now: at("2026-04-02"), operatorUserId: userId });
    const afterFirst = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all().length;

    // Wind the date back and re-run the same night.
    const { branches } = await import("../db/schema.js");
    db.update(branches).set({ currentBusinessDate: utc("2026-04-01") }).where(eq(branches.id, branchId)).run();
    runNightAudit(branchId, { now: at("2026-04-02"), operatorUserId: userId });

    const afterSecond = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all().length;
    assert.equal(afterSecond, afterFirst, "a repeated audit must not double-charge the guest");
  });

  test("server off for 3 days: the next run posts 3 nights, in order", async () => {
    const roomId = await makeRoom();
    const reservationId = await makeStay(roomId, "2026-04-01", "2026-04-10", 4_000_000);
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    // Nothing ran on the 1st, 2nd or 3rd; the audit finally runs on the 4th.
    const results = runNightAudit(branchId, { now: at("2026-04-04"), operatorUserId: userId });

    assert.equal(results.length, 4, "04-01 through 04-04 are all due");
    assert.deepEqual(results.map(r => r.businessDate), ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"]);
    assert.ok(results.every(r => r.status === "completed"));

    const nights = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all()
      .filter(c => c.category === "Room")
      .map(c => c.businessDate.toISOString().slice(0, 10)).sort();
    assert.deepEqual(nights, ["2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"]);
  });

  test("each date is its own transaction, so an earlier day survives a later failure", async () => {
    // Proven by the run records: after auditing three days, three separate
    // completed runs exist. A single batched transaction would leave one.
    const roomId = await makeRoom();
    await makeStay(roomId, "2026-04-01", "2026-04-10", 4_000_000);
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { nightAuditRuns } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    runNightAudit(branchId, { now: at("2026-04-03"), operatorUserId: userId });
    const runs = db.select().from(nightAuditRuns).where(eq(nightAuditRuns.branchId, branchId)).all();
    assert.equal(runs.length, 3, "one run row per business date, committed independently");
    assert.ok(runs.every(r => r.status === "completed"));
  });
});

describe("no-shows", () => {
  test("a confirmed arrival that never checked in is marked no_show and recorded", async () => {
    const roomId = await makeRoom();
    const reservationId = await makeStay(roomId, "2026-04-01", "2026-04-03", 5_000_000, "confirmed");
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { reservations, noShowPostings } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    runNightAudit(branchId, { now: at("2026-04-01"), operatorUserId: userId });

    const reservation = db.select().from(reservations).where(eq(reservations.id, reservationId)).get()!;
    assert.equal(reservation.status, "no_show");
    const posting = db.select().from(noShowPostings).where(eq(noShowPostings.reservationId, reservationId)).get();
    assert.ok(posting, "the no-show is recorded");
    assert.equal(posting!.penaltyChargeId, null, "penalty awaits the cancellation-policy engine (B9)");
  });
});

describe("daily_revenue", () => {
  test("is frozen and cannot be edited or deleted", async () => {
    const roomId = await makeRoom();
    await makeStay(roomId, "2026-04-01", "2026-04-03", 5_000_000);
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { dailyRevenue } = await import("../db/schema.js");
    const { eq, and } = await import("drizzle-orm");

    runNightAudit(branchId, { now: at("2026-04-01"), operatorUserId: userId });
    const row = db.select().from(dailyRevenue).where(and(
      eq(dailyRevenue.branchId, branchId), eq(dailyRevenue.businessDate, utc("2026-04-01")),
    )).get()!;

    assert.throws(
      () => db.update(dailyRevenue).set({ totalRevenueKobo: 1 }).where(eq(dailyRevenue.id, row.id)).run(),
      /frozen/,
    );
    assert.throws(
      () => db.delete(dailyRevenue).where(eq(dailyRevenue.id, row.id)).run(),
      /frozen/,
    );
  });

  test("ADR and RevPAR match hand-computed values", async () => {
    // 3 rooms; 2 sold at ₦50,000 and ₦30,000.
    const r1 = await makeRoom(); const r2 = await makeRoom(); await makeRoom();
    await makeStay(r1, "2026-04-01", "2026-04-02", 5_000_000);
    await makeStay(r2, "2026-04-01", "2026-04-02", 3_000_000);
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { dailyRevenue } = await import("../db/schema.js");
    const { eq, and } = await import("drizzle-orm");

    runNightAudit(branchId, { now: at("2026-04-01"), operatorUserId: userId });
    const day = db.select().from(dailyRevenue).where(and(
      eq(dailyRevenue.branchId, branchId), eq(dailyRevenue.businessDate, utc("2026-04-01")),
    )).get()!;

    assert.equal(day.roomsAvailable, 3);
    assert.equal(day.roomsOccupied, 2);
    assert.equal(day.roomRevenueKobo, 8_000_000, "₦50,000 + ₦30,000");
    // ADR = room revenue / rooms sold = 8,000,000 / 2
    assert.equal(day.adrKobo, 4_000_000);
    // RevPAR = room revenue / rooms available = 8,000,000 / 3
    assert.equal(day.revparKobo, Math.round(8_000_000 / 3));
    // Occupancy = 2/3 = 66.67% -> 6667 basis points
    assert.equal(day.occupancyBp, Math.round((2 / 3) * 10_000));
  });
});

describe("30-day reconciliation", () => {
  test("sum(daily_revenue.room_revenue) equals the sum of room charges in the ledger", async () => {
    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const { db } = await import("../db/client.js");
    const { dailyRevenue, folioCharges, reservations } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    // A month with arrivals, multi-night stayovers, departures and a
    // no-show, on 5 rooms -- overlapping enough that a per-night bug shows
    // up as a mismatch rather than cancelling out.
    const rooms: string[] = [];
    for (let i = 0; i < 5; i++) rooms.push(await makeRoom());

    const day = (n: number) => `2026-04-${String(n).padStart(2, "0")}`;
    const stays: Array<[number, string, string, number, string]> = [
      [0, day(1), day(6), 5_000_000, "checked_in"],
      [1, day(1), day(3), 3_500_000, "checked_in"],
      [2, day(2), day(9), 4_250_000, "checked_in"],
      [3, day(4), day(5), 6_000_000, "checked_in"],
      [0, day(7), day(12), 5_500_000, "checked_in"],
      [1, day(5), day(20), 3_000_000, "checked_in"],
      [4, day(3), day(4), 7_000_000, "confirmed"], // never arrives -> no-show
      [2, day(11), day(28), 4_000_000, "checked_in"],
      [3, day(15), day(19), 6_500_000, "checked_in"],
      [4, day(9), day(25), 2_750_000, "checked_in"],
    ];
    for (const [roomIdx, ci, co, rate, status] of stays) {
      await makeStay(rooms[roomIdx], ci, co, rate, status);
    }

    // Close all 30 days.
    const results = runNightAudit(branchId, { now: at("2026-04-30"), operatorUserId: userId });
    assert.equal(results.length, 30, "every day of the month is audited");
    assert.ok(results.every(r => r.status === "completed"), "no day may fail");

    const branchReservationIds = new Set(
      db.select({ id: reservations.id }).from(reservations).where(eq(reservations.branchId, branchId)).all().map(r => r.id),
    );
    const ledgerRoomRevenue = db.select().from(folioCharges).all()
      .filter(c => branchReservationIds.has(c.reservationId) && c.category === "Room")
      .reduce((sum, c) => sum + c.amountKobo, 0);

    const frozen = db.select().from(dailyRevenue).where(eq(dailyRevenue.branchId, branchId)).all()
      .filter(r => r.supersededByRunId == null);
    const frozenRoomRevenue = frozen.reduce((sum, r) => sum + r.roomRevenueKobo, 0);

    assert.ok(ledgerRoomRevenue > 0, "the month must actually have produced revenue");
    assert.equal(
      frozenRoomRevenue, ledgerRoomRevenue,
      "the frozen days must account for every kobo of room revenue in the ledger, exactly",
    );

    // And each frozen day ties to its own night's charges.
    for (const dayRow of frozen) {
      const nightCharges = db.select().from(folioCharges)
        .where(eq(folioCharges.businessDate, dayRow.businessDate)).all()
        .filter(c => branchReservationIds.has(c.reservationId) && c.category === "Room")
        .reduce((sum, c) => sum + c.amountKobo, 0);
      assert.equal(
        dayRow.roomRevenueKobo, nightCharges,
        `daily_revenue for ${dayRow.businessDate.toISOString().slice(0, 10)} must equal that night's room charges`,
      );
      // ADR is derivable from the same row, so it cannot drift from it.
      if (dayRow.roomsOccupied > 0) {
        assert.equal(dayRow.adrKobo, Math.round(dayRow.roomRevenueKobo / dayRow.roomsOccupied));
      }
    }
  }, 120_000);
});
