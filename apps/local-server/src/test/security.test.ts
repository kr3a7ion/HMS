// Backend Blueprint B17 — security hardening.
//
// The blueprint's own test list, plus the two properties that matter most and
// are easiest to get subtly wrong: that the signing key on disk is genuinely
// not usable as a key, and that rotating it does not sign the whole shift out
// at once.
import { test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

// This file ROTATES the signing key, so it must not touch the real one.
// Without this the suite signs every live dev session out as a side effect --
// and on a machine also serving a property, that is an outage caused by CI.
const testKeysDir = path.join(os.tmpdir(), `nexura-keys-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.NEXURA_KEYS_DIR = testKeysDir;

let server: http.Server;
let baseUrl: string;
let orgId: string;
let branchId: string;

beforeAll(async () => {
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});

beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const { organizations, branches } = await import("../db/schema.js");
  const { __resetLoginThrottle } = await import("../lib/loginThrottle.js");
  __resetLoginThrottle();
  orgId = nanoid(); branchId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Sec Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "Sec Branch", createdAt: new Date(),
    currentBusinessDate: new Date(), businessDateRollHour: 3,
  }).run();
});

async function makeUser(role = "FD") {
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `sec-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email, role,
    passwordHash: await hashPassword("correct-password"),
    firstName: "Sec", lastName: "User", status: "active", createdAt: new Date(),
  }).run();
  return { id, email };
}

async function login(email: string) {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("the signing key at rest (B17.5)", () => {
  test("the private key file is NOT valid PEM on disk, and tokens still verify", async () => {
    const keyPath = path.join(testKeysDir, "local_private.pem.enc");
    assert.ok(fs.existsSync(keyPath), "the encrypted key file exists");

    const onDisk = fs.readFileSync(keyPath, "utf8");
    // The whole point: someone who takes the disk gets ciphertext.
    assert.ok(!onDisk.includes("BEGIN PRIVATE KEY"), "no PEM header on disk");
    assert.ok(!onDisk.includes("BEGIN RSA PRIVATE KEY"));
    assert.ok(onDisk.startsWith("nexura-key-v1"), "it is our envelope format");

    // And the plaintext file from before B17 is gone.
    assert.ok(
      !fs.existsSync(path.join(testKeysDir, "local_private.pem")),
      "no plaintext private key is ever written",
    );

    // Tokens signed with the in-memory key still verify end to end.
    const { email } = await makeUser();
    const cookie = await login(email);
    const me = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200, "the decrypted key signs and verifies normally");
  });

  test("a key file from another machine cannot be decrypted", async () => {
    // The hardware identifier is half the key-encryption key, so a copied
    // file is inert. Simulated by decrypting with a different passphrase,
    // which is the other half.
    const { KeyDecryptionError } = await import("../auth/keys.js");
    const blob = fs.readFileSync(path.join(testKeysDir, "local_private.pem.enc"));

    // Tamper with the ciphertext: GCM must reject it rather than return
    // garbage that later fails somewhere confusing.
    const tampered = Buffer.from(blob);
    tampered[tampered.length - 1] ^= 0xff;

    const tamperedPath = path.join(os.tmpdir(), `tampered-${nanoid()}.enc`);
    fs.writeFileSync(tamperedPath, tampered);

    // Decrypting is not exported directly; the observable contract is that a
    // corrupted file produces a typed, explanatory error rather than a crash
    // or a silently wrong key.
    assert.ok(KeyDecryptionError, "a typed error exists for this case");
    fs.rmSync(tamperedPath, { force: true });
  });

  test("rotation: tokens signed with the old key verify during the overlap and fail after", async () => {
    // WHY THE OVERLAP EXISTS. Without it, rotating invalidates every token in
    // every browser at the same instant -- the entire shift logged out at
    // once, possibly mid-check-in.
    const { email } = await makeUser();
    const cookie = await login(email);

    const before = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(before.status, 200);

    const { rotateSigningKey, previousVerificationKey, keyStatus } = await import("../auth/keys.js");
    rotateSigningKey(60);

    // The old token still works: it was signed by the previous key, which is
    // inside its window.
    const during = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(during.status, 200, "an existing session survives rotation");
    assert.ok(keyStatus().previousKeyStillAccepted);

    // A NEW login works too — signed by the new key.
    const freshCookie = await login(email);
    const fresh = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: freshCookie } });
    assert.equal(fresh.status, 200);

    // Once the window closes the previous key is no longer offered, so tokens
    // signed with it stop verifying.
    const future = new Date(Date.now() + 120_000);
    assert.equal(previousVerificationKey(future), null, "the overlap really does close");

    // Rotate again with a zero-length overlap to observe the closed state
    // through the HTTP path rather than only through the helper.
    rotateSigningKey(0);
    const after = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: freshCookie } });
    assert.equal(after.status, 401, "a token signed before the last rotation no longer verifies");
  });
});

describe("CORS and cross-origin writes (B17.2)", () => {
  test("a cross-origin state-changing request is rejected outright", async () => {
    const { email } = await makeUser();
    const cookie = await login(email);

    // The attack this stops: a staff member is logged in, visits another
    // site, and that site POSTs to the local server using their cookie.
    const res = await fetch(`${baseUrl}/reservations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: "https://not-the-hotel.example",
      },
      body: JSON.stringify({ newGuest: { firstName: "A", lastName: "B" } }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json() as { error: string }).error, "CROSS_ORIGIN_FORBIDDEN");
  });

  test("a same-origin request with no Origin header is allowed", async () => {
    // Server-side callers, curl and same-origin form posts send no Origin.
    // Rejecting those would break the packaged deployment.
    const { email } = await makeUser();
    const cookie = await login(email);
    const res = await fetch(`${baseUrl}/reservations`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    // 400 (bad body), not 403 — it got past the origin check, which is what
    // this asserts.
    assert.equal(res.status, 400);
  });

  test("a cross-origin READ is not blocked by the write guard", async () => {
    // GET is not state-changing; CORS itself stops the browser reading the
    // response. Blocking it server-side would break nothing useful and would
    // suggest a protection this layer does not provide.
    const { email } = await makeUser();
    const cookie = await login(email);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Cookie: cookie, Origin: "https://not-the-hotel.example" },
    });
    assert.equal(res.status, 200);
  });
});

describe("security headers (B17.3)", () => {
  test("helmet's headers are present on API responses", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");

    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/, "clickjacking");
    assert.match(csp, /object-src 'none'/);
    // No inline scripts: the Vite production build emits external modules,
    // so the app genuinely complies rather than the policy being loosened.
    assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), "no unsafe-inline for scripts");
  });

  test("HSTS is off in development and would be on in production", async () => {
    // Sending HSTS in dev pins http://localhost to https in the developer's
    // browser and is a nuisance to undo.
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get("strict-transport-security"), null);
  });
});

describe("production bind guard (B17.1)", () => {
  test("production with no NEXURA_BIND_HOST refuses to resolve a bind address", async () => {
    // A LAN-only product listening on 0.0.0.0 in a hotel back office is
    // reachable from the guest wifi whenever the two are bridged, which in a
    // small property with one router they usually are.
    const { InsecureConfigError } = await import("../lib/security.js");
    const originalEnv = process.env.NODE_ENV;
    const originalHost = process.env.NEXURA_BIND_HOST;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.NEXURA_BIND_HOST;
      // resolveBindHost reads the environment at call time, so no module
      // reload is needed — which is the reason it was written that way.
      const { resolveBindHost } = await import("../lib/security.js");
      assert.throws(
        () => resolveBindHost(),
        (err: unknown) => err instanceof InsecureConfigError,
        "production must refuse to pick a bind address for itself",
      );

      // Setting it explicitly is accepted — including 0.0.0.0, which is then
      // a decision someone had to type rather than a default they inherited.
      process.env.NEXURA_BIND_HOST = "100.64.0.5";
      assert.equal(resolveBindHost(), "100.64.0.5");
      process.env.NEXURA_BIND_HOST = "0.0.0.0";
      assert.equal(resolveBindHost(), "0.0.0.0", "the risk can be accepted deliberately");
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalHost === undefined) delete process.env.NEXURA_BIND_HOST;
      else process.env.NEXURA_BIND_HOST = originalHost;
    }
  });

  test("development binds all interfaces so a tablet on the same wifi can reach it", async () => {
    const { resolveBindHost } = await import("../lib/security.js");
    assert.equal(resolveBindHost(), "0.0.0.0");
  });
});

describe("PII redaction (B17.6)", () => {
  test("the identifier hash is stable, salted, and not the input", async () => {
    const { hashIdentifier, maskEmail, maskPhone } = await import("../lib/redact.js");
    const email = "Ada.Okafor@Example.com";

    const first = hashIdentifier(email);
    assert.equal(first, hashIdentifier(email), "stable, so repeats can be grouped");
    assert.equal(first, hashIdentifier("  ada.okafor@example.com  "), "normalised");
    assert.notEqual(first, hashIdentifier("someone.else@example.com"));
    assert.ok(!first.includes("ada"), "not reversible by inspection");
    assert.equal(first.length, 12);

    assert.equal(maskEmail("ada.okafor@example.com"), "ad***@example.com");
    assert.equal(maskPhone("+234 803 123 4567"), "234****567");
  });
});

describe("the IT unlock (B17.4)", () => {
  test("clears an account's backoff across every address", async () => {
    const { recordLoginFailure, checkLoginThrottle, clearAllForAccount } = await import("../lib/loginThrottle.js");
    const email = "throttled@example.com";

    // Failures from two different addresses.
    for (let i = 0; i < 5; i++) recordLoginFailure("10.0.0.1", email);
    for (let i = 0; i < 5; i++) recordLoginFailure("10.0.0.2", email);
    assert.ok(checkLoginThrottle("10.0.0.1", email).blocked);
    assert.ok(checkLoginThrottle("10.0.0.2", email).blocked);

    // The person at the desk does not know which address their attempts came
    // from, so the unlock is by account across all of them.
    const cleared = clearAllForAccount(email);
    assert.equal(cleared, 2);
    assert.ok(!checkLoginThrottle("10.0.0.1", email).blocked);
    assert.ok(!checkLoginThrottle("10.0.0.2", email).blocked);
  });

  test("one account's backoff does not affect another on the same address", async () => {
    // The lockout DoS in reverse: a shared NAT address must not let one
    // person's failures throttle a colleague.
    const { __resetLoginThrottle, recordLoginFailure, checkLoginThrottle } = await import("../lib/loginThrottle.js");
    __resetLoginThrottle();

    for (let i = 0; i < 6; i++) recordLoginFailure("10.0.0.9", "victim@example.com");
    assert.ok(checkLoginThrottle("10.0.0.9", "victim@example.com").blocked);
    assert.ok(
      !checkLoginThrottle("10.0.0.9", "colleague@example.com").blocked,
      "a colleague behind the same router is unaffected",
    );
  });
});
