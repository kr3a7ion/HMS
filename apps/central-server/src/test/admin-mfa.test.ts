// Integration tests for the Platform Owner login flow (Auth doc Part 3.5:
// "Multi-factor authentication (TOTP) -- mandatory, no bypass" and "5
// attempts, then 15-minute lockout"). Same infra pattern as the local
// server's tests -- a real HTTP server against a real temp SQLite DB, and
// real RFC 6238 TOTP codes generated via generateTotp(), not hand-typed
// guesses -- so what's verified is the actual enrollment/verify logic, not
// a stand-in for it.
import { test, beforeAll as before, afterAll as after } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const testDbPath = path.join(os.tmpdir(), `nexura-central-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_CENTRAL_DB_PATH = testDbPath;

let server: http.Server;
let baseUrl: string;

function cookieFrom(res: Response, name: string): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error(`No set-cookie header on response (expected ${name})`);
  const match = raw.split(",").map(c => c.trim()).find(c => c.startsWith(`${name}=`));
  if (!match) throw new Error(`Cookie ${name} not found in: ${raw}`);
  return match.split(";")[0];
}

async function createAdmin(email: string) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { adminUsers } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  db.insert(adminUsers).values({
    id, email, passwordHash: await hashPassword("correct-password"),
    firstName: "Test", lastName: "Owner", createdAt: new Date(),
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

test("password alone never grants a session -- login returns mfaRequired, not a real token", async () => {
  const email = "mfa-flow-1@example.com";
  await createAdmin(email);
  const res = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { mfaRequired: boolean; setupRequired: boolean };
  assert.equal(body.mfaRequired, true);
  assert.equal(body.setupRequired, true); // never enrolled yet
  assert.ok(res.headers.get("set-cookie")?.includes("central_mfa_pending_token="));
  assert.ok(!res.headers.get("set-cookie")?.includes("central_access_token="));
});

test("full enrollment: start -> wrong code rejected -> real TOTP code accepted -> real session issued", async () => {
  const email = "mfa-flow-2@example.com";
  await createAdmin(email);
  const { generateTotp } = await import("../auth/totp.js");

  const loginRes = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  const pendingCookie = cookieFrom(loginRes, "central_mfa_pending_token");

  const startRes = await fetch(`${baseUrl}/auth/admin/mfa/enroll/start`, {
    method: "POST", headers: { Cookie: pendingCookie },
  });
  assert.equal(startRes.status, 200);
  const { secret } = await startRes.json() as { secret: string; otpauthUrl: string };
  assert.ok(secret.length > 0);

  const wrongRes = await fetch(`${baseUrl}/auth/admin/mfa/enroll/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: pendingCookie },
    body: JSON.stringify({ code: "000000" }),
  });
  assert.equal(wrongRes.status, 401);
  const wrongBody = await wrongRes.json() as { error: string };
  assert.equal(wrongBody.error, "INVALID_CODE");

  const realCode = generateTotp(secret);
  const confirmRes = await fetch(`${baseUrl}/auth/admin/mfa/enroll/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: pendingCookie },
    body: JSON.stringify({ code: realCode }),
  });
  assert.equal(confirmRes.status, 200);
  const confirmBody = await confirmRes.json() as { user: { email: string }; ipRangeWarning: boolean };
  assert.equal(confirmBody.user.email, email);
  const accessCookie = cookieFrom(confirmRes, "central_access_token");

  const meRes = await fetch(`${baseUrl}/auth/admin/me`, { headers: { Cookie: accessCookie } });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json() as { email: string };
  assert.equal(meBody.email, email);
});

test("a subsequent login on an already-enrolled admin requires TOTP verify, not re-enrollment", async () => {
  const email = "mfa-flow-3@example.com";
  await createAdmin(email);
  const { generateTotp } = await import("../auth/totp.js");

  // Enroll first.
  const firstLogin = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  const firstPending = cookieFrom(firstLogin, "central_mfa_pending_token");
  const startRes = await fetch(`${baseUrl}/auth/admin/mfa/enroll/start`, { method: "POST", headers: { Cookie: firstPending } });
  const { secret } = await startRes.json() as { secret: string };
  await fetch(`${baseUrl}/auth/admin/mfa/enroll/confirm`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: firstPending },
    body: JSON.stringify({ code: generateTotp(secret) }),
  });

  // Second, real login.
  const secondLogin = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  const secondBody = await secondLogin.json() as { mfaRequired: boolean; setupRequired: boolean };
  assert.equal(secondBody.mfaRequired, true);
  assert.equal(secondBody.setupRequired, false); // already enrolled

  const secondPending = cookieFrom(secondLogin, "central_mfa_pending_token");
  // enroll/start must refuse -- already enrolled, no re-enrollment via this path.
  const reEnrollRes = await fetch(`${baseUrl}/auth/admin/mfa/enroll/start`, { method: "POST", headers: { Cookie: secondPending } });
  assert.equal(reEnrollRes.status, 400);
  const reEnrollBody = await reEnrollRes.json() as { error: string };
  assert.equal(reEnrollBody.error, "ALREADY_ENROLLED");

  const verifyRes = await fetch(`${baseUrl}/auth/admin/mfa/verify`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: secondPending },
    body: JSON.stringify({ code: generateTotp(secret) }),
  });
  assert.equal(verifyRes.status, 200);
  assert.ok(verifyRes.headers.get("set-cookie")?.includes("central_access_token="));
});

test("5 wrong passwords locks the account for real -- a 6th attempt with the CORRECT password is still refused", async () => {
  const email = "mfa-lockout@example.com";
  await createAdmin(email);
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${baseUrl}/auth/admin/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    assert.equal(res.status, 401);
  }
  const fifthRes = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(fifthRes.status, 401); // 5th failure itself is still a normal rejection...

  // ...but it crossed the threshold, so the 6th attempt -- even with the
  // correct password -- is locked out.
  const sixthRes = await fetch(`${baseUrl}/auth/admin/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(sixthRes.status, 429);
  const sixthBody = await sixthRes.json() as { error: string; lockedUntil: string };
  assert.equal(sixthBody.error, "LOCKED_OUT");
  assert.ok(new Date(sixthBody.lockedUntil).getTime() > Date.now());
});

test("enrollment endpoints refuse a request with no MFA-pending token at all", async () => {
  const res = await fetch(`${baseUrl}/auth/admin/mfa/enroll/start`, { method: "POST" });
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "NO_TOKEN");
});

test("/auth/admin/me refuses a request with no session token", async () => {
  const res = await fetch(`${baseUrl}/auth/admin/me`);
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "NO_TOKEN");
});
