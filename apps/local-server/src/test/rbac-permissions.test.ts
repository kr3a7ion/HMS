// Integration tests for the HR-03 permission engine (ROADMAP.md's "full
// RBAC rewrite" pass): a custom role's grants are enforced exactly, and
// editing a role's permissions invalidates every active session holding
// that role on its very next request -- the two things that make this a
// real permission system rather than a cosmetic settings screen.
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

async function loginAs(email: string, password = "correct-password") {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `login should succeed for ${email}`);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function createUser(role: string) {
  const { nanoid } = await import("nanoid");
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `rbac-test-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email, role,
    passwordHash: await hashPassword("correct-password"),
    firstName: "Test", lastName: "User", status: "active", createdAt: new Date(),
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
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: new Date(), currentBusinessDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) }).run();
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

test("ORG (wildcard \"*\") passes a permission-gated route a custom role would fail", async () => {
  const { email } = await createUser("ORG");
  const cookie = await loginAs(email);
  const res = await fetch(`${baseUrl}/hr/roles`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
});

test("a fixed role without the required permission gets a real 403, not a silent pass", async () => {
  // FD has no "roles:manage" grant.
  const { email } = await createUser("FD");
  const cookie = await loginAs(email);
  const res = await fetch(`${baseUrl}/hr/roles`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 403);
});

test("a custom role grants exactly what it was given -- nothing more, nothing less", async () => {
  const owner = await createUser("ORG");
  const ownerCookie = await loginAs(owner.email);

  const createRes = await fetch(`${baseUrl}/hr/roles`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Night Auditor Test", permissions: ["frontoffice:lostfound"] }),
  });
  assert.equal(createRes.status, 201);
  const { id: roleId } = await createRes.json() as { id: string };

  const staff = await createUser(roleId);
  const staffCookie = await loginAs(staff.email);

  // Granted permission: real 201, not blocked.
  const allowedRes = await fetch(`${baseUrl}/lost-found`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: staffCookie },
    body: JSON.stringify({ description: "Test item" }),
  });
  assert.equal(allowedRes.status, 201);

  // Not granted: real 403.
  const deniedRes = await fetch(`${baseUrl}/hr/roles`, { headers: { Cookie: staffCookie } });
  assert.equal(deniedRes.status, 403);
});

test("editing a role's permissions invalidates every active session holding that role immediately -- verified as a real consequence, not just a DB write", async () => {
  const owner = await createUser("ORG");
  const ownerCookie = await loginAs(owner.email);

  const createRes = await fetch(`${baseUrl}/hr/roles`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Session Invalidation Test Role", permissions: ["frontoffice:lostfound"] }),
  });
  const { id: roleId } = await createRes.json() as { id: string };

  const staff = await createUser(roleId);
  const staffCookie = await loginAs(staff.email);

  // Session works before the edit. (POST, not GET -- listing lost & found
  // items is open to any authenticated staff member; only creating/claiming/
  // disposing is gated behind "frontoffice:lostfound".)
  const before = await fetch(`${baseUrl}/lost-found`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: staffCookie },
    body: JSON.stringify({ description: "Before-edit item" }),
  });
  assert.equal(before.status, 201);

  // Owner revokes the permission entirely.
  const editRes = await fetch(`${baseUrl}/hr/roles/${roleId}/permissions`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ permissions: [] }),
  });
  assert.equal(editRes.status, 200);

  // The staff member's OLD token/session -- never re-issued -- is now
  // rejected outright, not just denied the specific permission. This is
  // the permissions_hash mismatch mechanism: the whole session dies, not
  // just the one route.
  const after = await fetch(`${baseUrl}/lost-found`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: staffCookie },
    body: JSON.stringify({ description: "After-edit item" }),
  });
  assert.equal(after.status, 401);
  const afterBody = await after.json() as { error: string };
  assert.equal(afterBody.error, "PERMISSIONS_CHANGED");

  // A fresh login reflects the real new (empty) permission set.
  const newCookie = await loginAs(staff.email);
  const freshAttempt = await fetch(`${baseUrl}/lost-found`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: newCookie },
    body: JSON.stringify({ description: "Fresh-login item" }),
  });
  assert.equal(freshAttempt.status, 403);
});

test("a role assignment rejects an id that doesn't exist in the real roles table", async () => {
  const owner = await createUser("ORG");
  const ownerCookie = await loginAs(owner.email);
  const staff = await createUser("FD");

  const res = await fetch(`${baseUrl}/admin/users/${staff.id}/role`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ role: "totally-made-up-role-id" }),
  });
  assert.equal(res.status, 400);
  const body = await res.json() as { error: string };
  assert.equal(body.error, "INVALID_ROLE");
});
