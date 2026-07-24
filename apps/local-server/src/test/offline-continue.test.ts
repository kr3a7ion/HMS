// Integration test for the offline-continue mechanic (Auth doc Part 5.2 /
// 7.1) — the one thing ROADMAP.md calls out as "must never regress
// silently" since it's the product's actual differentiator. Verifies the
// local server grants a grace-period extension using only the token's
// signature and the session table -- no external call of any kind, which
// is what "works with the internet down" actually reduces to technically.
//
// Run with: npm test  (from server/)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// NEXURA_DB_PATH must be set before app.js (and its db/client.js import) is
// evaluated, so this test never touches the real dev database. Static
// imports would run before any code in this file, so the app is imported
// dynamically, after the env var is set, inside before().
const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

let server: http.Server;
let baseUrl: string;
let userId: string;
let branchId: string;
let orgId: string;

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
  userId = nanoid();
  const now = new Date();

  db.insert(organizations).values({ id: orgId, name: "Test Org", createdAt: now }).run();
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: now }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId,
    email: "offline-test@example.com", passwordHash: await hashPassword("demo123"),
    role: "FD", firstName: "Test", lastName: "User", status: "active", createdAt: now,
  }).run();
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  // Windows won't allow deleting a file that's still open (unlike
  // POSIX, where unlinking an open file is fine) -- close the handle first.
  const { sqlite } = await import("../db/client.js");
  sqlite.close();
  fs.rmSync(testDbPath, { force: true });
  fs.rmSync(`${testDbPath}-wal`, { force: true });
  fs.rmSync(`${testDbPath}-shm`, { force: true });
});

async function makeExpiredToken(expiresInSeconds: number, opts: { revoked?: boolean } = {}) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { activeSessions } = await import("../db/schema.js");
  const { signAccessToken } = await import("../auth/tokens.js");
  const { permissionsHashForRole } = await import("../auth/permissions.js");

  const sessionId = nanoid();
  const now = new Date();
  db.insert(activeSessions).values({
    sessionId, userId, branchId,
    issuedAt: now, expiresAt: new Date(now.getTime() + expiresInSeconds * 1000),
    lastActiveAt: now, isOfflineMode: false,
    revokedAt: opts.revoked ? now : null,
    revokeReason: opts.revoked ? "manual" : null,
  }).run();

  const token = signAccessToken({
    sub: userId, role: "FD", org_id: orgId, branch_id: branchId,
    permissions_hash: permissionsHashForRole("FD"), session_id: sessionId,
  }, expiresInSeconds);

  return token;
}

test("continue-offline grants an extension for a token expired within the grace period", async () => {
  const token = await makeExpiredToken(-60 * 60); // expired 1h ago, 8h grace window
  const res = await fetch(`${baseUrl}/auth/continue-offline`, {
    method: "POST",
    headers: { Cookie: `access_token=${token}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { offlineExtension: boolean };
  assert.equal(body.offlineExtension, true);
  assert.ok(res.headers.get("set-cookie")?.includes("access_token="), "should issue a new extension token cookie");
});

test("continue-offline refuses a token expired beyond the grace period", async () => {
  const token = await makeExpiredToken(-9 * 60 * 60); // expired 9h ago, grace period is 8h
  const res = await fetch(`${baseUrl}/auth/continue-offline`, {
    method: "POST",
    headers: { Cookie: `access_token=${token}` },
  });
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "GRACE_PERIOD_EXPIRED");
});

test("continue-offline refuses a revoked session even within the grace window", async () => {
  const token = await makeExpiredToken(-60 * 60, { revoked: true });
  const res = await fetch(`${baseUrl}/auth/continue-offline`, {
    method: "POST",
    headers: { Cookie: `access_token=${token}` },
  });
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "SESSION_REVOKED");
});

test("continue-offline never makes it into the app without a token at all", async () => {
  const res = await fetch(`${baseUrl}/auth/continue-offline`, { method: "POST" });
  assert.equal(res.status, 401);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "NO_TOKEN");
});
