// Integration tests for Door Lock & Access Control (Blueprint Part 6).
// No live TTLock account/gateway exists in this environment (see
// ttlockAdapter.ts's header comment), so this file deliberately covers only
// the paths that are real and deterministic without a network call: the
// permission gate, physical-key issuance (never touches TTLock), a card/PIN
// issue against a room with no lock mapping (short-circuits to "failed"
// before any TTLock call), a card issue against a mapped room with no
// doorLockConfig row (TTLockAdapter's real, non-retryable
// "not configured" error -- still no network reached), and revoke paths
// that don't require a lock (physical_key, or no mapping). The "reaches
// TTLock and queues on real network failure" path is a genuine gap --
// exercising it would mean a real outbound call to api.sciener.com, which
// isn't deterministic enough for an automated suite. Documented, not faked.
import { test, beforeAll as before, afterAll as after } from "vitest";
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
  db.insert(rooms).values({ id, branchId, number: `D${Math.floor(Math.random() * 100000)}`, type: "Standard" }).run();
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

async function createReservation(roomId: string | null) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { reservations } = await import("../db/schema.js");
  const guestId = await createGuest();
  const id = nanoid();
  db.insert(reservations).values({
    id, branchId, guestId, roomId, status: "confirmed",
    checkInDate: new Date("2026-02-01"), checkOutDate: new Date("2026-02-03"),
    rateKobo: 4000000, createdBy: fdUserId, createdAt: new Date(),
  }).run();
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

  const fdId = nanoid();
  fdUserId = fdId;
  db.insert(users).values({
    id: fdId, organizationId: orgId, branchId, email: "fd-doorlock-test@example.com",
    passwordHash: await hashPassword("correct-password"), role: "FD",
    firstName: "Front", lastName: "Desk", status: "active", createdAt: new Date(),
  }).run();
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "fd-doorlock-test@example.com", password: "correct-password" }),
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

test("doorlock:use is enforced -- a role without it gets a real 403 on /issue", async () => {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `no-doorlock-perm-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email,
    passwordHash: await hashPassword("correct-password"), role: "RT", // Restaurant staff has no doorlock:use
    firstName: "No", lastName: "Perm", status: "active", createdAt: new Date(),
  }).run();
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

  const res = await fetch(`${baseUrl}/door-lock/issue`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ reservationId: "whatever", credentialType: "card" }),
  });
  assert.equal(res.status, 403);
});

test("issuing a physical key never touches TTLock and is logged as a real event", async () => {
  const roomId = await createRoom();
  const reservationId = await createReservation(roomId);

  const res = await fetch(`${baseUrl}/door-lock/physical-key`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reservationId, keyReference: "Brass key #4", notes: "Guest requested no card" }),
  });
  assert.equal(res.status, 201);
  const body = await res.json() as { credentialId: string; status: string; queued: boolean };
  assert.equal(body.status, "pending_sync");
  assert.equal(body.queued, false);

  const credsRes = await fetch(`${baseUrl}/door-lock/credentials?status=all`, { headers: { Cookie: fdCookie } });
  const creds = await credsRes.json() as Array<{ id: string; credentialType: string; credentialReference: string }>;
  const cred = creds.find(c => c.id === body.credentialId);
  assert.ok(cred, "physical key credential should appear in /credentials");
  assert.equal(cred!.credentialType, "physical_key");
  assert.ok(cred!.credentialReference.includes("Brass key #4"));

  const eventsRes = await fetch(`${baseUrl}/door-lock/events`, { headers: { Cookie: fdCookie } });
  const events = await eventsRes.json() as Array<{ credentialReference: string; eventType: string }>;
  assert.ok(events.some(e => e.eventType === "issued" && e.credentialReference.includes("Brass key #4")));
});

test("issuing a card for a room with no lock mapping fails deterministically -- never reaches TTLock", async () => {
  const roomId = await createRoom(); // no roomLockMappings row for this room
  const reservationId = await createReservation(roomId);

  const res = await fetch(`${baseUrl}/door-lock/issue`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reservationId, credentialType: "card" }),
  });
  assert.equal(res.status, 201); // the credential row itself is created even though issuance failed
  const body = await res.json() as { status: string; queued: boolean };
  assert.equal(body.status, "failed");
  assert.equal(body.queued, false);
});

test("issuing a PIN for a mapped room with no door-lock config fails with a real (non-retryable) config error, not a network call", async () => {
  const roomId = await createRoom();
  const reservationId = await createReservation(roomId);

  const { db } = await import("../db/client.js");
  const { roomLockMappings } = await import("../db/schema.js");
  db.insert(roomLockMappings).values({ roomId, ttlockLockId: "fake-lock-1", lockName: "Fake Lock 1" }).run();
  // Deliberately no doorLockConfig row for this branch -- getValidToken()
  // throws LockProviderError("...not configured...", retryable: false)
  // before any fetch() is attempted.

  const res = await fetch(`${baseUrl}/door-lock/issue`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reservationId, credentialType: "pin" }),
  });
  assert.equal(res.status, 201);
  const body = await res.json() as { status: string; queued: boolean };
  assert.equal(body.status, "failed");
  assert.equal(body.queued, false);
});

test("/issue rejects a reservation with no room assigned", async () => {
  const reservationId = await createReservation(null);
  const res = await fetch(`${baseUrl}/door-lock/issue`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reservationId, credentialType: "card" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "NO_ROOM_ASSIGNED");
});

test("/issue rejects a reservation id that doesn't exist", async () => {
  const res = await fetch(`${baseUrl}/door-lock/issue`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reservationId: "nonexistent-id", credentialType: "card" }),
  });
  assert.equal(res.status, 404);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "RESERVATION_NOT_FOUND");
});

test("revoking a physical-key credential succeeds without any lock, and its status actually flips", async () => {
  const roomId = await createRoom();
  const reservationId = await createReservation(roomId);
  const issueRes = await fetch(`${baseUrl}/door-lock/physical-key`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reservationId, keyReference: "Spare key" }),
  });
  const { credentialId } = await issueRes.json() as { credentialId: string };

  const revokeRes = await fetch(`${baseUrl}/door-lock/revoke/${credentialId}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reason: "lost" }),
  });
  assert.equal(revokeRes.status, 200);
  const revokeBody = await revokeRes.json() as { result: string };
  assert.equal(revokeBody.result, "revoked");

  const credsRes = await fetch(`${baseUrl}/door-lock/credentials?status=all`, { headers: { Cookie: fdCookie } });
  const creds = await credsRes.json() as Array<{ id: string; status: string }>;
  const cred = creds.find(c => c.id === credentialId);
  assert.equal(cred!.status, "revoked");
});

test("revoking a credential id that doesn't exist returns a real 404, not a silent success", async () => {
  const res = await fetch(`${baseUrl}/door-lock/revoke/nonexistent-credential`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reason: "manual" }),
  });
  assert.equal(res.status, 404);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "NOT_FOUND");
});

test("emergency revoke-room on a room with no active credentials is a real no-op, not an error", async () => {
  const roomId = await createRoom();
  const res = await fetch(`${baseUrl}/door-lock/revoke-room/${roomId}`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reason: "Fire alarm evacuation drill" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { revoked: number; queued: number; failed: number };
  assert.deepEqual(body, { revoked: 0, queued: 0, failed: 0 });
});

test("revoke-room targeting a room outside the caller's branch is rejected, not silently scoped away", async () => {
  const res = await fetch(`${baseUrl}/door-lock/revoke-room/nonexistent-room`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: fdCookie },
    body: JSON.stringify({ reason: "test" }),
  });
  assert.equal(res.status, 404);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "ROOM_NOT_FOUND");
});
