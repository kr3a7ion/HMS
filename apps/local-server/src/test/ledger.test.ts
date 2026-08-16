// Backend Blueprint B4 — append-only ledger, voids and reversals.
//
// The load-bearing test is the trigger one: application discipline can be
// undone by the next person who writes an UPDATE, so the point of an
// append-only ledger is that the database refuses regardless. That test
// bypasses every route and service and goes straight at the table.
import { test, describe, beforeAll as before, afterAll as after } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

let server: http.Server;
let baseUrl: string;
let orgId: string;
let branchId: string;
let finCookie: string;   // has folio:void
let fdCookie: string;    // must NOT have folio:void
let finUserId: string;

async function makeUser(role: string, email: string) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email,
    passwordHash: await hashPassword("correct-password"), role,
    firstName: role, lastName: "User", status: "active", createdAt: new Date(),
  }).run();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  return { id, cookie: res.headers.get("set-cookie")!.split(";")[0] };
}

/** A checked-in reservation with one ₦100,000 charge on its folio. */
async function seedFolio(chargeKobo = 10_000_000) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { guests, rooms, reservations, folioCharges } = await import("../db/schema.js");
  const guestId = nanoid();
  db.insert(guests).values({ id: guestId, branchId, firstName: "Ledger", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
  const roomId = nanoid();
  db.insert(rooms).values({ id: roomId, branchId, number: `L${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
  const reservationId = nanoid();
  db.insert(reservations).values({
    id: reservationId, branchId, guestId, roomId, status: "checked_in",
    checkInDate: new Date("2026-03-01"), checkOutDate: new Date("2026-03-03"),
    rateKobo: 5_000_000, createdBy: finUserId, createdAt: new Date(),
  }).run();
  const chargeId = nanoid();
  db.insert(folioCharges).values({
    id: chargeId, reservationId, category: "Room", description: "Room — 2 nights",
    quantity: 2, unitPriceKobo: 5_000_000, amountKobo: chargeKobo,
    postedBy: finUserId, postedAt: new Date(), businessDate: new Date(),
  }).run();
  return { reservationId, chargeId, roomId, guestId };
}

before(async () => {
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("Failed to bind test server");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { organizations, branches } = await import("../db/schema.js");
  orgId = nanoid();
  branchId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Test Org", createdAt: new Date() }).run();
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: new Date(), currentBusinessDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) }).run();

  const fin = await makeUser("FIN", "fin-ledger@example.com");
  finUserId = fin.id;
  finCookie = fin.cookie;
  fdCookie = (await makeUser("FD", "fd-ledger@example.com")).cookie;
});

after(async () => {
  await new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  const { sqlite } = await import("../db/client.js");
  sqlite.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
});

describe("append-only triggers (the backstop)", () => {
  test("a direct UPDATE of a posted amount is rejected by the database itself", async () => {
    const { chargeId } = await seedFolio();
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    assert.throws(
      () => db.update(folioCharges).set({ amountKobo: 1 }).where(eq(folioCharges.id, chargeId)).run(),
      /append-only/,
      "changing a posted amount must be impossible, not merely discouraged",
    );
    // And it really is unchanged.
    const after = db.select().from(folioCharges).where(eq(folioCharges.id, chargeId)).get()!;
    assert.equal(after.amountKobo, 10_000_000);
  });

  test("a direct DELETE of a posted charge is rejected", async () => {
    const { chargeId } = await seedFolio();
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    assert.throws(
      () => db.delete(folioCharges).where(eq(folioCharges.id, chargeId)).run(),
      /append-only/,
    );
    assert.ok(db.select().from(folioCharges).where(eq(folioCharges.id, chargeId)).get());
  });

  test("payments are equally immutable", async () => {
    const { nanoid } = await import("nanoid");
    const { db } = await import("../db/client.js");
    const { payments } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { reservationId } = await seedFolio();
    const paymentId = nanoid();
    db.insert(payments).values({
      id: paymentId, reservationId, amountKobo: 5_000_000, method: "cash",
      receivedBy: finUserId, receivedAt: new Date(), businessDate: new Date(),
    }).run();

    assert.throws(() => db.update(payments).set({ amountKobo: 1 }).where(eq(payments.id, paymentId)).run(), /append-only/);
    assert.throws(() => db.delete(payments).where(eq(payments.id, paymentId)).run(), /append-only/);
  });

  test("a fully voided line can never be edited again -- no un-voiding", async () => {
    const { reservationId, chargeId } = await seedFolio();
    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "posting_error" }),
    });
    assert.equal(res.status, 201);

    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    assert.throws(
      () => db.update(folioCharges).set({ voidReasonCode: "other" }).where(eq(folioCharges.id, chargeId)).run(),
      /append-only/,
      "once struck, a line is frozen -- the only way to move the balance again is another visible row",
    );
  });
});

describe("voiding a charge", () => {
  test("produces a reversal and moves the balance by exactly the reversed amount", async () => {
    const { reservationId, chargeId } = await seedFolio();

    const beforeRes = await fetch(`${baseUrl}/folios/${reservationId}`, { headers: { Cookie: finCookie } });
    const before = await beforeRes.json() as { balanceKobo: number };
    assert.equal(before.balanceKobo, 10_000_000);

    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "posting_error" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { reversalId: string; fullyVoided: boolean; folio: { balanceKobo: number } };
    assert.equal(body.fullyVoided, true);
    assert.equal(body.folio.balanceKobo, 0, "a fully voided charge must leave a zero balance");

    // The original is still there with its original amount -- that is the
    // whole point. The reversal nets it out rather than erasing it.
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const original = db.select().from(folioCharges).where(eq(folioCharges.id, chargeId)).get()!;
    assert.equal(original.amountKobo, 10_000_000, "the original amount is never rewritten");
    assert.ok(original.voidedAt, "the original is marked voided");
    assert.equal(original.voidedBy, finUserId);
    assert.equal(original.reversedAmountKobo, 10_000_000);

    const reversal = db.select().from(folioCharges).where(eq(folioCharges.id, body.reversalId)).get()!;
    assert.equal(reversal.amountKobo, -10_000_000, "the reversal carries the opposite sign");
    assert.equal(reversal.isReversal, true);
    assert.equal(reversal.reversalOfId, chargeId);
  });

  test("a partial void of 40% leaves 60% outstanding", async () => {
    const { reservationId, chargeId } = await seedFolio(10_000_000);
    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "service_failure", amountKobo: 4_000_000 }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { fullyVoided: boolean; remainingAmountKobo: number; folio: { balanceKobo: number } };

    assert.equal(body.fullyVoided, false);
    assert.equal(body.remainingAmountKobo, 6_000_000);
    assert.equal(body.folio.balanceKobo, 6_000_000, "60% of the charge must still be owed");

    // A partial void must NOT set voidedAt -- doing so would trip the
    // trigger and make the remaining 60% impossible to void later.
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const original = db.select().from(folioCharges).where(eq(folioCharges.id, chargeId)).get()!;
    assert.equal(original.voidedAt, null, "a partially voided line stays live");
    assert.equal(original.reversedAmountKobo, 4_000_000);
  });

  test("the rest of a partially voided charge can still be voided afterwards", async () => {
    const { reservationId, chargeId } = await seedFolio(10_000_000);
    const first = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "service_failure", amountKobo: 4_000_000 }),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "guest_dispute" }),
    });
    assert.equal(second.status, 201);
    const body = await second.json() as { fullyVoided: boolean; folio: { balanceKobo: number } };
    assert.equal(body.fullyVoided, true);
    assert.equal(body.folio.balanceKobo, 0);
  });

  test("voiding more than remains is refused", async () => {
    const { reservationId, chargeId } = await seedFolio(10_000_000);
    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "posting_error", amountKobo: 12_000_000 }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as { error: string }).error, "VOID_EXCEEDS_REMAINING");
  });

  test("an already fully-voided charge cannot be voided again", async () => {
    const { reservationId, chargeId } = await seedFolio();
    await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "duplicate" }),
    });
    const again = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "duplicate" }),
    });
    assert.equal(again.status, 409);
    assert.equal((await again.json() as { error: string }).error, "ALREADY_FULLY_VOIDED");
  });

  test('reason code "other" requires a note', async () => {
    const { reservationId, chargeId } = await seedFolio();
    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "other" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as { error: string }).error, "VOID_NOTE_REQUIRED");
  });

  test("an unknown reason code is rejected -- the list is controlled", async () => {
    const { reservationId, chargeId } = await seedFolio();
    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "because_i_felt_like_it" }),
    });
    assert.equal(res.status, 400);
  });
});

describe("voiding a payment", () => {
  test("reverses the payment and the balance goes back up", async () => {
    const { nanoid } = await import("nanoid");
    const { db } = await import("../db/client.js");
    const { payments } = await import("../db/schema.js");
    const { reservationId } = await seedFolio(10_000_000);
    const paymentId = nanoid();
    db.insert(payments).values({
      id: paymentId, reservationId, amountKobo: 10_000_000, method: "cash",
      receivedBy: finUserId, receivedAt: new Date(), businessDate: new Date(),
    }).run();

    const settled = await fetch(`${baseUrl}/folios/${reservationId}`, { headers: { Cookie: finCookie } });
    assert.equal((await settled.json() as { balanceKobo: number }).balanceKobo, 0);

    // e.g. the card payment was later charged back.
    const res = await fetch(`${baseUrl}/folios/${reservationId}/payments/${paymentId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reasonCode: "guest_dispute" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { folio: { balanceKobo: number } };
    assert.equal(body.folio.balanceKobo, 10_000_000, "reversing the payment puts the debt back");
  });
});

describe("permission", () => {
  test("Front Desk cannot void, and no rows are written", async () => {
    const { reservationId, chargeId } = await seedFolio();
    const { db } = await import("../db/client.js");
    const { folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const countBefore = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all().length;

    const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
      body: JSON.stringify({ reasonCode: "posting_error" }),
    });
    assert.equal(res.status, 403);

    const countAfter = db.select().from(folioCharges).where(eq(folioCharges.reservationId, reservationId)).all().length;
    assert.equal(countAfter, countBefore, "a refused void must write nothing at all");
    const original = db.select().from(folioCharges).where(eq(folioCharges.id, chargeId)).get()!;
    assert.equal(original.voidedAt, null);
  });
});

describe("reversal report", () => {
  test("groups by operator, which is what makes it a fraud-detection view", async () => {
    const a = await seedFolio(2_000_000);
    const b = await seedFolio(3_000_000);
    for (const { reservationId, chargeId } of [a, b]) {
      const res = await fetch(`${baseUrl}/folios/${reservationId}/charges/${chargeId}/void`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
        body: JSON.stringify({ reasonCode: "management_discretion" }),
      });
      assert.equal(res.status, 201);
    }

    const res = await fetch(`${baseUrl}/reports/reversals`, { headers: { Cookie: finCookie } });
    assert.equal(res.status, 200);
    const report = await res.json() as {
      totalReversals: number; totalReversedKobo: number;
      byOperator: Array<{ operatorId: string; count: number; totalKobo: number; byReason: Record<string, number> }>;
    };

    const mine = report.byOperator.find(o => o.operatorId === finUserId);
    assert.ok(mine, "the operator who did the voiding must appear");
    assert.ok(mine!.count >= 2);
    assert.ok(mine!.totalKobo >= 5_000_000);
    assert.ok(mine!.byReason["management_discretion"] >= 2, "reasons are counted per operator");
  });

  test("requires finance:reports -- Front Desk is refused", async () => {
    const res = await fetch(`${baseUrl}/reports/reversals`, { headers: { Cookie: fdCookie } });
    assert.equal(res.status, 403);
  });
});
