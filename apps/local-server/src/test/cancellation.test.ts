// Backend Blueprint B9 — cancellation, refunds and deposits.
//
// This batch is what closes the Execution Plan's Phase 2 exit gate, which
// asks for "a simulated 30-day month with arrivals, extensions, no-shows,
// voids AND REFUNDS" that reconciles. Until now the reconciliation test had
// no refunds in it, because refunds did not exist.
//
// Two things here are worth more than the rest: that a cancelled stay's room
// becomes immediately rebookable (a room nobody is in that cannot be sold is
// the most expensive bug in this domain), and that a deposit is a liability
// rather than revenue until something entitles the property to keep it.
import { test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import { nanoid } from "nanoid";
import os from "node:os";
import path from "node:path";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NIGHTLY = 5_000_000; // ₦50,000
const DAY_MS = 86_400_000;

// DATES ARE RELATIVE TO THE REAL CLOCK, not hardcoded.
//
// The free-cancellation window is measured against `new Date()`, so a fixture
// pinned to fixed calendar dates silently drifts into or out of the window
// depending on when the suite runs. The first version of this file pinned
// September 2026 and every penalty came back as zero — the stays were weeks in
// the future, so cancelling them was always free. That was the code being
// right and the fixture being wrong.
const TODAY = new Date(Date.UTC(
  new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(),
));
/** yyyy-mm-dd, `n` days from today. Negative is in the past. */
const day = (n: number) => new Date(TODAY.getTime() + n * DAY_MS).toISOString().slice(0, 10);

let eq_: typeof import("drizzle-orm")["eq"];
let server: http.Server;
let baseUrl: string;
let orgId: string;
let branchId: string;
let userId: string;
let typeId: string;
let planId: string;
let policyId: string;
let roomId: string;
let roomNumber: string;
let fdCookie: string;
const ROOM_COUNT = 3;

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
  const {
    organizations, branches, users, roomTypes, ratePlans, rateCalendar, cancellationPolicies,
  } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");

  orgId = nanoid(); branchId = nanoid(); userId = nanoid();
  typeId = nanoid(); planId = nanoid(); policyId = nanoid();

  db.insert(organizations).values({ id: orgId, name: "CX Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "CX Branch", createdAt: new Date(),
    currentBusinessDate: TODAY, businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `cx-${userId}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("x"), role: "FIN",
    firstName: "CX", lastName: "Tester", status: "active", createdAt: new Date(),
  }).run();
  db.insert(roomTypes).values({
    id: typeId, branchId, code: "DLX", name: "Deluxe", maxOccupancy: 2,
    amenitiesJson: "[]", baseRateKobo: NIGHTLY, displayOrder: 0, isActive: true, createdAt: new Date(),
  }).run();
  db.insert(ratePlans).values({
    id: planId, branchId, code: "BAR", name: "Best Available Rate", planType: "base",
    includesBreakfast: false, isRefundable: true, effectiveFrom: new Date(0),
    isActive: true, createdAt: new Date(),
  }).run();
  // ±40 days around today, so a stay that arrived yesterday and one arriving
  // next month are both priceable.
  for (let t = TODAY.getTime() - 10 * DAY_MS; t <= TODAY.getTime() + 40 * DAY_MS; t += DAY_MS) {
    db.insert(rateCalendar).values({
      id: nanoid(), branchId, ratePlanId: planId, roomTypeId: typeId,
      stayDate: new Date(t), rateKobo: NIGHTLY, updatedAt: new Date(),
    }).run();
  }
  // 24h free, then the first night — the seeded default, made explicit here
  // so each test starts from a known policy rather than migration state.
  db.insert(cancellationPolicies).values({
    id: policyId, branchId, code: "STANDARD", name: "Standard 24-hour",
    freeCancellationHours: 24, penaltyType: "first_night",
    noShowPenaltyType: "first_night", isActive: true, createdAt: new Date(),
  }).run();

  // A room type with no rooms has no inventory, so every booking would 409 --
  // correct behaviour, and how the first run of this file failed. Three rooms
  // because several tests need two stays overlapping the same night.
  const { rooms } = await import("../db/schema.js");
  for (let i = 0; i < ROOM_COUNT; i++) {
    const id = nanoid();
    if (i === 0) { roomId = id; roomNumber = `X${Math.floor(Math.random() * 1_000_000)}`; }
    db.insert(rooms).values({
      id, branchId, number: i === 0 ? roomNumber : `X${Math.floor(Math.random() * 1_000_000)}`,
      type: "Deluxe", roomTypeId: typeId, status: "available", housekeepingStatus: "clean",
    }).run();
  }

  // Bookings always go through Front Desk: FIN has no reservations:create
  // grant, so booking as Finance 403s. That is the permission model working,
  // not a fixture convenience -- Finance approves refunds, it does not take
  // bookings.
  fdCookie = (await login("FD")).cookie;
});

/** The one room this branch has. Created in beforeEach. */
async function makeRoom() {
  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  return db.select().from(rooms).where(eq_(rooms.id, roomId)).get()!;
}

async function login(role: string) {
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `cx-http-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email, role,
    passwordHash: await hashPassword("correct-password"),
    firstName: "CX", lastName: "User", status: "active", createdAt: new Date(),
  }).run();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200, `login should succeed for ${role}`);
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], userId: id };
}

async function book(_cookie: string, checkIn: string, checkOut: string, extra: object = {}) {
  const res = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({
      newGuest: { firstName: "Cancel", lastName: "Guest" },
      roomTypeId: typeId,
      checkInDate: `${checkIn}T00:00:00.000Z`,
      checkOutDate: `${checkOut}T00:00:00.000Z`,
      ...extra,
    }),
  });
  // Read the body ONCE. `assert.equal(res.status, 201, await res.text())`
  // evaluates the message eagerly and consumes the stream, so the following
  // res.json() throws "Body is unusable" and masks the real failure.
  const body = await res.json() as any;
  assert.equal(res.status, 201, JSON.stringify(body));
  return body;
}

async function availableOn(cookie: string, date: string) {
  const res = await fetch(`${baseUrl}/availability?from=${date}&to=${day(40)}`, { headers: { Cookie: cookie } });
  const body = await res.json() as any;
  const type = body.types.find((t: any) => t.roomTypeId === typeId);
  return type.nights.find((n: any) => n.stayDate === date)?.available ?? null;
}

/** Sets the policy's penalty rule for a single test. */
async function setPolicy(fields: Record<string, unknown>) {
  const { db } = await import("../db/client.js");
  const { cancellationPolicies } = await import("../db/schema.js");
  db.update(cancellationPolicies).set(fields).where(eq_(cancellationPolicies.id, policyId)).run();
}

describe("the penalty matrix", () => {
  // Hand-computed against a 4-night ₦50,000/night stay = ₦200,000 total.
  const cases: Array<[string, Record<string, unknown>, number, string]> = [
    ["none", { penaltyType: "none" }, 0, "no penalty at all"],
    ["first_night", { penaltyType: "first_night" }, 5_000_000, "one night"],
    ["full_stay", { penaltyType: "full_stay" }, 20_000_000, "4 x ₦50,000"],
    ["percentage 30%", { penaltyType: "percentage", penaltyValueBp: 3_000 }, 6_000_000, "30% of ₦200,000"],
    ["fixed ₦15,000", { penaltyType: "fixed", penaltyFixedKobo: 1_500_000 }, 1_500_000, "the fixed amount"],
  ];

  for (const [label, fields, expected, why] of cases) {
    test(`${label} computes to ${expected} kobo — ${why}`, async () => {
      await setPolicy({ ...fields, freeCancellationHours: 0 });
      const { cookie } = await login("FD");
      const stay = await book(cookie, day(-1), day(3));

      const res = await fetch(`${baseUrl}/reservations/${stay.id}/cancellation-preview`, { headers: { Cookie: cookie } });
      assert.equal(res.status, 200);
      const preview = await res.json() as any;
      assert.equal(preview.penalty.amountKobo, expected, why);
    });
  }

  test("a percentage penalty is of the STAY total, not of one night", async () => {
    // The trap: 30% of ₦50,000 is ₦15,000, which is a rounding error next to
    // a four-night booking. A percentage policy that only ever charged a
    // fraction of one night would be indistinguishable from a bug.
    await setPolicy({ penaltyType: "percentage", penaltyValueBp: 3_000, freeCancellationHours: 0 });
    const { cookie } = await login("FD");
    const short = await book(cookie, day(-1), day(0));
    const long = await book(cookie, day(-1), day(3));

    const of = async (id: string) => {
      const res = await fetch(`${baseUrl}/reservations/${id}/cancellation-preview`, { headers: { Cookie: cookie } });
      const body = await res.json() as any;
      assert.equal(res.status, 200, JSON.stringify(body));
      return body.penalty.amountKobo;
    };

    assert.equal(await of(short.id), 1_500_000, "30% of one night");
    assert.equal(await of(long.id), 6_000_000, "30% of four nights");
  });
});

describe("the free-cancellation window", () => {
  test("inside the window costs nothing", async () => {
    await setPolicy({ freeCancellationHours: 24, penaltyType: "first_night" });
    const { cookie } = await login("FD");
    // Arrival is weeks away, so the request is comfortably inside 24h-before.
    const stay = await book(cookie, day(20), day(22));

    const preview = await (await fetch(
      `${baseUrl}/reservations/${stay.id}/cancellation-preview`, { headers: { Cookie: cookie } },
    )).json() as any;
    assert.equal(preview.penalty.withinFreeWindow, true);
    assert.equal(preview.penalty.amountKobo, 0);
    assert.match(preview.penalty.basis, /free-cancellation window/);
  });

  test("the free window does NOT excuse a no-show", async () => {
    // A guest who never arrives has not cancelled. Letting the window cover
    // that would make it the cheapest way to hold a room for nothing.
    await setPolicy({ freeCancellationHours: 8760, penaltyType: "none", noShowPenaltyType: "first_night" });
    const { cookie } = await login("FD");
    const stay = await book(cookie, day(0), day(2));

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/no-show`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}",
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.penaltyPosted, true, "the no-show is charged even though cancelling would be free");
    assert.ok(body.penaltyKobo >= NIGHTLY, "at least one night, plus tax");
  });
});

describe("cancelling", () => {
  test("posts the penalty, releases BOTH inventories, and the room is immediately rebookable", async () => {
    await setPolicy({ freeCancellationHours: 0, penaltyType: "first_night" });
    const room = await makeRoom();
    const { cookie } = await login("FD");
    const stay = await book(cookie, day(-1), day(3), { roomId: room.id });

    // Relative, not absolute: the branch has ROOM_COUNT rooms, so "booked"
    // means one fewer than free, whatever that count is.
    assert.equal(await availableOn(cookie, day(-1)), ROOM_COUNT - 1);

    const res = await fetch(`${baseUrl}/reservations/${stay.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Guest changed plans" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;

    assert.equal(body.reservation.status, "cancelled");
    assert.equal(body.penalty.amountKobo, NIGHTLY);
    assert.ok(body.penaltyChargeId, "the penalty is a real folio charge, not a note");
    assert.equal(body.releasedNights, 4);

    // THE EXPENSIVE BUG THIS PREVENTS: a room nobody is in that cannot be sold.
    assert.equal(await availableOn(cookie, day(-1)), ROOM_COUNT, "immediately rebookable");
    assert.equal(await availableOn(cookie, day(2)), ROOM_COUNT);

    const { db } = await import("../db/client.js");
    const { roomNightInventory } = await import("../db/schema.js");
    assert.equal(
      db.select().from(roomNightInventory).where(eq_(roomNightInventory.reservationId, stay.id)).all().length, 0,
      "the per-room night claims are gone too",
    );

    // And it can genuinely be rebooked, not just look free.
    const rebook = await book(cookie, day(10), day(12), { roomId: room.id });
    assert.ok(rebook.id);
  });

  test("the penalty goes through the tax engine like every other charge", async () => {
    await setPolicy({ freeCancellationHours: 0, penaltyType: "first_night" });
    const { db } = await import("../db/client.js");
    const { taxCodes, folioCharges } = await import("../db/schema.js");
    db.insert(taxCodes).values({
      id: nanoid(), branchId, code: "VAT", name: "VAT", jurisdiction: "federal", taxType: "vat",
      rateBp: 750, isInclusive: false, compoundsOnJson: "[]", appliesToJson: "[]",
      computationOrder: 100, effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();

    const { cookie } = await login("FD");
    const stay = await book(cookie, day(-1), day(1));
    const res = await fetch(`${baseUrl}/reservations/${stay.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Testing tax on penalties" }),
    });
    const body = await res.json() as any;

    // ₦50,000 penalty + 7.5% VAT = ₦53,750.
    assert.equal(body.penalty.amountKobo, 5_000_000);
    assert.equal(body.penaltyChargedKobo, 5_375_000);

    const lines = db.select().from(folioCharges).where(eq_(folioCharges.reservationId, stay.id)).all();
    assert.equal(lines.filter(l => l.chargeKind === "tax").length, 1, "tax is its own line, never folded in");
  });

  test("the preview matches what cancelling actually charges", async () => {
    await setPolicy({ freeCancellationHours: 0, penaltyType: "percentage", penaltyValueBp: 2_500 });
    const { cookie } = await login("FD");
    const stay = await book(cookie, day(-1), day(3));

    const preview = await (await fetch(
      `${baseUrl}/reservations/${stay.id}/cancellation-preview`, { headers: { Cookie: cookie } },
    )).json() as any;

    const cancelled = await (await fetch(`${baseUrl}/reservations/${stay.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Preview must not lie" }),
    })).json() as any;

    assert.equal(
      cancelled.penaltyChargedKobo, preview.penaltyWithTaxKobo,
      "a preview that differs from the charge is how a desk ends up arguing about money it already took",
    );
  });

  test("waiving without the grant is a 403; with it, the waiver is recorded", async () => {
    await setPolicy({ freeCancellationHours: 0, penaltyType: "first_night" });
    const { cookie: fd } = await login("FD");
    const { cookie: fin } = await login("FIN");

    const a = await book(fd, day(-1), day(1));
    const refused = await fetch(`${baseUrl}/reservations/${a.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fd },
      body: JSON.stringify({ reason: "Goodwill", waivePenalty: true, waiverReason: "Regular guest" }),
    });
    assert.equal(refused.status, 403, "cancelling is desk work; waiving is not");
    assert.equal((await refused.json() as any).required, "reservations:waive_penalty");

    const b = await book(fin, day(-1), day(1));
    const allowed = await fetch(`${baseUrl}/reservations/${b.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fin },
      body: JSON.stringify({ reason: "Goodwill", waivePenalty: true, waiverReason: "Regular guest, 10th stay" }),
    });
    assert.equal(allowed.status, 200);
    const body = await allowed.json() as any;
    assert.equal(body.penaltyWaived, true);
    assert.equal(body.penaltyChargeId, null, "nothing was charged");
    assert.equal(body.reservation.penaltyWaiverReason, "Regular guest, 10th stay");
  });

  test("a waiver with no reason is refused", async () => {
    await setPolicy({ freeCancellationHours: 0 });
    const { cookie } = await login("FIN");
    const stay = await book(cookie, day(-1), day(1));
    const res = await fetch(`${baseUrl}/reservations/${stay.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Because", waivePenalty: true }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "WAIVER_REASON_REQUIRED");
  });

  test("a checked-in guest cannot be cancelled", async () => {
    const room = await makeRoom();
    const { cookie } = await login("FD");
    const stay = await book(cookie, day(0), day(2), { roomId: room.id });
    await fetch(`${baseUrl}/reservations/${stay.id}/check-in`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ roomId: room.id }),
    });
    const res = await fetch(`${baseUrl}/reservations/${stay.id}/cancel`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reason: "Too late" }),
    });
    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.equal(body.error, "INVALID_STATUS");
    assert.match(body.message, /Check them out instead/);
  });
});

describe("refunds", () => {
  async function paidStay(cookie: string) {
    const room = await makeRoom();
    const stay = await book(cookie, day(0), day(2), { roomId: room.id });
    const { db } = await import("../db/client.js");
    const { payments } = await import("../db/schema.js");
    const paymentId = nanoid();
    db.insert(payments).values({
      id: paymentId, reservationId: stay.id, amountKobo: NIGHTLY,
      method: "card", receivedBy: userId, receivedAt: new Date(), businessDate: TODAY,
    }).run();
    return { stay, paymentId };
  }

  test("request then approve moves the ledger exactly once", async () => {
    const requester = await login("FD");
    const approver = await login("FIN");
    const { stay, paymentId } = await paidStay(requester.cookie);

    const requested = await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: requester.cookie },
      body: JSON.stringify({
        paymentId, reservationId: stay.id, requestedAmountKobo: 3_000_000,
        reason: "Room was not as described", method: "card",
      }),
    });
    assert.equal(requested.status, 201);
    const refund = await requested.json() as any;
    assert.match(refund.refundNumber, /-RFD-/);

    const { folioSummary } = await import("../services/folio.js");
    assert.equal(folioSummary(stay.id).totalPaidKobo, NIGHTLY, "requesting moves no money");

    const approved = await fetch(`${baseUrl}/refunds/${refund.refundId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: approver.cookie },
      body: JSON.stringify({ gatewayReference: "PSK-REF-991" }),
    });
    assert.equal(approved.status, 200);
    const body = await approved.json() as any;
    assert.equal(body.detail.status, "completed");
    assert.ok(body.paymentReversalId, "the ledger moved here, once");

    assert.equal(
      folioSummary(stay.id).totalPaidKobo, NIGHTLY - 3_000_000,
      "the refund is a negative payment row, not an edit to the original",
    );
  });

  test("the requester cannot approve their own refund", async () => {
    // Self-approval defeats the entire two-person control, which is the only
    // thing standing between a refund and the cash drawer.
    const fin = await login("FIN");
    const { stay, paymentId } = await paidStay(fin.cookie);

    const requested = await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fin.cookie },
      body: JSON.stringify({ paymentId, reservationId: stay.id, requestedAmountKobo: 1_000_000, reason: "Testing self-approval", method: "card" }),
    });
    const refund = await requested.json() as any;
    assert.equal(requested.status, 201, JSON.stringify(refund));

    const res = await fetch(`${baseUrl}/refunds/${refund.refundId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fin.cookie }, body: "{}",
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json() as any).error, "SELF_APPROVAL");
  });

  test("a refund at or above the threshold needs the elevated grant", async () => {
    const requester = await login("FD");
    const approver = await login("FIN");   // FIN does NOT hold refund_approve_high
    const room = await makeRoom();
    const stay = await book(requester.cookie, day(0), day(4), { roomId: room.id });

    const { db } = await import("../db/client.js");
    const { payments } = await import("../db/schema.js");
    const paymentId = nanoid();
    db.insert(payments).values({
      id: paymentId, reservationId: stay.id, amountKobo: 20_000_000,
      method: "transfer", receivedBy: userId, receivedAt: new Date(), businessDate: TODAY,
    }).run();

    const refund = await (await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: requester.cookie },
      body: JSON.stringify({
        paymentId, reservationId: stay.id, requestedAmountKobo: 15_000_000,
        reason: "Whole stay cancelled by the property", method: "transfer",
      }),
    })).json() as any;
    assert.equal(refund.requiresElevatedApproval, true);

    const refused = await fetch(`${baseUrl}/refunds/${refund.refundId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: approver.cookie }, body: "{}",
    });
    assert.equal(refused.status, 403);
    assert.equal((await refused.json() as any).required, "finance:refund_approve_high");

    // ORG carries "*", so it clears the elevated gate.
    const org = await login("ORG");
    const allowed = await fetch(`${baseUrl}/refunds/${refund.refundId}/approve`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: org.cookie }, body: "{}",
    });
    assert.equal(allowed.status, 200);
  });

  test("refunding more than the payment carries is refused", async () => {
    const requester = await login("FD");
    const { stay, paymentId } = await paidStay(requester.cookie);
    const res = await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: requester.cookie },
      body: JSON.stringify({
        paymentId, reservationId: stay.id, requestedAmountKobo: NIGHTLY + 1,
        reason: "Too much", method: "card",
      }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "REFUND_EXCEEDS_PAYMENT");
  });

  test("refunding by a different method than it was paid needs a stated reason", async () => {
    // Card-in / cash-out is a standard laundering route and a standard
    // chargeback problem, so it is allowed but never silent.
    const requester = await login("FD");
    const { stay, paymentId } = await paidStay(requester.cookie);

    const refused = await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: requester.cookie },
      body: JSON.stringify({
        paymentId, reservationId: stay.id, requestedAmountKobo: 1_000_000,
        reason: "Guest wants cash", method: "cash",
      }),
    });
    assert.equal(refused.status, 400);
    assert.equal((await refused.json() as any).error, "METHOD_MISMATCH");

    const allowed = await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: requester.cookie },
      body: JSON.stringify({
        paymentId, reservationId: stay.id, requestedAmountKobo: 1_000_000,
        reason: "Guest wants cash", method: "cash",
        methodOverrideReason: "Card terminal is down; guest is departing tonight",
      }),
    });
    assert.equal(allowed.status, 201);
  });

  test("deductions are itemised, not netted", async () => {
    const requester = await login("FD");
    const approver = await login("FIN");
    const { stay, paymentId } = await paidStay(requester.cookie);

    const refund = await (await fetch(`${baseUrl}/refunds`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: requester.cookie },
      body: JSON.stringify({
        paymentId, reservationId: stay.id, requestedAmountKobo: 5_000_000,
        deductions: [
          { label: "Cancellation penalty", amountKobo: 1_000_000 },
          { label: "Minibar", amountKobo: 250_000 },
        ],
        reason: "Early departure", method: "card",
      }),
    })).json() as any;

    // "We refunded ₦37,500 of ₦50,000" is an argument. The itemisation is
    // what makes it a receipt.
    assert.equal(refund.netAmountKobo, 5_000_000 - 1_250_000);
    const detail = await (await fetch(`${baseUrl}/refunds/${refund.refundId}`, { headers: { Cookie: approver.cookie } })).json() as any;
    assert.equal(detail.deductions.length, 2);
    assert.equal(detail.deductionTotalKobo, 1_250_000);
  });
});

describe("deposits as a liability", () => {
  test("holding one does NOT touch the folio", async () => {
    // The whole reason the table exists: until the guest stays, this is
    // someone else's money. Landing it on the folio would book unearned
    // income and understate what is owed back.
    const { cookie } = await login("FIN");
    const room = await makeRoom();
    const stay = await book(cookie, day(10), day(12), { roomId: room.id });

    const res = await fetch(`${baseUrl}/deposits`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reservationId: stay.id, amountKobo: 5_000_000, method: "transfer" }),
    });
    assert.equal(res.status, 201);
    const deposit = await res.json() as any;
    assert.equal(deposit.status, "held");

    const { folioSummary } = await import("../services/folio.js");
    assert.equal(folioSummary(stay.id).totalPaidKobo, 0, "a deposit is not a folio payment");

    const list = await (await fetch(`${baseUrl}/deposits`, { headers: { Cookie: cookie } })).json() as any;
    assert.equal(list.totalLiabilityKobo, 5_000_000, "it shows as a liability the property is carrying");
  });

  test("applied then partially refunded: the liability reaches exactly zero", async () => {
    const { cookie } = await login("FIN");
    const room = await makeRoom();
    const stay = await book(cookie, day(10), day(12), { roomId: room.id });
    const deposit = await (await fetch(`${baseUrl}/deposits`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reservationId: stay.id, amountKobo: 5_000_000, method: "cash" }),
    })).json() as any;

    // ₦30,000 covers the bill, ₦20,000 goes back.
    const applied = await (await fetch(`${baseUrl}/deposits/${deposit.id}/release`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ applyKobo: 3_000_000 }),
    })).json() as any;
    assert.equal(applied.outstandingKobo, 2_000_000);
    assert.equal(applied.deposit.status, "partially_refunded");

    const { folioSummary } = await import("../services/folio.js");
    assert.equal(
      folioSummary(stay.id).totalPaidKobo, 3_000_000,
      "applying converts the liability into a real folio payment",
    );

    const done = await (await fetch(`${baseUrl}/deposits/${deposit.id}/release`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refundKobo: 2_000_000, notes: "Balance returned at check-out" }),
    })).json() as any;

    assert.equal(done.outstandingKobo, 0, "exactly zero, not near it");
    assert.equal(done.deposit.appliedAmountKobo + done.deposit.refundedAmountKobo, 5_000_000);
    assert.ok(done.deposit.releasedAt, "a fully released deposit is closed");

    const list = await (await fetch(`${baseUrl}/deposits`, { headers: { Cookie: cookie } })).json() as any;
    assert.equal(list.totalLiabilityKobo, 0);
  });

  test("forfeiting turns the liability into taxed revenue, not just a status", async () => {
    const { db } = await import("../db/client.js");
    const { taxCodes, folioCharges } = await import("../db/schema.js");
    db.insert(taxCodes).values({
      id: nanoid(), branchId, code: "VAT", name: "VAT", jurisdiction: "federal", taxType: "vat",
      rateBp: 750, isInclusive: false, compoundsOnJson: "[]", appliesToJson: "[]",
      computationOrder: 100, effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();

    const { cookie } = await login("FIN");
    const room = await makeRoom();
    const stay = await book(cookie, day(10), day(12), { roomId: room.id });
    const deposit = await (await fetch(`${baseUrl}/deposits`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reservationId: stay.id, amountKobo: 2_000_000, method: "cash" }),
    })).json() as any;

    const res = await (await fetch(`${baseUrl}/deposits/${deposit.id}/release`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ forfeitKobo: 2_000_000, notes: "Damage to the room" }),
    })).json() as any;

    assert.equal(res.deposit.status, "forfeited");
    assert.ok(res.forfeitChargeId, "forfeited money is revenue, so it posts as a charge");

    // Recording it only as a status change would leave earned income out of
    // the day's revenue entirely.
    const lines = db.select().from(folioCharges).where(eq_(folioCharges.reservationId, stay.id)).all();
    const forfeit = lines.find(l => l.category === "Forfeited deposit" && l.chargeKind === "base");
    assert.ok(forfeit, "it lands in the ledger where the night audit will see it");
    assert.equal(forfeit!.amountKobo, 2_000_000);
    assert.ok(lines.some(l => l.parentChargeId === forfeit!.id && l.chargeKind === "tax"), "and it is taxed");
  });

  test("releasing more than is held is refused", async () => {
    const { cookie } = await login("FIN");
    const room = await makeRoom();
    const stay = await book(cookie, day(10), day(12), { roomId: room.id });
    const deposit = await (await fetch(`${baseUrl}/deposits`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ reservationId: stay.id, amountKobo: 1_000_000, method: "cash" }),
    })).json() as any;

    const res = await fetch(`${baseUrl}/deposits/${deposit.id}/release`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ applyKobo: 600_000, refundKobo: 600_000 }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "EXCEEDS_HELD_AMOUNT");
  });
});

describe("the night audit posts no-show penalties", () => {
  test("a no-show found by the audit is charged, and a re-run does not double-charge", async () => {
    await setPolicy({ noShowPenaltyType: "first_night" });
    const { cookie } = await login("FD");
    const room = await makeRoom();
    const stay = await book(cookie, day(0), day(3), { roomId: room.id });

    const { runNightAudit } = await import("../services/nightAudit/index.js");
    const results = runNightAudit(branchId, {
      now: new Date(TODAY.getTime() + 12 * 3_600_000), operatorUserId: userId,
    });
    const noShowStep = results[0].steps.find(s => s.name === "process_no_shows")!;
    assert.equal(noShowStep.count, 1);
    assert.match(noShowStep.detail ?? "", /penalties posted/);

    const { db } = await import("../db/client.js");
    const { folioCharges, noShowPostings } = await import("../db/schema.js");
    const posting = db.select().from(noShowPostings).where(eq_(noShowPostings.reservationId, stay.id)).get()!;
    assert.ok(posting.penaltyChargeId, "the posting finally references a real charge");

    const before = db.select().from(folioCharges).where(eq_(folioCharges.reservationId, stay.id)).all().length;

    // Wind back and re-run: the audit is re-runnable by design.
    const { branches } = await import("../db/schema.js");
    db.update(branches).set({ currentBusinessDate: TODAY }).where(eq_(branches.id, branchId)).run();
    runNightAudit(branchId, { now: new Date(TODAY.getTime() + 12 * 3_600_000), operatorUserId: userId });

    assert.equal(
      db.select().from(folioCharges).where(eq_(folioCharges.reservationId, stay.id)).all().length, before,
      "a re-run must not charge the guest twice",
    );
  });
});
