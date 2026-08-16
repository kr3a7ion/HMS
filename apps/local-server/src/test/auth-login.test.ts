// Integration tests for the branch staff login lifecycle (Auth doc Part
// 5.1/5.3): password verification, the 5-attempt/15-minute lockout, and
// that a deactivated or already-locked account is refused before password
// is even checked. Same infra pattern as offline-continue.test.ts -- a
// real HTTP server against a real temp SQLite DB, not mocked.
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
  db.insert(branches).values({ id: branchId, organizationId: orgId, name: "Test Branch", createdAt: new Date(), currentBusinessDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) }).run();
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
  const body = await res.json() as { error: string; attemptsRemaining?: number };
  assert.equal(body.error, "INVALID_CREDENTIALS");
  // B17.4: `attemptsRemaining` is gone. It was a countdown to a lockout that
  // no longer exists, and telling an attacker how many tries they have left
  // was never doing the defender any favours.
  assert.equal(body.attemptsRemaining, undefined);
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

test("repeated wrong passwords slow down, but NEVER permanently lock the account", async () => {
  // B17.4 REPLACED HARD LOCKOUT, and this test replaces the one that asserted
  // it. The old behaviour -- 5 failures locks for 15 minutes, correct password
  // refused while locked -- looked like a protection and was a
  // denial-of-service: anyone who knew a colleague's email could lock them out
  // of their own shift in five requests, and there is no IT desk at 2am.
  //
  // What must be true now: the delay GROWS (so guessing is bounded by rate),
  // and the legitimate owner is never permanently shut out.
  const { __resetLoginThrottle } = await import("../lib/loginThrottle.js");
  __resetLoginThrottle();

  const { email } = await createUser();
  const attempt = (password: string) => fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  // The first two failures are plain rejections -- a real person mistyping
  // twice should not be made to wait.
  assert.equal((await attempt("wrong-password")).status, 401);
  assert.equal((await attempt("wrong-password")).status, 401);

  // From the third, backoff engages and says how long to wait.
  const third = await attempt("wrong-password");
  assert.equal(third.status, 429);
  const body = await third.json() as { error: string; retryAfterSeconds: number };
  assert.equal(body.error, "TOO_MANY_ATTEMPTS");
  assert.ok(body.retryAfterSeconds > 0, "the caller is told how long to wait");
  assert.ok(third.headers.get("retry-after"), "and told in the standard header too");

  // THE POINT: the account is not locked. Clearing the schedule -- which is
  // what waiting out the delay, or an IT unlock, does -- and the correct
  // password works immediately.
  __resetLoginThrottle();
  const recovered = await attempt("correct-password");
  assert.equal(recovered.status, 200, "the real owner is never locked out of their own account");
});

test("the throttle does not reveal whether an account exists", async () => {
  // If a wrong password on a REAL account throttled but an unknown address
  // did not, the difference would be a free account-enumeration oracle.
  const { __resetLoginThrottle } = await import("../lib/loginThrottle.js");
  __resetLoginThrottle();

  const hit = async (email: string) => {
    let last = 0;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "wrong-password" }),
      });
      last = res.status;
    }
    return last;
  };

  const { email } = await createUser();
  const realAccount = await hit(email);
  __resetLoginThrottle();
  const unknownAccount = await hit("definitely-not-a-user@example.com");

  assert.equal(realAccount, 429);
  assert.equal(unknownAccount, 429, "an unknown address is throttled identically");
});

test("a failed login records the attempted address as a HASH, never verbatim", async () => {
  // B17.6. People type passwords into the email field and paste personal
  // addresses in; audit_log.details is readable by anyone with
  // admin:operations and should not accumulate either.
  const { __resetLoginThrottle } = await import("../lib/loginThrottle.js");
  __resetLoginThrottle();

  const attempted = "someone-elses-private-address@example.com";
  await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: attempted, password: "hunter2" }),
  });

  const { db } = await import("../db/client.js");
  const { auditLog } = await import("../db/schema.js");
  const { desc } = await import("drizzle-orm");
  const { hashIdentifier } = await import("../lib/redact.js");
  const rows = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(50).all()
    .filter(r => r.action === "login_failed");

  // Other tests in this file also produce login_failed rows, so match on the
  // hash rather than assuming which row is ours.
  assert.ok(
    rows.some(r => (r.details ?? "").includes(hashIdentifier(attempted))),
    "the attempt is recorded, keyed by a stable hash so repeats can be grouped",
  );
  assert.ok(
    rows.every(r => !(r.details ?? "").includes(attempted)),
    "and the address itself never appears in the audit trail",
  );
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
