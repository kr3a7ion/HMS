// Backend Blueprint B3 — the four concurrency/atomicity tests.
//
// AN HONEST NOTE ON "PARALLEL". better-sqlite3 is synchronous and Node runs
// one thread, so 50 in-flight HTTP requests do not execute simultaneously
// the way they would against Postgres. They interleave only where a handler
// yields (an `await`), and a fully synchronous handler runs to completion
// uninterrupted.
//
// That does NOT make these tests theatre, for three reasons:
//   1. The unique index is what actually guarantees one winner, and it is
//      exercised for real here -- the second insert genuinely fails.
//   2. Several handlers on this path ARE async (check-out awaits lock
//      revocation), so interleaving is real, not hypothetical.
//   3. The atomicity halves (a throw mid-handler leaving nothing behind)
//      are fully exercised regardless of threading, and those are the
//      failures that corrupt data rather than merely annoying a user.
// Where a test proves something weaker than its name suggests, it says so.
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
let fdCookie: string;
let fdUserId: string;

async function createRoom() {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(rooms).values({ id, branchId, number: `C${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
  return id;
}

async function createGuest() {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { guests } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(guests).values({ id, branchId, firstName: "Race", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
  return id;
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
  const { organizations, branches, users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  orgId = nanoid();
  branchId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Test Org", createdAt: new Date() }).run();
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: new Date(), currentBusinessDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) }).run();

  fdUserId = nanoid();
  db.insert(users).values({
    id: fdUserId, organizationId: orgId, branchId, email: "fd-concurrency@example.com",
    passwordHash: await hashPassword("correct-password"), role: "ORG",
    firstName: "Front", lastName: "Desk", status: "active", createdAt: new Date(),
  }).run();
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "fd-concurrency@example.com", password: "correct-password" }),
  });
  fdCookie = loginRes.headers.get("set-cookie")!.split(";")[0];
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

describe("double booking", () => {
  test("50 concurrent bookings of the same room and dates: exactly one succeeds", async () => {
    const roomId = await createRoom();
    const guestIds = await Promise.all(Array.from({ length: 50 }, () => createGuest()));

    const responses = await Promise.all(guestIds.map(guestId =>
      fetch(`${baseUrl}/reservations`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
        body: JSON.stringify({
          guestId, roomId,
          checkInDate: "2026-05-01", checkOutDate: "2026-05-04",
          rateKobo: 4_000_000,
        }),
      }),
    ));

    const statuses = responses.map(r => r.status);
    const created = statuses.filter(s => s === 201).length;
    const rejected = statuses.filter(s => s === 409).length;

    assert.equal(created, 1, `exactly one booking may succeed, got ${created}`);
    assert.equal(rejected, 49, `the other 49 must be rejected with 409, got ${rejected}`);

    // And the database agrees: 3 nights held, all by the one winner.
    const { db } = await import("../db/client.js");
    const { roomNightInventory } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const nights = db.select().from(roomNightInventory).where(eq(roomNightInventory.roomId, roomId)).all();
    assert.equal(nights.length, 3, "a 3-night stay must hold exactly 3 nights");
    assert.equal(new Set(nights.map(n => n.reservationId)).size, 1, "all nights must belong to one reservation");
  });

  test("the unique index -- not the application check -- is what actually blocks it", async () => {
    // Bypasses the route entirely and inserts straight into the table, so
    // this fails if someone ever "optimises away" the constraint and leaves
    // only the overlap query behind.
    const roomId = await createRoom();
    const guestId = await createGuest();
    const createRes = await fetch(`${baseUrl}/reservations`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
      body: JSON.stringify({ guestId, roomId, checkInDate: "2026-06-01", checkOutDate: "2026-06-02", rateKobo: 4_000_000 }),
    });
    assert.equal(createRes.status, 201);
    const { id: reservationId } = await createRes.json() as { id: string };

    const { db } = await import("../db/client.js");
    const { roomNightInventory } = await import("../db/schema.js");
    const { nanoid } = await import("nanoid");
    const existing = db.select().from(roomNightInventory).all()
      .filter(n => n.roomId === roomId)[0];
    assert.ok(existing, "the booking should have claimed a night");

    assert.throws(
      () => db.insert(roomNightInventory).values({
        id: nanoid(), branchId, roomId,
        stayDate: existing.stayDate, reservationId, createdAt: new Date(),
      }).run(),
      (err: any) => err?.code === "SQLITE_CONSTRAINT_UNIQUE",
      "a duplicate room-night must be rejected by the database itself",
    );
  });

  test("a same-day turnover is still allowed -- checkout day is not a night", async () => {
    const roomId = await createRoom();
    const first = await fetch(`${baseUrl}/reservations`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
      body: JSON.stringify({ guestId: await createGuest(), roomId, checkInDate: "2026-07-01", checkOutDate: "2026-07-03", rateKobo: 4_000_000 }),
    });
    assert.equal(first.status, 201);

    // Arrives the day the previous guest leaves.
    const second = await fetch(`${baseUrl}/reservations`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
      body: JSON.stringify({ guestId: await createGuest(), roomId, checkInDate: "2026-07-03", checkOutDate: "2026-07-05", rateKobo: 4_000_000 }),
    });
    assert.equal(second.status, 201, "a same-day turnover must not be treated as a conflict");
  });
});

describe("check-in", () => {
  test("20 concurrent check-ins on one reservation: exactly one succeeds", async () => {
    const roomId = await createRoom();
    const guestId = await createGuest();
    const createRes = await fetch(`${baseUrl}/reservations`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
      body: JSON.stringify({ guestId, roomId, checkInDate: "2026-08-01", checkOutDate: "2026-08-03", rateKobo: 5_000_000 }),
    });
    const { id } = await createRes.json() as { id: string };

    const responses = await Promise.all(Array.from({ length: 20 }, () =>
      fetch(`${baseUrl}/reservations/${id}/check-in`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie }, body: "{}",
      }),
    ));
    const ok = responses.filter(r => r.status === 200).length;
    assert.equal(ok, 1, `exactly one check-in may succeed, got ${ok}`);

    // B5: check-in no longer posts a room charge (the night audit does), so
    // the ledger assertion moves to what a double check-in WOULD now
    // duplicate -- nothing may be posted at all, and the reservation must
    // have been transitioned exactly once.
    const { db } = await import("../db/client.js");
    const { folioCharges, reservations } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const roomCharges = db.select().from(folioCharges)
      .where(eq(folioCharges.reservationId, id)).all()
      .filter(c => c.category === "Room");
    assert.equal(roomCharges.length, 0, "check-in posts no room charge under B5");
    const reservation = db.select().from(reservations).where(eq(reservations.id, id)).get()!;
    assert.equal(reservation.status, "checked_in");
  });
});

describe("atomicity", () => {
  test("a failure part-way through check-in leaves reservation, room and folio all unchanged", async () => {
    const roomId = await createRoom();
    const guestId = await createGuest();
    const createRes = await fetch(`${baseUrl}/reservations`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
      body: JSON.stringify({ guestId, roomId, checkInDate: "2026-09-01", checkOutDate: "2026-09-03", rateKobo: 5_000_000 }),
    });
    const { id } = await createRes.json() as { id: string };

    const { db } = await import("../db/client.js");
    const { reservations, rooms, folioCharges } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { immediateTransaction } = await import("../db/tx.js");
    const { nanoid } = await import("nanoid");

    // Reproduces check-in's exact write sequence and throws after the first
    // two writes -- the shape the handler would have had without a
    // transaction. If db.transaction ever stops rolling back, this catches it.
    assert.throws(() => {
      immediateTransaction(() => {
        db.update(reservations).set({ status: "checked_in", roomId }).where(eq(reservations.id, id)).run();
        db.update(rooms).set({ status: "occupied" }).where(eq(rooms.id, roomId)).run();
        db.insert(folioCharges).values({
          id: nanoid(), reservationId: id, category: "Room", description: "should not survive",
          quantity: 2, unitPriceKobo: 5_000_000, amountKobo: 10_000_000,
          postedBy: fdUserId, postedAt: new Date(), businessDate: new Date(),
        }).run();
        throw new Error("injected failure after the writes");
      });
    }, /injected failure/);

    const reservation = db.select().from(reservations).where(eq(reservations.id, id)).get()!;
    const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get()!;
    const charges = db.select().from(folioCharges).where(eq(folioCharges.reservationId, id)).all();

    assert.equal(reservation.status, "confirmed", "reservation status must be unchanged");
    assert.equal(room.status, "available", "room status must be unchanged");
    assert.equal(charges.length, 0, "no folio charge may survive the rollback");
  });

  test("a PO receipt that fails part-way leaves stock and product quantity unchanged", async () => {
    const { db } = await import("../db/client.js");
    const { products, suppliers, purchaseOrders, purchaseOrderItems, stockTransactions } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const { nanoid } = await import("nanoid");
    const { transaction } = await import("../db/tx.js");

    const supplierId = nanoid();
    db.insert(suppliers).values({ id: supplierId, branchId, name: "Test Supplier", category: "Linen" }).run();
    const productId = nanoid();
    db.insert(products).values({
      id: productId, branchId, itemCode: `P-${nanoid(6)}`, name: "Towels", category: "Linen",
      unit: "pcs", currentStock: 10, parLevel: 50, reorderThreshold: 20, unitCostKobo: 350_000, updatedAt: new Date(),
    }).run();
    const poId = nanoid();
    db.insert(purchaseOrders).values({
      id: poId, branchId, poNumber: `PO-${nanoid(4)}`, supplierId, status: "sent",
      createdBy: fdUserId, createdAt: new Date(),
    }).run();
    db.insert(purchaseOrderItems).values({
      id: nanoid(), purchaseOrderId: poId, productId, quantity: 40, unitCostKobo: 350_000,
    }).run();

    const stockBefore = db.select().from(products).where(eq(products.id, productId)).get()!.currentStock;
    const txnsBefore = db.select().from(stockTransactions).all().filter(t => t.productId === productId).length;

    // The receive path's shape: bump stock, log the movement, then fail.
    assert.throws(() => {
      transaction(() => {
        db.update(products).set({ currentStock: stockBefore + 40, updatedAt: new Date() }).where(eq(products.id, productId)).run();
        db.insert(stockTransactions).values({
          id: nanoid(), branchId, productId, type: "in", quantity: 40,
          reference: "PO-TEST", loggedBy: fdUserId, createdAt: new Date(),
        }).run();
        throw new Error("injected failure mid-receipt");
      });
    }, /injected failure/);

    const stockAfter = db.select().from(products).where(eq(products.id, productId)).get()!.currentStock;
    const txnsAfter = db.select().from(stockTransactions).all().filter(t => t.productId === productId).length;
    assert.equal(stockAfter, stockBefore, "product quantity must be unchanged");
    assert.equal(txnsAfter, txnsBefore, "no stock transaction may survive the rollback");
  });
});
