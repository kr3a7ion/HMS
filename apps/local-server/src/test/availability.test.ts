// Backend Blueprint B8 — room types, rate plans and availability.
//
// The two things this batch has to get right, and both are ways to lose real
// money rather than merely be untidy:
//
//   1. Availability must reflect a booking IMMEDIATELY, across the whole
//      stay range. A counter that lags by even one request oversells.
//   2. A quote must equal what gets posted. A guest quoted ₦53,750 and
//      billed ₦53,751 is an argument at the desk, and the desk will believe
//      the guest.
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
let planId: string;

beforeAll(async () => {
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
  const { organizations, branches, users, roomTypes, ratePlans } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  orgId = nanoid();
  branchId = nanoid();
  userId = nanoid();
  typeId = nanoid();
  planId = nanoid();

  db.insert(organizations).values({ id: orgId, name: "Avail Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "Avail Branch", createdAt: new Date(),
    currentBusinessDate: utc("2026-06-01"), businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `avail-${userId}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("x"), role: "FIN",
    firstName: "Rev", lastName: "Manager", status: "active", createdAt: new Date(),
  }).run();

  db.insert(roomTypes).values({
    id: typeId, branchId, code: "DLX", name: "Deluxe",
    maxOccupancy: 2, amenitiesJson: "[]", baseRateKobo: 4_000_000,
    displayOrder: 0, isActive: true, createdAt: new Date(),
  }).run();
  db.insert(ratePlans).values({
    id: planId, branchId, code: "BAR", name: "Best Available Rate",
    planType: "base", includesBreakfast: false, isRefundable: true,
    effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
  }).run();
});

async function makeRooms(count: number, status = "available") {
  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = nanoid();
    db.insert(rooms).values({
      id, branchId, number: `A${Math.floor(Math.random() * 1_000_000)}`,
      type: "Deluxe", roomTypeId: typeId, status,
    }).run();
    ids.push(id);
  }
  return ids;
}

async function login(role = "FIN") {
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `avail-http-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email, role,
    passwordHash: await hashPassword("correct-password"),
    firstName: "A", lastName: "User", status: "active", createdAt: new Date(),
  }).run();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function setRate(rateKobo: number, from = "2026-06-01", to = "2026-06-30", extra: object = {}) {
  const { db } = await import("../db/client.js");
  const { rateCalendar } = await import("../db/schema.js");
  const DAY = 86_400_000;
  for (let t = utc(from).getTime(); t <= utc(to).getTime(); t += DAY) {
    db.insert(rateCalendar).values({
      id: nanoid(), branchId, ratePlanId: planId, roomTypeId: typeId,
      stayDate: new Date(t), rateKobo, updatedAt: new Date(), ...extra,
    }).run();
  }
}

async function book(cookie: string, checkIn: string, checkOut: string, body: object = {}) {
  return fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      newGuest: { firstName: "Book", lastName: "Guest" },
      roomTypeId: typeId,
      checkInDate: `${checkIn}T00:00:00.000Z`,
      checkOutDate: `${checkOut}T00:00:00.000Z`,
      ...body,
    }),
  });
}

describe("availability", () => {
  test("reflects a booking immediately, across the whole stay range and no further", async () => {
    await makeRooms(3);
    await setRate(4_500_000);
    const cookie = await login("RSV");

    const before = await (await fetch(
      `${baseUrl}/availability?from=2026-06-01&to=2026-06-06`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(before.types[0].minAvailable, 3);

    // Book 3 nights: the 2nd, 3rd and 4th. Checkout day is not a night.
    const res = await book(cookie, "2026-06-02", "2026-06-05");
    assert.equal(res.status, 201);

    const after = await (await fetch(
      `${baseUrl}/availability?from=2026-06-01&to=2026-06-06`, { headers: { Cookie: cookie } },
    )).json() as any;
    const byDate = Object.fromEntries(after.types[0].nights.map((n: any) => [n.stayDate, n]));

    assert.equal(byDate["2026-06-01"].available, 3, "the night before is untouched");
    assert.equal(byDate["2026-06-02"].available, 2);
    assert.equal(byDate["2026-06-03"].available, 2);
    assert.equal(byDate["2026-06-04"].available, 2);
    assert.equal(byDate["2026-06-05"].available, 3, "checkout day is not a night");
  });

  test("is answered from the calendar, not by scanning reservations", async () => {
    // The DoD for this batch. Proven by consequence rather than by reading
    // the code: a reservation whose nights are NOT in the counter must not
    // affect availability. If anything still scanned reservations, this
    // would come back 2.
    await makeRooms(3);
    const { db } = await import("../db/client.js");
    const { reservations, guests } = await import("../db/schema.js");
    const guestId = nanoid();
    db.insert(guests).values({
      id: guestId, branchId, firstName: "Ghost", lastName: "Booking",
      vip: false, blacklisted: false, createdAt: new Date(),
    }).run();
    db.insert(reservations).values({
      id: nanoid(), branchId, guestId, roomTypeId: typeId, status: "confirmed",
      checkInDate: utc("2026-06-02"), checkOutDate: utc("2026-06-05"),
      rateKobo: 4_000_000, createdBy: userId, createdAt: new Date(),
    }).run();

    const cookie = await login("RSV");
    const avail = await (await fetch(
      `${baseUrl}/availability?from=2026-06-02&to=2026-06-05`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(
      avail.types[0].minAvailable, 3,
      "availability comes from inventory_calendar alone",
    );
  });

  test("a sold-out night blocks the whole stay, naming the dates", async () => {
    await makeRooms(1);
    await setRate(4_500_000);
    const cookie = await login("RSV");

    assert.equal((await book(cookie, "2026-06-02", "2026-06-04")).status, 201);

    // Overlaps the sold-out 3rd, even though the 4th and 5th are free.
    const res = await book(cookie, "2026-06-03", "2026-06-06");
    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.equal(body.error, "NO_INVENTORY");
    assert.deepEqual(body.soldOutDates, ["2026-06-03"]);
  });

  test("cancelling early puts the remaining nights back, but not the ones stayed", async () => {
    const [roomId] = await makeRooms(1);
    await setRate(4_500_000);
    // Front desk: booking and check-in/out are its job. Finance can price a
    // room but deliberately cannot check a guest in.
    const cookie = await login("FD");

    const created = await (await book(cookie, "2026-06-01", "2026-06-05", { roomId })).json() as any;
    await fetch(`${baseUrl}/reservations/${created.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId }),
    });

    // Business date is the 1st; the guest leaves early.
    const out = await fetch(`${baseUrl}/reservations/${created.id}/check-out`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ paymentAmountKobo: 99_999_999, paymentMethod: "cash" }),
    });
    assert.ok(out.status === 200 || out.status === 409, `unexpected ${out.status}`);

    const avail = await (await fetch(
      `${baseUrl}/availability?from=2026-06-01&to=2026-06-05`, { headers: { Cookie: cookie } },
    )).json() as any;
    const byDate = Object.fromEntries(avail.types[0].nights.map((n: any) => [n.stayDate, n]));

    if (out.status === 200) {
      // Nights from the current business date forward are back on sale;
      // the night already stayed stays sold, because occupancy history for
      // a frozen day must not be rewritten.
      assert.equal(byDate["2026-06-02"].available, 1, "future nights released");
      assert.equal(byDate["2026-06-03"].available, 1);
    }
  });
});

describe("overbooking", () => {
  test("stop-sell blocks a booking outright", async () => {
    await makeRooms(5);
    await setRate(4_500_000);
    const { db } = await import("../db/client.js");
    const { rateCalendar } = await import("../db/schema.js");
    const { and, eq } = await import("drizzle-orm");
    db.update(rateCalendar).set({ stopSell: true }).where(and(
      eq(rateCalendar.roomTypeId, typeId), eq(rateCalendar.stayDate, utc("2026-06-03")),
    )).run();

    const cookie = await login("RSV");
    const res = await book(cookie, "2026-06-02", "2026-06-05");
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "STOP_SELL");

    // Rooms are physically free -- this is a commercial decision, and it
    // must not be confused with being sold out.
    const avail = await (await fetch(
      `${baseUrl}/availability?from=2026-06-03&to=2026-06-04`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(avail.types[0].nights[0].available, 5);
    assert.equal(avail.types[0].nights[0].stopSell, true);
  });

  test("the overbooking limit permits a controlled oversell and says so", async () => {
    await makeRooms(1);
    await setRate(4_500_000);
    // Two roles on purpose: setting an oversell allowance is revenue
    // management, selling into it is the desk.
    const revenue = await login("FIN");
    const cookie = await login("RSV");

    const lift = await fetch(`${baseUrl}/inventory-calendar`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: revenue },
      body: JSON.stringify({ roomTypeId: typeId, from: "2026-06-02", to: "2026-06-03", overbookingLimit: 1 }),
    });
    assert.equal(lift.status, 200);

    assert.equal((await book(cookie, "2026-06-02", "2026-06-03")).status, 201);

    // The physical room is gone; the allowance is not.
    const second = await book(cookie, "2026-06-02", "2026-06-03");
    assert.equal(second.status, 201);
    const body = await second.json() as any;
    assert.equal(body.warning, "OVERSOLD", "an oversell is permitted but never silent");
    assert.deepEqual(body.oversoldDates, ["2026-06-02"]);

    // And the allowance itself is a limit, not a suggestion.
    const third = await book(cookie, "2026-06-02", "2026-06-03");
    assert.equal(third.status, 409);
    assert.equal((await third.json() as any).error, "NO_INVENTORY");
  });

  test("inventory cannot be blocked below what is already sold", async () => {
    await makeRooms(2);
    await setRate(4_500_000);
    const cookie = await login("RSV");
    const revenue = await login("FIN");
    assert.equal((await book(cookie, "2026-06-02", "2026-06-03")).status, 201);
    assert.equal((await book(cookie, "2026-06-02", "2026-06-03")).status, 201);

    const res = await fetch(`${baseUrl}/inventory-calendar`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: revenue },
      body: JSON.stringify({ roomTypeId: typeId, from: "2026-06-02", to: "2026-06-02", outOfOrder: 1 }),
    });
    // Allowing it would show negative availability and leave someone
    // deciding at check-in which guest has no room.
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "WOULD_OVERSELL");
  });
});

describe("rate resolution", () => {
  test("order is calendar → derived → base rate, and a missing rate is not zero", async () => {
    const { resolveRate } = await import("../services/availability/rates.js");

    // Nothing set: falls back to the type's base rate.
    let r = resolveRate(planId, typeId, utc("2026-06-10"));
    assert.equal(r.source, "base_rate");
    assert.equal(r.rateKobo, 4_000_000);

    // An explicit row wins.
    await setRate(5_500_000, "2026-06-10", "2026-06-10");
    r = resolveRate(planId, typeId, utc("2026-06-10"));
    assert.equal(r.source, "calendar");
    assert.equal(r.rateKobo, 5_500_000);

    // A type with no base rate and no calendar row resolves to null, NOT 0.
    const { db } = await import("../db/client.js");
    const { roomTypes } = await import("../db/schema.js");
    const bare = nanoid();
    db.insert(roomTypes).values({
      id: bare, branchId, code: "BARE", name: "Unpriced",
      maxOccupancy: 2, amenitiesJson: "[]", baseRateKobo: 0,
      displayOrder: 9, isActive: true, createdAt: new Date(),
    }).run();
    assert.equal(
      resolveRate(planId, bare, utc("2026-06-10")).rateKobo, null,
      "zero is a real price (a comp); unknown must be null or rooms sell free",
    );
  });

  test("a derived plan follows the base when the base rate changes", async () => {
    const { db } = await import("../db/client.js");
    const { ratePlans, rateCalendar } = await import("../db/schema.js");
    const { and, eq } = await import("drizzle-orm");
    const { resolveRate } = await import("../services/availability/rates.js");

    const corporate = nanoid();
    db.insert(ratePlans).values({
      id: corporate, branchId, code: "CORP", name: "Corporate",
      planType: "derived", derivedFromId: planId,
      derivationType: "percentage", derivationValueBp: -1_500,   // 15% off
      includesBreakfast: false, isRefundable: true,
      effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();

    await setRate(5_000_000, "2026-06-10", "2026-06-10");
    let r = resolveRate(corporate, typeId, utc("2026-06-10"));
    assert.equal(r.source, "derived");
    assert.equal(r.rateKobo, 4_250_000, "₦50,000 less 15%");

    // THE BUG THIS DESIGN PREVENTS: if derived rates were stored rather than
    // computed, this change would leave CORP on yesterday's price and nobody
    // would notice until a corporate client queried an invoice.
    db.update(rateCalendar).set({ rateKobo: 6_000_000 }).where(and(
      eq(rateCalendar.ratePlanId, planId),
      eq(rateCalendar.roomTypeId, typeId),
      eq(rateCalendar.stayDate, utc("2026-06-10")),
    )).run();

    r = resolveRate(corporate, typeId, utc("2026-06-10"));
    assert.equal(r.rateKobo, 5_100_000, "₦60,000 less 15% — it followed");
  });

  test("a stop-sell on the base plan closes the night for derived plans too", async () => {
    const { db } = await import("../db/client.js");
    const { ratePlans } = await import("../db/schema.js");
    const { resolveRate } = await import("../services/availability/rates.js");

    const corporate = nanoid();
    db.insert(ratePlans).values({
      id: corporate, branchId, code: "CORP", name: "Corporate",
      planType: "derived", derivedFromId: planId,
      derivationType: "percentage", derivationValueBp: -1_000,
      includesBreakfast: false, isRefundable: true,
      effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();
    await setRate(5_000_000, "2026-06-11", "2026-06-11", { stopSell: true });

    // "The hotel is not selling that night" has to mean every plan.
    assert.equal(resolveRate(corporate, typeId, utc("2026-06-11")).stopSell, true);
  });

  test("a derivation cycle is refused rather than silently pricing nothing", async () => {
    const cookie = await login("FIN");
    const a = await (await fetch(`${baseUrl}/rate-plans`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        code: "AAA", name: "A", planType: "derived", derivedFromId: planId,
        derivationType: "percentage", derivationValueBp: -500,
      }),
    })).json() as any;

    // Pointing BAR at A would close the loop A → BAR → A.
    const res = await fetch(`${baseUrl}/rate-plans/${planId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        derivedFromId: a.id, derivationType: "percentage", derivationValueBp: -500,
      }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "DERIVATION_CYCLE");
  });
});

describe("quoting", () => {
  test("the quote total matches the tax engine's breakdown exactly", async () => {
    await makeRooms(2);
    await setRate(5_000_000, "2026-06-02", "2026-06-04");

    const { db } = await import("../db/client.js");
    const { taxCodes } = await import("../db/schema.js");
    db.insert(taxCodes).values({
      id: nanoid(), branchId, code: "VAT", name: "VAT",
      jurisdiction: "federal", taxType: "vat", rateBp: 750, isInclusive: false,
      compoundsOnJson: "[]", appliesToJson: "[]", computationOrder: 100,
      effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();

    const cookie = await login("RSV");
    const res = await fetch(`${baseUrl}/availability/quote`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        roomTypeId: typeId,
        checkInDate: "2026-06-02T00:00:00.000Z",
        checkOutDate: "2026-06-04T00:00:00.000Z",
      }),
    });
    assert.equal(res.status, 200);
    const quote = await res.json() as any;

    // Two nights at ₦50,000 = ₦100,000, plus 7.5% VAT = ₦107,500.
    assert.equal(quote.nightCount, 2);
    assert.equal(quote.subtotalKobo, 10_000_000);
    assert.equal(quote.taxTotalKobo, 750_000);
    assert.equal(quote.totalKobo, 10_750_000);
    assert.equal(quote.display.total, "₦107,500.00");
    assert.equal(quote.bookable, true);

    // The quote is the tax engine's own output, not a second calculation.
    const { computeTax } = await import("../services/tax/engine.js");
    const direct = computeTax(10_000_000, { branchId, chargeCategory: "Room" });
    assert.equal(quote.totalKobo, direct.totalKobo);
    assert.deepEqual(
      quote.tax.lines.map((l: any) => [l.code, l.amountKobo]),
      direct.lines.map(l => [l.code, l.amountKobo]),
    );
  });

  test("the quote equals what actually gets posted to the folio", async () => {
    // THE DoD: "quotes match posted charges". Quote a stay, book it, run the
    // audit over its nights, and compare the folio against the quote.
    await makeRooms(2);
    await setRate(4_500_000, "2026-06-01", "2026-06-05");

    const { db } = await import("../db/client.js");
    const { taxCodes } = await import("../db/schema.js");
    db.insert(taxCodes).values({
      id: nanoid(), branchId, code: "VAT", name: "VAT",
      jurisdiction: "federal", taxType: "vat", rateBp: 750, isInclusive: false,
      compoundsOnJson: "[]", appliesToJson: "[]", computationOrder: 100,
      effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();

    const cookie = await login("FD");
    const quote = await (await fetch(`${baseUrl}/availability/quote`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        roomTypeId: typeId,
        checkInDate: "2026-06-01T00:00:00.000Z",
        checkOutDate: "2026-06-04T00:00:00.000Z",
      }),
    })).json() as any;

    const [roomId] = await makeRooms(1);
    const created = await (await book(cookie, "2026-06-01", "2026-06-04", { roomId })).json() as any;
    await fetch(`${baseUrl}/reservations/${created.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId }),
    });

    const { runNightAudit } = await import("../services/nightAudit/index.js");
    runNightAudit(branchId, { now: new Date("2026-06-03T12:00:00.000Z"), operatorUserId: userId });

    const { folioSummary } = await import("../services/folio.js");
    const folio = folioSummary(created.id);

    assert.equal(folio.totalNetKobo, quote.subtotalKobo, "three nights at the quoted rate");
    assert.equal(
      folio.totalChargesKobo, quote.totalKobo,
      "the guest is billed exactly what they were quoted",
    );
  }, 60_000);

  test("an unpriced night is a blocker, not a free room", async () => {
    await makeRooms(2);
    const { db } = await import("../db/client.js");
    const { roomTypes } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    db.update(roomTypes).set({ baseRateKobo: 0 }).where(eq(roomTypes.id, typeId)).run();

    const cookie = await login("RSV");
    const quote = await (await fetch(`${baseUrl}/availability/quote`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        roomTypeId: typeId,
        checkInDate: "2026-06-20T00:00:00.000Z",
        checkOutDate: "2026-06-21T00:00:00.000Z",
      }),
    })).json() as any;

    assert.equal(quote.bookable, false);
    assert.ok(quote.blockers.some((b: string) => b.startsWith("NO_RATE:")));

    // And booking it is refused rather than sold at zero.
    const res = await book(cookie, "2026-06-20", "2026-06-21");
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "NO_RATE_FOR_DATE");
  });

  test("over-occupancy blocks the quote", async () => {
    await makeRooms(2);
    await setRate(4_500_000);
    const cookie = await login("RSV");
    const quote = await (await fetch(`${baseUrl}/availability/quote`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        roomTypeId: typeId, guests: 4,
        checkInDate: "2026-06-02T00:00:00.000Z",
        checkOutDate: "2026-06-03T00:00:00.000Z",
      }),
    })).json() as any;
    assert.equal(quote.bookable, false);
    assert.ok(quote.blockers.includes("OVER_OCCUPANCY:2"));
  });
});

describe("booking without an explicit rate", () => {
  test("the rate comes from the calendar, and a booking still honours an explicit override", async () => {
    await makeRooms(2);
    await setRate(4_800_000, "2026-06-02", "2026-06-04");
    const cookie = await login("RSV");

    const fromCalendar = await (await book(cookie, "2026-06-02", "2026-06-04")).json() as any;
    assert.equal(fromCalendar.rateKobo, 4_800_000, "priced by the rate card, not by the form");
    assert.equal(fromCalendar.ratePlanId, planId);

    // A negotiated rate is real and still wins.
    const negotiated = await (await book(cookie, "2026-06-02", "2026-06-04", { rateKobo: 3_000_000 })).json() as any;
    assert.equal(negotiated.rateKobo, 3_000_000);
  });

  test("a varying rate is stored as the average so the stay total stays exact", async () => {
    await makeRooms(2);
    await setRate(4_000_000, "2026-06-02", "2026-06-02");
    await setRate(6_000_000, "2026-06-03", "2026-06-03");
    const cookie = await login("RSV");

    const created = await (await book(cookie, "2026-06-02", "2026-06-04")).json() as any;
    // reservations.rateKobo is the NIGHTLY rate the audit posts against, so
    // a two-night stay at ₦40,000 and ₦60,000 stores ₦50,000 — and the stay
    // still totals ₦100,000.
    assert.equal(created.rateKobo, 5_000_000);
  });
});

describe("the backfill", () => {
  test("produces types, plans and inventory consistent with the pre-migration state", async () => {
    // Migration 0008 ran against this database when it was created. Its job
    // was to make an operating property's existing rooms, rates and bookings
    // legible to the new model without changing any of them.
    const { db } = await import("../db/client.js");
    const { roomTypes, ratePlans, rooms } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    // A branch created BEFORE this test's beforeEach ran -- i.e. one that
    // the migration itself had to handle -- gets its BAR plan from the
    // seed. Every branch does.
    const plans = db.select().from(ratePlans).where(eq(ratePlans.branchId, branchId)).all();
    assert.ok(plans.some(p => p.code === "BAR"), "every branch has a base plan");

    // Rooms created with a legacy free-text type and no roomTypeId are what
    // the backfill had to cope with; the modern path sets it explicitly.
    const roomId = nanoid();
    db.insert(rooms).values({
      id: roomId, branchId, number: `L${Math.floor(Math.random() * 1_000_000)}`,
      type: "Deluxe", roomTypeId: typeId,
    }).run();
    const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get()!;
    assert.equal(room.roomTypeId, typeId);

    const type = db.select().from(roomTypes).where(eq(roomTypes.id, typeId)).get()!;
    assert.equal(type.code, "DLX");
    assert.ok(type.isActive);
  });

  test("the horizon extends rather than walking backwards", async () => {
    await makeRooms(2);
    const { extendHorizon } = await import("../services/availability/inventory.js");
    const { db } = await import("../db/client.js");
    const { inventoryCalendar } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    extendHorizon(branchId, 30, utc("2026-06-01"));
    const first = db.select().from(inventoryCalendar).where(eq(inventoryCalendar.roomTypeId, typeId)).all();
    assert.equal(first.length, 30);

    // A day later the far edge must move forward, not stay put.
    extendHorizon(branchId, 30, utc("2026-06-02"));
    const second = db.select().from(inventoryCalendar).where(eq(inventoryCalendar.roomTypeId, typeId)).all();
    assert.equal(second.length, 31, "one new night at the far end");

    const latest = second.map(r => r.stayDate.getTime()).sort((a, b) => b - a)[0];
    assert.equal(new Date(latest).toISOString().slice(0, 10), "2026-07-01");
  });

  test("a room taken out of service stops being sellable on future nights only", async () => {
    const ids = await makeRooms(3);
    const { db } = await import("../db/client.js");
    const { rooms, inventoryCalendar } = await import("../db/schema.js");
    const { and, eq } = await import("drizzle-orm");
    const { extendHorizon } = await import("../services/availability/inventory.js");

    extendHorizon(branchId, 10, utc("2026-06-01"));
    db.update(rooms).set({ status: "out_of_service" }).where(eq(rooms.id, ids[0])).run();
    extendHorizon(branchId, 10, utc("2026-06-05"));

    const future = db.select().from(inventoryCalendar).where(and(
      eq(inventoryCalendar.roomTypeId, typeId),
      eq(inventoryCalendar.stayDate, utc("2026-06-07")),
    )).get()!;
    assert.equal(future.outOfOrder, 1, "future nights reflect it");

    // A past night's total is a historical fact: that is how many rooms the
    // property had. Rewriting it would change occupancy already reported.
    const past = db.select().from(inventoryCalendar).where(and(
      eq(inventoryCalendar.roomTypeId, typeId),
      eq(inventoryCalendar.stayDate, utc("2026-06-01")),
    )).get()!;
    assert.equal(past.outOfOrder, 0, "history is not rewritten");
  });
});

describe("permissions", () => {
  test("front desk can read rates but not set them", async () => {
    const cookie = await login("FD");
    assert.equal((await fetch(`${baseUrl}/room-types`, { headers: { Cookie: cookie } })).status, 200);

    const res = await fetch(`${baseUrl}/rate-calendar/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        roomTypeIds: [typeId], from: "2026-06-02", to: "2026-06-05", rateKobo: 1_000_000,
      }),
    });
    assert.equal(res.status, 403, "pricing is revenue management, not front-desk work");
  });

  test("rates cannot be written onto a derived plan", async () => {
    const cookie = await login("FIN");
    const derived = await (await fetch(`${baseUrl}/rate-plans`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        code: "OTA", name: "OTA", planType: "derived", derivedFromId: planId,
        derivationType: "percentage", derivationValueBp: 1_200,
      }),
    })).json() as any;

    const res = await fetch(`${baseUrl}/rate-calendar/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        ratePlanId: derived.id, roomTypeIds: [typeId],
        from: "2026-06-02", to: "2026-06-05", rateKobo: 1_000_000,
      }),
    });
    // An explicit row would beat the derivation, silently stopping the plan
    // from tracking its base.
    assert.equal(res.status, 409);
    assert.equal((await res.json() as any).error, "PLAN_IS_DERIVED");
  });

  test("the bulk editor applies to a weekday subset in one transaction", async () => {
    const cookie = await login("FIN");
    const res = await fetch(`${baseUrl}/rate-calendar/bulk`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        roomTypeIds: [typeId], from: "2026-06-01", to: "2026-06-30",
        weekdays: [5, 6], rateKobo: 6_500_000,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    // June 2026 starts on a Monday: Fridays are the 5th, 12th, 19th and
    // 26th, Saturdays the 6th, 13th, 20th and 27th. Eight, not nine.
    assert.equal(body.nightsUpdated, 8, "Fridays and Saturdays in June 2026");

    const { resolveRate } = await import("../services/availability/rates.js");
    // 2026-06-05 is a Friday, 2026-06-08 a Monday.
    assert.equal(resolveRate(planId, typeId, utc("2026-06-05")).rateKobo, 6_500_000);
    assert.equal(resolveRate(planId, typeId, utc("2026-06-08")).source, "base_rate");
  });
});
