// Integration tests for the highest-consequence path in the app: R-02 ->
// FD-01 check-in -> FD-10 folio charges -> FD-02 check-out. Real money and
// real room-state transitions, so this is exactly the kind of thing that
// must never regress silently. Verifies the two real safety gates
// (Blueprint FD-01 step 3's "room must be clean" and FD-02's "can't check
// out with a balance") actually block, not just that the happy path works.
import { test, before, after } from "node:test";
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

async function createRoom(overrides: Partial<{ status: string; housekeepingStatus: string }> = {}) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(rooms).values({
    id, branchId, number: `T${Math.floor(Math.random() * 100000)}`, type: "Standard",
    ...(overrides.status ? { status: overrides.status } : {}),
    ...(overrides.housekeepingStatus ? { housekeepingStatus: overrides.housekeepingStatus } : {}),
  }).run();
  return id;
}

async function createGuest() {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { guests } = await import("../db/schema.js");
  const id = nanoid();
  db.insert(guests).values({ id, branchId, firstName: "Test", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
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
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: new Date() }).run();

  const fdId = nanoid();
  db.insert(users).values({
    id: fdId, organizationId: orgId, branchId, email: "fd-lifecycle-test@example.com",
    passwordHash: await hashPassword("correct-password"), role: "FD",
    firstName: "Front", lastName: "Desk", status: "active", createdAt: new Date(),
  }).run();
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "fd-lifecycle-test@example.com", password: "correct-password" }),
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

test("full lifecycle: create -> check-in -> post charge -> check-out", async () => {
  const roomId = await createRoom(); // defaults: available + clean
  const guestId = await createGuest();

  const createRes = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ guestId, roomId, checkInDate: "2026-01-01", checkOutDate: "2026-01-03", rate: 50000 }),
  });
  assert.equal(createRes.status, 201);
  const reservation = await createRes.json() as { id: string; status: string };
  assert.equal(reservation.status, "confirmed");

  const checkInRes = await fetch(`${baseUrl}/reservations/${reservation.id}/check-in`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie }, body: "{}",
  });
  assert.equal(checkInRes.status, 200);
  const checkedIn = await checkInRes.json() as { status: string };
  assert.equal(checkedIn.status, "checked_in");

  // Check-in auto-posts the room-rate line item -- 2 nights * 50000, so the
  // balance is already non-zero before any manual charge.
  const detailRes = await fetch(`${baseUrl}/reservations/${reservation.id}`, { headers: { Cookie: fdCookie } });
  const detail = await detailRes.json() as { folio: { balance: number } };
  assert.equal(detail.folio.balance, 100000);

  const chargeRes = await fetch(`${baseUrl}/reservations/${reservation.id}/folio/charges`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ category: "Minibar", description: "Water x2", unitPrice: 2000 }),
  });
  assert.equal(chargeRes.status, 201);
  const afterCharge = await chargeRes.json() as { balance: number };
  assert.equal(afterCharge.balance, 102000);

  // Can't check out with a balance outstanding.
  const shortCheckoutRes = await fetch(`${baseUrl}/reservations/${reservation.id}/check-out`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ paymentAmount: 50000, paymentMethod: "cash" }),
  });
  assert.equal(shortCheckoutRes.status, 409);
  const shortBody = await shortCheckoutRes.json() as { error: string; balance: number };
  assert.equal(shortBody.error, "BALANCE_REMAINING");
  assert.equal(shortBody.balance, 52000);

  // Full settlement succeeds and releases the room to Housekeeping.
  const fullCheckoutRes = await fetch(`${baseUrl}/reservations/${reservation.id}/check-out`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ paymentAmount: 52000, paymentMethod: "cash" }),
  });
  assert.equal(fullCheckoutRes.status, 200);
  const checkedOut = await fullCheckoutRes.json() as { status: string; folio: { balance: number } };
  assert.equal(checkedOut.status, "checked_out");
  assert.equal(checkedOut.folio.balance, 0);

  const { db } = await import("../db/client.js");
  const { rooms } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");
  const room = db.select().from(rooms).where(eq(rooms.id, roomId)).get()!;
  assert.equal(room.status, "cleaning");
  assert.equal(room.housekeepingStatus, "dirty");
});

test("check-in is refused for a real reason (room not clean), not silently allowed", async () => {
  const roomId = await createRoom({ housekeepingStatus: "dirty" });
  const guestId = await createGuest();

  const createRes = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ guestId, roomId, checkInDate: "2026-01-01", checkOutDate: "2026-01-02", rate: 30000 }),
  });
  const reservation = await createRes.json() as { id: string };

  const checkInRes = await fetch(`${baseUrl}/reservations/${reservation.id}/check-in`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie }, body: "{}",
  });
  assert.equal(checkInRes.status, 409);
  const body = await checkInRes.json() as { error: string; housekeepingStatus: string };
  assert.equal(body.error, "ROOM_NOT_CLEAN");
  assert.equal(body.housekeepingStatus, "dirty");
});

test("overlapping reservations on the same room are rejected with the conflicting reservation id", async () => {
  const roomId = await createRoom();
  const guestA = await createGuest();
  const guestB = await createGuest();

  const firstRes = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ guestId: guestA, roomId, checkInDate: "2026-03-01", checkOutDate: "2026-03-05", rate: 40000 }),
  });
  const first = await firstRes.json() as { id: string };
  assert.equal(firstRes.status, 201);

  const overlapRes = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ guestId: guestB, roomId, checkInDate: "2026-03-03", checkOutDate: "2026-03-07", rate: 40000 }),
  });
  assert.equal(overlapRes.status, 409);
  const body = await overlapRes.json() as { error: string; conflictingReservationId: string };
  assert.equal(body.error, "ROOM_CONFLICT");
  assert.equal(body.conflictingReservationId, first.id);
});

test("reservations:create is enforced -- a role without it gets a real 403", async () => {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email: `no-perm-${id}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("correct-password"), role: "HK", // Housekeeping has no reservations:create
    firstName: "No", lastName: "Perm", status: "active", createdAt: new Date(),
  }).run();
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `no-perm-${id}@example.com`, password: "correct-password" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

  const roomId = await createRoom();
  const guestId = await createGuest();
  const res = await fetch(`${baseUrl}/reservations`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ guestId, roomId, checkInDate: "2026-04-01", checkOutDate: "2026-04-02", rate: 30000 }),
  });
  assert.equal(res.status, 403);
});
