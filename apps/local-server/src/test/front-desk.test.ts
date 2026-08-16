// Backend Blueprint B10 — reservation lifecycle endpoints.
//
// Every mutating endpoint here moves TWO inventories: room_night_inventory
// (per room per night, UNIQUE — the guarantee) and inventory_calendar (per
// type per night, a count — the answer). If those come apart the symptom is
// not an error, it is a room that looks free and is not, discovered by a
// guest standing at the desk. So most of these tests are about what is left
// behind when something fails, not about the happy path.
import { test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import { nanoid } from "nanoid";
import os from "node:os";
import path from "node:path";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let server: http.Server;
let baseUrl: string;
let orgId: string;
let branchId: string;
let userId: string;
let typeId: string;
let altTypeId: string;
let planId: string;

// Assigned in beforeAll: drizzle can only be imported after NEXURA_DB_PATH
// is set, so a top-level import would bind the real dev database.
let eq_: typeof import("drizzle-orm")["eq"];

beforeAll(async () => {
  ({ eq: eq_ } = await import("drizzle-orm"));
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("Failed to bind test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});

beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const { organizations, branches, users, roomTypes, ratePlans, rateCalendar } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  orgId = nanoid(); branchId = nanoid(); userId = nanoid();
  typeId = nanoid(); altTypeId = nanoid(); planId = nanoid();

  db.insert(organizations).values({ id: orgId, name: "LC Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "LC Branch", createdAt: new Date(),
    currentBusinessDate: utc("2026-07-01"), businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `lc-${userId}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("x"), role: "FD",
    firstName: "Front", lastName: "Desk", status: "active", createdAt: new Date(),
  }).run();

  for (const [id, code, name, rate] of [
    [typeId, "DLX", "Deluxe", 5_000_000],
    [altTypeId, "STD", "Standard", 3_000_000],
  ] as const) {
    db.insert(roomTypes).values({
      id, branchId, code, name, maxOccupancy: 2, amenitiesJson: "[]",
      baseRateKobo: rate, displayOrder: 0, isActive: true, createdAt: new Date(),
    }).run();
  }
  db.insert(ratePlans).values({
    id: planId, branchId, code: "BAR", name: "Best Available Rate",
    planType: "base", includesBreakfast: false, isRefundable: true,
    effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
  }).run();

  const DAY = 86_400_000;
  for (const [id, rate] of [[typeId, 5_000_000], [altTypeId, 3_000_000]] as const) {
    for (let t = utc("2026-07-01").getTime(); t <= utc("2026-07-31").getTime(); t += DAY) {
      db.insert(rateCalendar).values({
        id: nanoid(), branchId, ratePlanId: planId, roomTypeId: id,
        stayDate: new Date(t), rateKobo: rate, updatedAt: new Date(),
      }).run();
    }
  }
});

async function makeRoom(roomTypeId = typeId, overrides: object = {}) {
  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(rooms).values({
    id, branchId, number: `R${Math.floor(Math.random() * 1_000_000)}`,
    type: roomTypeId === typeId ? "Deluxe" : "Standard",
    roomTypeId, status: "available", housekeepingStatus: "clean", ...overrides,
  }).run();
  return db.select().from(rooms).where(eq_(rooms.id, id)).get()!;
}

async function login(role = "FD") {
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `lc-http-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email, role,
    passwordHash: await hashPassword("correct-password"),
    firstName: "L", lastName: "C", status: "active", createdAt: new Date(),
  }).run();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function book(cookie: string, checkIn: string, checkOut: string, body: object = {}) {
  const res = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      newGuest: { firstName: "Life", lastName: "Cycle" },
      roomTypeId: typeId,
      checkInDate: `${checkIn}T00:00:00.000Z`,
      checkOutDate: `${checkOut}T00:00:00.000Z`,
      ...body,
    }),
  });
  return res;
}

async function availability(cookie: string, from: string, to: string, wantTypeId = typeId) {
  const res = await fetch(`${baseUrl}/availability?from=${from}&to=${to}`, { headers: { Cookie: cookie } });
  const body = await res.json() as any;
  const type = body.types.find((t: any) => t.roomTypeId === wantTypeId);
  return Object.fromEntries((type?.nights ?? []).map((n: any) => [n.stayDate, n.available]));
}

describe("extend", () => {
  test("when the next night is unavailable the extension is refused and NOTHING changes", async () => {
    await makeRoom();
    const cookie = await login("FD");

    const stay = await (await book(cookie, "2026-07-01", "2026-07-03")).json() as any;
    // The only room is taken on the 3rd by someone else.
    const blocker = await (await book(cookie, "2026-07-03", "2026-07-04")).json() as any;
    assert.ok(blocker.id);

    const before = await availability(cookie, "2026-07-01", "2026-07-05");

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/extend`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ checkOutDate: "2026-07-04T00:00:00.000Z" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "NO_INVENTORY");

    // THE POINT OF THE TEST. rebookReservation releases the whole stay and
    // re-claims it, so a failed re-claim must roll the release back too --
    // otherwise the guest silently loses the nights they already had.
    const after = await availability(cookie, "2026-07-01", "2026-07-05");
    assert.deepEqual(after, before, "availability is exactly as it was");

    const reread = await (await fetch(`${baseUrl}/reservations/${stay.id}`, { headers: { Cookie: cookie } })).json() as any;
    assert.equal(reread.checkOutDate, stay.checkOutDate, "the stay still departs when it did");
  });

  test("a successful extension takes the extra nights and leaves the audit to bill them", async () => {
    await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03")).json() as any;

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/extend`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ checkOutDate: "2026-07-05T00:00:00.000Z" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.addedNights, 2);

    const avail = await availability(cookie, "2026-07-01", "2026-07-06");
    assert.equal(avail["2026-07-03"], 0, "the new nights are taken");
    assert.equal(avail["2026-07-04"], 0);
    assert.equal(avail["2026-07-05"], 1, "the new checkout day is not a night");

    // Not billed here: the night audit posts one night per night against the
    // reservation's rate (B5), so charging them now would double-bill.
    const { folioSummary } = await import("../services/folio.js");
    assert.equal(folioSummary(stay.id).totalChargesKobo, 0);
  });

  test("shortening a stay is not an extension", async () => {
    await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-05")).json() as any;
    const res = await fetch(`${baseUrl}/reservations/${stay.id}/extend`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ checkOutDate: "2026-07-03T00:00:00.000Z" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "NOT_AN_EXTENSION");
  });
});

describe("PATCH — the highest-risk handler", () => {
  test("a date change frees the old nights and takes the new ones atomically", async () => {
    // Booked into a SPECIFIC room, so both inventories are in play: the
    // per-type count and the per-room night claims. A type-only booking
    // holds no room-nights, and the second half of this test is about them.
    const room = await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03", { roomId: room.id })).json() as any;

    let avail = await availability(cookie, "2026-07-01", "2026-07-08");
    assert.equal(avail["2026-07-01"], 0);
    assert.equal(avail["2026-07-05"], 1);

    const res = await fetch(`${baseUrl}/reservations/${stay.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        checkInDate: "2026-07-05T00:00:00.000Z",
        checkOutDate: "2026-07-07T00:00:00.000Z",
      }),
    });
    assert.equal(res.status, 200);

    avail = await availability(cookie, "2026-07-01", "2026-07-08");
    assert.equal(avail["2026-07-01"], 1, "the old nights came back");
    assert.equal(avail["2026-07-02"], 1);
    assert.equal(avail["2026-07-05"], 0, "the new ones were taken");
    assert.equal(avail["2026-07-06"], 0);

    // room_night_inventory moved with it -- the two must never disagree.
    const { db } = await import("../db/client.js");
    const { roomNightInventory } = await import("../db/schema.js");
    const held = db.select().from(roomNightInventory)
      .where(eq_(roomNightInventory.reservationId, stay.id)).all()
      .map(r => r.stayDate.toISOString().slice(0, 10)).sort();
    assert.deepEqual(held, ["2026-07-05", "2026-07-06"]);
  });

  test("a date change into an occupied range changes nothing at all", async () => {
    await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03")).json() as any;
    await book(cookie, "2026-07-10", "2026-07-12");

    const before = await availability(cookie, "2026-07-01", "2026-07-13");

    const res = await fetch(`${baseUrl}/reservations/${stay.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        checkInDate: "2026-07-10T00:00:00.000Z",
        checkOutDate: "2026-07-12T00:00:00.000Z",
      }),
    });
    assert.equal(res.status, 409);

    assert.deepEqual(
      await availability(cookie, "2026-07-01", "2026-07-13"), before,
      "the failed move left the original nights held",
    );
  });

  test("changing the type moves the count between types and re-prices", async () => {
    await makeRoom(typeId);
    await makeRoom(altTypeId);
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03")).json() as any;
    assert.equal(stay.rateKobo, 5_000_000, "Deluxe");

    const res = await fetch(`${baseUrl}/reservations/${stay.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomTypeId: altTypeId }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.roomTypeId, altTypeId);
    assert.equal(body.rateKobo, 3_000_000, "re-priced from the rate card for the new type");

    assert.equal((await availability(cookie, "2026-07-01", "2026-07-03", typeId))["2026-07-01"], 1);
    assert.equal((await availability(cookie, "2026-07-01", "2026-07-03", altTypeId))["2026-07-01"], 0);
  });

  test("an explicitly supplied rate is never overwritten by re-pricing", async () => {
    await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03", { rateKobo: 2_500_000 })).json() as any;

    const res = await fetch(`${baseUrl}/reservations/${stay.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ checkOutDate: "2026-07-04T00:00:00.000Z", rateKobo: 2_500_000 }),
    });
    assert.equal((await res.json() as any).rateKobo, 2_500_000, "a negotiated rate is real");
  });

  test("a checked-in guest's arrival date cannot be changed", async () => {
    const room = await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03", { roomId: room.id })).json() as any;
    await fetch(`${baseUrl}/reservations/${stay.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: room.id }),
    });

    const res = await fetch(`${baseUrl}/reservations/${stay.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ checkInDate: "2026-07-02T00:00:00.000Z" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "ARRIVAL_LOCKED");
  });
});

describe("room assignment and moves", () => {
  test("assigning a room of a different type is refused unless the upgrade is explicit", async () => {
    await makeRoom(typeId);
    const standard = await makeRoom(altTypeId);
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03")).json() as any;

    const refused = await fetch(`${baseUrl}/reservations/${stay.id}/assign-room`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: standard.id }),
    });
    assert.equal(refused.status, 409);
    assert.equal((await refused.json() as any).error, "ROOM_TYPE_MISMATCH");

    const allowed = await fetch(`${baseUrl}/reservations/${stay.id}/assign-room`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: standard.id, allowTypeChange: true }),
    });
    assert.equal(allowed.status, 200);
    const body = await allowed.json() as any;
    assert.equal(body.typeChanged, true);
    assert.equal(body.roomTypeId, altTypeId, "the booked type follows the room");
    // Advisory: what the guest actually pays after a downgrade is a
    // commercial decision, so the rate card figure is reported, not applied.
    assert.equal(body.indicativeRateKobo, 3_000_000);
    assert.equal(body.rateKobo, 5_000_000, "the booked rate is untouched");

    // Inventory followed the type change too.
    assert.equal((await availability(cookie, "2026-07-01", "2026-07-03", typeId))["2026-07-01"], 1);
    assert.equal((await availability(cookie, "2026-07-01", "2026-07-03", altTypeId))["2026-07-01"], 0);
  });

  test("a room move updates both inventories, flips housekeeping, and writes an audit row", async () => {
    const first = await makeRoom();
    const second = await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-04", { roomId: first.id })).json() as any;
    await fetch(`${baseUrl}/reservations/${stay.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: first.id }),
    });

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/move-room`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: second.id, reason: "Air conditioning fault" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.movedFrom, first.number);
    assert.equal(body.movedTo, second.number);

    const { db } = await import("../db/client.js");
    const { rooms, roomNightInventory, auditLog } = await import("../db/schema.js");

    // The vacated room needs cleaning before anyone else goes in.
    const vacated = db.select().from(rooms).where(eq_(rooms.id, first.id)).get()!;
    assert.equal(vacated.status, "cleaning");
    assert.equal(vacated.housekeepingStatus, "dirty");
    assert.equal(db.select().from(rooms).where(eq_(rooms.id, second.id)).get()!.status, "occupied");

    // The night claims moved with the guest -- otherwise the old room stays
    // blocked and the new one is bookable out from under them.
    const held = db.select().from(roomNightInventory)
      .where(eq_(roomNightInventory.reservationId, stay.id)).all();
    assert.equal(held.length, 3);
    assert.ok(held.every(h => h.roomId === second.id));

    const audit = db.select().from(auditLog).where(eq_(auditLog.recordId, stay.id)).all()
      .find(a => a.action === "reservation_room_moved");
    assert.ok(audit, "a room move is audited");
    assert.match(audit!.details ?? "", /Air conditioning fault/);
  });

  test("a guest is not moved into a room that has not been cleaned", async () => {
    const first = await makeRoom();
    const dirty = await makeRoom(typeId, { housekeepingStatus: "dirty" });
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03", { roomId: first.id })).json() as any;
    await fetch(`${baseUrl}/reservations/${stay.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: first.id }),
    });

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/move-room`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: dirty.id, reason: "Guest request" }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "ROOM_NOT_CLEAN");
  });
});

describe("walk-in", () => {
  test("creates guest, reservation, assignment, check-in, first night and deposit in one go", async () => {
    const room = await makeRoom();
    const cookie = await login("FD");

    const res = await fetch(`${baseUrl}/reservations/walk-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        guest: { firstName: "Walk", lastName: "In", phone: "08030000000" },
        roomId: room.id,
        checkOutDate: "2026-07-03T00:00:00.000Z",
        depositKobo: 2_000_000, depositMethod: "cash",
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as any;

    assert.equal(body.status, "checked_in");
    assert.equal(body.roomNumber, room.number);
    assert.equal(body.rateKobo, 5_000_000, "priced from the rate card, not the form");
    // The first night is posted immediately: a walk-in who leaves before the
    // audit runs would otherwise owe nothing for the room.
    assert.equal(body.folio.totalNetKobo, 5_000_000);
    assert.equal(body.folio.totalPaidKobo, 2_000_000);

    const { db } = await import("../db/client.js");
    const { rooms } = await import("../db/schema.js");
    assert.equal(db.select().from(rooms).where(eq_(rooms.id, room.id)).get()!.status, "occupied");
  });

  test("a failure part-way leaves NO guest, NO reservation and NO charge", async () => {
    // Forced at the inventory-claim step, which runs AFTER the guest and the
    // reservation have both been inserted and after the room-night claim --
    // so a partial commit here is exactly the mess the single transaction
    // exists to prevent.
    //
    // (Honest note: the deposit insert itself has no failure mode that can be
    // triggered without mocking, so this proves the transaction boundary
    // using the last step that can genuinely fail.)
    const room = await makeRoom();
    const revenue = await login("FIN");
    await fetch(`${baseUrl}/inventory-calendar`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: revenue },
      body: JSON.stringify({ roomTypeId: typeId, from: "2026-07-01", to: "2026-07-05", outOfOrder: 1 }),
    });

    const { db } = await import("../db/client.js");
    const { guests, reservations, folioCharges, payments } = await import("../db/schema.js");
    const guestsBefore = db.select().from(guests).where(eq_(guests.branchId, branchId)).all().length;
    const staysBefore = db.select().from(reservations).where(eq_(reservations.branchId, branchId)).all().length;
    // Counted across the whole database, not filtered by branch: the test DB
    // is shared between the tests in this file, so an "is it in this branch?"
    // filter would count other tests' rows as leaks.
    const chargesBefore = db.select().from(folioCharges).all().length;
    const paymentsBefore = db.select().from(payments).all().length;

    const cookie = await login("FD");
    const res = await fetch(`${baseUrl}/reservations/walk-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        guest: { firstName: "Ghost", lastName: "WalkIn" },
        roomId: room.id,
        checkOutDate: "2026-07-03T00:00:00.000Z",
        depositKobo: 2_000_000, depositMethod: "cash",
      }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "NO_INVENTORY");

    assert.equal(
      db.select().from(guests).where(eq_(guests.branchId, branchId)).all().length, guestsBefore,
      "no orphan guest",
    );
    assert.equal(
      db.select().from(reservations).where(eq_(reservations.branchId, branchId)).all().length, staysBefore,
      "no orphan reservation",
    );
    assert.equal(
      db.select().from(guests).where(eq_(guests.branchId, branchId)).all()
        .filter(g => g.lastName === "WalkIn").length, 0,
    );
    // And nothing financial survived either -- neither the first night the
    // walk-in posts nor the deposit it takes.
    assert.equal(db.select().from(folioCharges).all().length, chargesBefore, "no charge posted");
    assert.equal(db.select().from(payments).all().length, paymentsBefore, "no deposit taken");
  });

  test("a dirty room is refused", async () => {
    const room = await makeRoom(typeId, { housekeepingStatus: "dirty" });
    const cookie = await login("FD");
    const res = await fetch(`${baseUrl}/reservations/walk-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        guest: { firstName: "Too", lastName: "Early" },
        roomId: room.id, checkOutDate: "2026-07-03T00:00:00.000Z",
      }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "ROOM_NOT_CLEAN");
  });
});

describe("lists", () => {
  test("arrivals follow the BUSINESS date, not the system date, when they differ", async () => {
    // THE WHOLE REASON invariant 9 EXISTS. The branch's trading day is the
    // 1st; the wall clock in this test process is years away. An arrivals
    // list built from `new Date()` would be empty, and the desk would think
    // nobody was due in.
    await makeRoom();
    const cookie = await login("FD");
    await book(cookie, "2026-07-01", "2026-07-03");

    const res = await fetch(`${baseUrl}/reservations/arrivals`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const body = await res.json() as any;

    assert.equal(body.businessDate, "2026-07-01", "the branch's trading day, not today's date");
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].guestName, "Life Cycle");

    // Rolling the trading day forward moves the list with it.
    const { db } = await import("../db/client.js");
    const { branches } = await import("../db/schema.js");
    db.update(branches).set({ currentBusinessDate: utc("2026-07-02") }).where(eq_(branches.id, branchId)).run();

    const next = await (await fetch(`${baseUrl}/reservations/arrivals`, { headers: { Cookie: cookie } })).json() as any;
    assert.equal(next.businessDate, "2026-07-02");
    assert.equal(next.items.length, 0);
  });

  test("departures and in-house read the same way", async () => {
    const room = await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03", { roomId: room.id })).json() as any;
    await fetch(`${baseUrl}/reservations/${stay.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: room.id }),
    });

    const inHouse = await (await fetch(`${baseUrl}/reservations/in-house`, { headers: { Cookie: cookie } })).json() as any;
    assert.equal(inHouse.items.length, 1);
    assert.equal(inHouse.items[0].roomNumber, room.number);

    const departures = await (await fetch(
      `${baseUrl}/reservations/departures?date=2026-07-03`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(departures.businessDate, "2026-07-03");
    assert.equal(departures.items.length, 1);
  });

  test("search matches guest, room and status, and pages with a stable cursor", async () => {
    await makeRoom();
    await makeRoom();
    const cookie = await login("FD");
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/reservations`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          newGuest: { firstName: `Guest${i}`, lastName: "Searchable" },
          roomTypeId: typeId,
          checkInDate: `2026-07-0${i + 1}T00:00:00.000Z`,
          checkOutDate: `2026-07-0${i + 2}T00:00:00.000Z`,
        }),
      });
    }

    const byName = await (await fetch(
      `${baseUrl}/reservations/search?q=Guest3`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(byName.items.length, 1);
    assert.equal(byName.items[0].guestName, "Guest3 Searchable");

    const byStatus = await (await fetch(
      `${baseUrl}/reservations/search?status=confirmed`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(byStatus.items.length, 5);

    // Paging must not repeat or skip a row.
    const first = await (await fetch(
      `${baseUrl}/reservations/search?limit=2`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(first.items.length, 2);
    assert.ok(first.hasMore);
    assert.ok(first.nextCursor);

    const second = await (await fetch(
      `${baseUrl}/reservations/search?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
      { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(second.items.length, 2);

    const seen = new Set([...first.items, ...second.items].map((r: any) => r.id));
    assert.equal(seen.size, 4, "no row appears on two pages");
  });

  test("a bad cursor is a 400, not a crash", async () => {
    const cookie = await login("FD");
    const res = await fetch(`${baseUrl}/reservations/search?cursor=not-a-cursor`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "INVALID_CURSOR");
  });
});

describe("no-show", () => {
  test("marks the stay, releases BOTH inventories, and records that the penalty is pending", async () => {
    const room = await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-04", { roomId: room.id })).json() as any;

    assert.equal((await availability(cookie, "2026-07-01", "2026-07-04"))["2026-07-01"], 0);

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/no-show`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ note: "Never arrived, phone unreachable" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, "no_show");
    // Honest about what it does NOT do: the penalty amount comes from B9's
    // policy engine, and inventing one would charge a real guest a made-up
    // figure.
    assert.equal(body.penaltyPosted, false);

    // The room must be resellable immediately -- this was a real bug in the
    // night audit's no-show pass before B8.
    const avail = await availability(cookie, "2026-07-01", "2026-07-04");
    assert.equal(avail["2026-07-01"], 1);
    assert.equal(avail["2026-07-02"], 1);

    const { db } = await import("../db/client.js");
    const { roomNightInventory } = await import("../db/schema.js");
    assert.equal(
      db.select().from(roomNightInventory).where(eq_(roomNightInventory.reservationId, stay.id)).all().length, 0,
      "the room-night claims are released too",
    );
  });

  test("marking a no-show twice is refused", async () => {
    await makeRoom();
    const cookie = await login("FD");
    const stay = await (await book(cookie, "2026-07-01", "2026-07-03")).json() as any;
    await fetch(`${baseUrl}/reservations/${stay.id}/no-show`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}",
    });
    const again = await fetch(`${baseUrl}/reservations/${stay.id}/no-show`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}",
    });
    assert.equal(again.status, 409);
  });
});

describe("the assignment board", () => {
  test("shows rooms, arrivals, departures and unassigned work for the business date", async () => {
    const occupied = await makeRoom();
    const free = await makeRoom();
    const cookie = await login("FD");

    const inHouse = await (await book(cookie, "2026-07-01", "2026-07-03", { roomId: occupied.id })).json() as any;
    await fetch(`${baseUrl}/reservations/${inHouse.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: occupied.id }),
    });
    // An arrival with no room yet -- the work the board exists to surface.
    await book(cookie, "2026-07-01", "2026-07-02");

    const res = await fetch(`${baseUrl}/rooms/assignment-board`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    const board = await res.json() as any;

    assert.equal(board.businessDate, "2026-07-01");
    assert.equal(board.summary.total, 2);
    assert.equal(board.summary.occupied, 1);
    assert.equal(board.summary.unassignedArrivals, 1);
    assert.equal(board.unassignedArrivals[0].guestName, "Life Cycle");

    const occupiedRow = board.rooms.find((r: any) => r.roomId === occupied.id);
    assert.ok(occupiedRow.occupant, "the in-house guest is shown against their room");
    assert.equal(occupiedRow.occupant.status, "checked_in");

    const freeRow = board.rooms.find((r: any) => r.roomId === free.id);
    assert.equal(freeRow.occupant, null);
    assert.equal(freeRow.status, "available");
  });
});
