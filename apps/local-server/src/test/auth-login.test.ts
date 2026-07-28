// Integration tests for the branch staff login lifecycle (Auth doc Part
// 5.1/5.3): password verification, the 5-attempt/15-minute lockout, and
// that a deactivated or already-locked account is refused before password
// is even checked. Same infra pattern as offline-continue.test.ts -- a
// real HTTP server against a real temp SQLite DB, not mocked.
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

async function createUser(overrides: Partial<{ status: string; failedLoginAttempts: number; lockedUntil: Date | null; role: string }> = {}) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");

  const id = nanoid();
  const email = `login-test-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email,
    passwordHash: await hashPassword("correct-password"),
    role: overrides.role ?? "FD", firstName: "Test", lastName: "User",
    status: overrides.status ?? "active",
    failedLoginAttempts: overrides.failedLoginAttempts ?? 0,
    lockedUntil: overrides.lockedUntil ?? null,
    createdAt: new Date(),
  }).run();
  return { id, email };
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
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: new Date() }).run();
});

after(async () => {
  // server.close() alone waits forever for fetch()'s pooled keep-alive
  // sockets to close on their own -- closeAllConnections() forces them shut
  // so this resolves immediately. Without this, running multiple test files
  // in one process (as `npm test`'s glob does) hangs dead after the first
  // file, since node:test never gets past this file's after() hook.
  await new Promise<void>(resolve => {
    server.close(() => resolve());
    server.closeAllConnections();
  });
  const { sqlite } = await import("../db/client.js");
  sqlite.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
});

test("correct credentials issue a real session cookie", async () => {
  const { email } = await createUser();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("set-cookie")?.includes("access_token="));
  const body = await res.json() as { user: { email: string; role: string } };
  assert.equal(body.user.email, email);
  assert.equal(body.user.role, "FD");
});

test("wrong password is rejected and reports attempts remaining", async () => {
  const { email } = await createUser();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string; attemptsRemaining: number };
  assert.equal(body.error, "INVALID_CREDENTIALS");
  assert.equal(body.attemptsRemaining, 4);
});

test("unknown email gets the same generic error as a wrong password (no user enumeration)", async () => {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "nobody-here@example.com", password: "whatever" }),
  });
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "INVALID_CREDENTIALS");
});

test("5 wrong attempts locks the account for real, and a 6th attempt with the CORRECT password is still refused", async () => {
  const { email } = await createUser();
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "wrong-password" }),
    });
    assert.equal(res.status, 401);
  }
  // 5th failure crosses MAX_ATTEMPTS -> locks.
  const fifthRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "wrong-password" }),
  });
  assert.equal(fifthRes.status, 423);
  const fifthBody = await fifthRes.json() as { error: string; lockedUntil: string };
  assert.equal(fifthBody.error, "ACCOUNT_LOCKED");
  assert.ok(new Date(fifthBody.lockedUntil).getTime() > Date.now());

  // Correct password no longer matters while locked -- this is the real
  // guarantee a lockout is supposed to provide.
  const sixthRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(sixthRes.status, 423);
  const sixthBody = await sixthRes.json() as { error: string };
  assert.equal(sixthBody.error, "ACCOUNT_LOCKED");
});

test("a deactivated account is refused even with the correct password", async () => {
  const { email } = await createUser({ status: "deactivated" });
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 403);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "ACCOUNT_INACTIVE");
});

test("logout revokes the session -- a subsequent /me with the same cookie is refused", async () => {
  const { email } = await createUser();
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

  const meBeforeLogout = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meBeforeLogout.status, 200);

  const logoutRes = await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(logoutRes.status, 200);

  const meAfterLogout = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meAfterLogout.status, 401);
});

test("/me with no cookie at all is refused, not treated as anonymous", async () => {
  const res = await fetch(`${baseUrl}/auth/me`);
  assert.equal(res.status, 401);
});
