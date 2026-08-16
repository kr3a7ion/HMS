// Backend Blueprint B0 test: "encrypted secret round-trips".
//
// Also covers the properties that make the round-trip worth anything: that
// ciphertext isn't reversible-looking, that a tampered blob fails loudly
// rather than returning garbage (a silently-corrupted password would be
// sent to TTLock as a login attempt), and that pre-encryption plaintext
// rows still read back — the transparent-upgrade path in
// services/locks/config.ts depends on that.
import { test, beforeAll as before, afterAll as after } from "vitest";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// secrets.ts derives its key from the signing key in <cwd>/data/keys, which
// auth/keys.ts generates on first import. Nothing to isolate per-test here
// (no DB), but NEXURA_DB_PATH is still set so importing anything that
// touches db/client.js can't reach the real dev database.
const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

let encryptSecret: typeof import("../lib/secrets.js").encryptSecret;
let decryptSecret: typeof import("../lib/secrets.js").decryptSecret;
let isEncrypted: typeof import("../lib/secrets.js").isEncrypted;

before(async () => {
  ({ encryptSecret, decryptSecret, isEncrypted } = await import("../lib/secrets.js"));
});

after(() => {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
});

test("a secret round-trips through encrypt/decrypt unchanged", () => {
  const secret = "ttlock-client-secret-abc123";
  const stored = encryptSecret(secret);
  assert.notEqual(stored, secret);
  assert.equal(decryptSecret(stored), secret);
});

test("round-trips values with unicode, symbols and length", () => {
  for (const secret of ["p@ssw0rd!", "naira₦sign", "spaces and \"quotes\" and 'apostrophes'", "x".repeat(4096), "a"]) {
    assert.equal(decryptSecret(encryptSecret(secret)), secret, `failed for: ${secret.slice(0, 20)}`);
  }
});

test("the plaintext never appears in the stored blob", () => {
  const secret = "SuperSecretPassword";
  assert.ok(!encryptSecret(secret).includes(secret));
});

test("encrypting the same value twice yields different blobs that both decrypt", () => {
  // A deterministic ciphertext would leak that two branches share a
  // password, so the IV is random per call.
  const secret = "same-input";
  const a = encryptSecret(secret);
  const b = encryptSecret(secret);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), secret);
  assert.equal(decryptSecret(b), secret);
});

test("legacy plaintext passes through unchanged -- the transparent-upgrade path", () => {
  // Rows written before encryption existed hold bare plaintext. Reading one
  // must return it, not throw, or every pre-existing door lock breaks.
  assert.equal(decryptSecret("legacy-plaintext-secret"), "legacy-plaintext-secret");
  assert.equal(decryptSecret(null), null);
  assert.equal(decryptSecret(""), "");
});

test("isEncrypted distinguishes an encrypted blob from legacy plaintext", () => {
  assert.equal(isEncrypted(encryptSecret("x")), true);
  assert.equal(isEncrypted("plain-value"), false);
  assert.equal(isEncrypted(null), false);
  assert.equal(isEncrypted(undefined), false);
});

test("a tampered blob throws rather than returning corrupted plaintext", () => {
  const stored = encryptSecret("real-password");
  const [prefixAndIv, authTag, ciphertext] = stored.split(".").slice(-3);
  void prefixAndIv; void authTag;
  // Flip a bit in the ciphertext; GCM's auth tag must reject it.
  const raw = Buffer.from(ciphertext, "base64");
  raw[0] ^= 0xff;
  const tampered = stored.slice(0, stored.lastIndexOf(".") + 1) + raw.toString("base64");
  assert.throws(() => decryptSecret(tampered));
});

test("a malformed blob throws rather than being treated as plaintext", () => {
  assert.throws(() => decryptSecret("enc.v1.only-two.parts"));
});
