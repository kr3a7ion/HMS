// Backend Blueprint B18 — signed update channel and automatic rollback.
//
// WHAT THIS FILE CAN AND CANNOT PROVE, stated once and plainly:
//
//   CAN — with real cryptography and real database writes: that an unsigned
//   image is refused, that an image signed by the wrong key is refused, that
//   a release outside this branch's ring is ignored, that a downgrade below
//   the database's schema version is refused, and that a health-check failure
//   rolls back to the previous digest and records it.
//
//   CANNOT — there is no Docker daemon and no registry in this environment,
//   so the container swap itself and a live tag→digest resolution against a
//   real registry are not exercised. The swap and the health probe are
//   injected, which is exactly why the ORCHESTRATION around them -- the part
//   that decides to roll back -- is fully tested while the shell-out stays
//   honestly unverified.
//
// The signatures below are generated with real ECDSA key pairs at test time,
// so the verification path is genuine crypto, not a stub.
import { test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { nanoid } from "nanoid";
import os from "node:os";
import path from "node:path";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;
process.env.NEXURA_KEYS_DIR = path.join(os.tmpdir(), `nexura-keys-${Date.now()}-${Math.random().toString(36).slice(2)}`);

const DIGEST = `sha256:${"a".repeat(64)}`;
const OTHER_DIGEST = `sha256:${"b".repeat(64)}`;

/** A real ECDSA P-256 pair, and a signer over the digest string. */
function makeKeyPair(keyId: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return {
    keyId,
    publicKeyPem: publicKey,
    sign(digest: string) {
      return {
        keyId,
        signature: crypto.sign("sha256", Buffer.from(digest, "utf8"), { key: privateKey, dsaEncoding: "der" })
          .toString("base64"),
      };
    },
  };
}

let release: typeof import("../services/updater/policy.js");
let signature: typeof import("../services/updater/signature.js");
let orchestrator: typeof import("../services/updater/orchestrator.js");

beforeAll(async () => {
  // Importing app.js boots the DB and runs migrations, which is what the
  // orchestrator's writes need.
  await import("../app.js");
  release = await import("../services/updater/policy.js");
  signature = await import("../services/updater/signature.js");
  orchestrator = await import("../services/updater/orchestrator.js");
});

afterAll(() => { delete process.env.NEXURA_UPDATE_TRUSTED_KEYS; });

beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const { syncState, organizations, branches } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");

  if (!db.select().from(branches).limit(1).get()) {
    const orgId = nanoid();
    db.insert(organizations).values({ id: orgId, name: "Up Org", createdAt: new Date() }).run();
    db.insert(branches).values({
      id: nanoid(), organizationId: orgId, name: "Up Branch", createdAt: new Date(),
      currentBusinessDate: new Date(), businessDateRollHour: 3,
    }).run();
  }
  if (!db.select().from(syncState).where(eq(syncState.id, "singleton")).get()) {
    db.insert(syncState).values({ id: "singleton" }).run();
  }
});

const trusted = makeKeyPair("nexura-release-2026");
const attacker = makeKeyPair("attacker-key");

function descriptor(overrides: Partial<import("../services/updater/policy.js").ReleaseDescriptor> = {}) {
  return {
    requestedRef: "stable",
    digest: DIGEST,
    availableForRing: "general" as const,
    schemaVersion: 10,
    signatureStatus: "verified" as const,
    signatureKeyId: trusted.keyId,
    ...overrides,
  };
}

function branchState(overrides: Partial<import("../services/updater/policy.js").BranchState> = {}) {
  return { ring: "general" as const, currentDigest: OTHER_DIGEST, dbSchemaVersion: 10, ...overrides };
}

describe("signature verification (B18.2)", () => {
  test("a correctly signed image verifies against the pinned key", () => {
    const result = signature.verifyImageSignature(DIGEST, trusted.sign(DIGEST), [trusted]);
    assert.equal(result.status, "verified");
    assert.equal(result.keyId, trusted.keyId);
  });

  test("an UNSIGNED image is refused", () => {
    const result = signature.verifyImageSignature(DIGEST, null, [trusted]);
    assert.equal(result.status, "unsigned");
    assert.ok(!signature.signaturePermitsSwap(result.status));
  });

  test("an image signed by the WRONG key is refused", () => {
    // The compromised-registry case: an attacker can sign perfectly well,
    // just not with our key.
    const result = signature.verifyImageSignature(DIGEST, attacker.sign(DIGEST), [trusted]);
    assert.equal(result.status, "unknown_key");
    assert.equal(result.keyId, attacker.keyId);
  });

  test("a signature over a DIFFERENT digest is refused", () => {
    // The substitution attack: take a valid signature from a real release and
    // present it alongside a different image.
    const stolen = trusted.sign(OTHER_DIGEST);
    const result = signature.verifyImageSignature(DIGEST, stolen, [trusted]);
    assert.equal(result.status, "invalid");
  });

  test("an empty trust set refuses everything rather than skipping the check", () => {
    // The failure direction that matters. An updater that fails OPEN is worse
    // than one with no signing at all, because it looks protected.
    const result = signature.verifyImageSignature(DIGEST, trusted.sign(DIGEST), []);
    assert.equal(result.status, "unknown_key");
    assert.ok(!signature.signaturePermitsSwap(result.status));
  });

  test("a malformed trust set is treated as NO trust, not as skip", () => {
    const original = process.env.NEXURA_UPDATE_TRUSTED_KEYS;
    try {
      process.env.NEXURA_UPDATE_TRUSTED_KEYS = "{not json";
      assert.deepEqual(signature.trustedKeys(), [], "a typo in a deploy variable must not open the gate");
    } finally {
      if (original === undefined) delete process.env.NEXURA_UPDATE_TRUSTED_KEYS;
      else process.env.NEXURA_UPDATE_TRUSTED_KEYS = original;
    }
  });

  test("a garbage digest is refused before any crypto runs", () => {
    assert.equal(signature.verifyImageSignature("latest", trusted.sign("latest"), [trusted]).status, "invalid");
  });
});

describe("the release policy (B18.3/18.4/18.8)", () => {
  test("a verified, in-ring, forward-schema release is approved", () => {
    const decision = release.evaluateRelease(descriptor(), branchState());
    assert.equal(decision.allowed, true);
  });

  test("an unverified signature refuses the swap, whatever else is true", () => {
    for (const status of ["unsigned", "unknown_key", "invalid", "unverified"] as const) {
      const decision = release.evaluateRelease(descriptor({ signatureStatus: status }), branchState());
      assert.equal(decision.allowed, false, status);
      assert.equal(decision.reason, "SIGNATURE_NOT_VERIFIED");
      assert.ok(release.isSecurityRefusal(decision.reason), "and it is a security event, not housekeeping");
    }
  });

  test("a branch in the general ring IGNORES a canary-only release", () => {
    const decision = release.evaluateRelease(
      descriptor({ availableForRing: "canary" }),
      branchState({ ring: "general" }),
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "RING_NOT_REACHED");
    // Not a security event: nothing is wrong, this property is just not first.
    assert.ok(!release.isSecurityRefusal(decision.reason));
  });

  test("a canary branch DOES take a canary release, and also a general one", () => {
    assert.equal(release.evaluateRelease(descriptor({ availableForRing: "canary" }), branchState({ ring: "canary" })).allowed, true);
    assert.equal(release.evaluateRelease(descriptor({ availableForRing: "general" }), branchState({ ring: "canary" })).allowed, true);
  });

  test("a downgrade below the database's schema version is refused", () => {
    // Pairs with B1's future-schema guard from the other side: B1 stops an
    // old binary opening a new database; this stops us installing it.
    const decision = release.evaluateRelease(
      descriptor({ schemaVersion: 8 }),
      branchState({ dbSchemaVersion: 10 }),
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "SCHEMA_DOWNGRADE");
    assert.match(decision.detail, /not reversible/);
  });

  test("an equal schema version is fine — only a DOWNGRADE is refused", () => {
    assert.equal(release.evaluateRelease(descriptor({ schemaVersion: 10 }), branchState({ dbSchemaVersion: 10 })).allowed, true);
  });

  test("a release with no resolved digest is refused", () => {
    // Falling back to the tag here would discard the guarantee the signature
    // just gave: a tag can move between verification and pull.
    const decision = release.evaluateRelease(descriptor({ digest: "stable" }), branchState());
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "NO_DIGEST");
  });

  test("the digest already running is a no-op, not an error", () => {
    const decision = release.evaluateRelease(descriptor(), branchState({ currentDigest: DIGEST }));
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "ALREADY_RUNNING");
    assert.ok(!release.isSecurityRefusal(decision.reason));
  });
});

describe("the update run (B18.5)", () => {
  const noWait = async () => {};

  test("a refused update records the attempt and swaps NOTHING", async () => {
    let swapCalls = 0;
    const outcome = await orchestrator.performUpdate(
      descriptor({ signatureStatus: "unsigned" }),
      branchState(),
      {
        swap: async () => { swapCalls += 1; return { ok: true }; },
        probeHealth: async () => ({ healthy: true, detail: "ok" }),
        wait: noWait,
      },
    );

    assert.equal(outcome.status, "refused");
    assert.equal(outcome.reason, "SIGNATURE_NOT_VERIFIED");
    assert.equal(swapCalls, 0, "an unsigned image must never reach the swap");

    const { db } = await import("../db/client.js");
    const { updateAttempts } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const row = db.select().from(updateAttempts).where(eq(updateAttempts.id, outcome.attemptId)).get()!;
    assert.equal(row.status, "refused");
    assert.equal(row.signatureStatus, "unsigned");
    assert.equal(row.healthResult, "not_run");
  });

  test("a healthy swap succeeds and records the new digest", async () => {
    const outcome = await orchestrator.performUpdate(descriptor(), branchState(), {
      swap: async () => ({ ok: true }),
      probeHealth: async () => ({ healthy: true, detail: "schema 10, db writable" }),
      wait: noWait,
    });
    assert.equal(outcome.status, "succeeded");

    const { db } = await import("../db/client.js");
    const { syncState } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get()!;
    assert.equal(state.currentImageDigest, DIGEST);
    assert.equal(state.previousImageDigest, OTHER_DIGEST, "the prior digest is kept — it is where a rollback goes");
    assert.equal(state.lastHealthResult, "passed");
  });

  test("a health-check failure rolls back to the previous digest, automatically", async () => {
    // THE HEADLINE. A property takes an update at 04:00, the new container
    // never comes up healthy, and nobody is awake. Without this the hotel
    // opens at 06:00 with no PMS.
    const swapped: string[] = [];
    const outcome = await orchestrator.performUpdate(descriptor(), branchState(), {
      swap: async (digest) => { swapped.push(digest); return { ok: true }; },
      probeHealth: async () => ({ healthy: false, detail: "migrations failed" }),
      healthWindowMs: 30,
      healthIntervalMs: 10,
      wait: noWait,
    });

    assert.equal(outcome.status, "rolled_back");
    assert.equal(outcome.rolledBackTo, OTHER_DIGEST);
    assert.deepEqual(swapped, [DIGEST, OTHER_DIGEST], "swapped forward, then back");

    const { db } = await import("../db/client.js");
    const { updateAttempts, syncState } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const row = db.select().from(updateAttempts).where(eq(updateAttempts.id, outcome.attemptId)).get()!;
    assert.equal(row.status, "rolled_back");
    assert.equal(row.healthResult, "failed");
    assert.equal(row.rolledBackTo, OTHER_DIGEST);
    assert.match(row.healthDetail ?? "", /migrations failed/);

    // The property is still on the good digest, so it is still serving --
    // and the record says so. (Asserted on the exact value rather than
    // "not DIGEST": the tests share a database, so an earlier test's
    // successful update would otherwise satisfy a negative assertion by
    // accident.)
    const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get()!;
    assert.equal(
      state.currentImageDigest, OTHER_DIGEST,
      "after a rollback the recorded current digest is the one restored",
    );
    assert.equal(state.lastHealthResult, "failed");
  });

  test("a swap that fails outright is NOT reported as a rollback", async () => {
    // The old container is still running, so nothing was rolled back. Saying
    // otherwise would be a record of an action that never happened.
    const outcome = await orchestrator.performUpdate(descriptor(), branchState(), {
      swap: async () => ({ ok: false, error: "docker daemon unreachable" }),
      probeHealth: async () => ({ healthy: true, detail: "unused" }),
      wait: noWait,
    });
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.rolledBackTo, null);
    assert.match(outcome.detail, /previous container still running/);
  });

  test("a failed health check with no previous digest reports honestly", async () => {
    const outcome = await orchestrator.performUpdate(descriptor(), branchState({ currentDigest: null }), {
      swap: async () => ({ ok: true }),
      probeHealth: async () => ({ healthy: false, detail: "no response" }),
      healthWindowMs: 30, healthIntervalMs: 10, wait: noWait,
    });
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.rolledBackTo, null);
    assert.match(outcome.detail, /no previous known-good image/);
  });

  test("a health check that comes good on a later poll succeeds", async () => {
    // Containers take time to start; failing on the first probe would roll
    // back every healthy update.
    let probes = 0;
    const outcome = await orchestrator.performUpdate(descriptor(), branchState(), {
      swap: async () => ({ ok: true }),
      probeHealth: async () => { probes += 1; return { healthy: probes >= 3, detail: `probe ${probes}` }; },
      healthWindowMs: 1_000, healthIntervalMs: 1, wait: noWait,
    });
    assert.equal(outcome.status, "succeeded");
    assert.ok(probes >= 3);
  });
});

describe("the reported posture (B18.6)", () => {
  test("zero trusted keys is surfaced explicitly, not silently", async () => {
    // "Updates are silently not happening" and "updates are being correctly
    // refused" look identical from outside unless this is stated.
    const { updatePosture } = await import("../routes/updates.js");
    const original = process.env.NEXURA_UPDATE_TRUSTED_KEYS;
    try {
      delete process.env.NEXURA_UPDATE_TRUSTED_KEYS;
      const posture = updatePosture();
      assert.equal(posture.trustedKeyCount, 0);
      assert.equal(posture.updatesPossible, false);

      process.env.NEXURA_UPDATE_TRUSTED_KEYS = JSON.stringify([
        { keyId: trusted.keyId, publicKeyPem: trusted.publicKeyPem },
      ]);
      const configured = updatePosture();
      assert.equal(configured.trustedKeyCount, 1);
      assert.equal(configured.updatesPossible, true);
      assert.deepEqual(configured.trustedKeyIds, [trusted.keyId]);
    } finally {
      if (original === undefined) delete process.env.NEXURA_UPDATE_TRUSTED_KEYS;
      else process.env.NEXURA_UPDATE_TRUSTED_KEYS = original;
    }
  });

  test("the ring defaults to the SAFEST value, not the most convenient", async () => {
    // A branch whose ring failed to sync should receive fewer updates, not
    // more.
    const { updatePosture } = await import("../routes/updates.js");
    assert.equal(updatePosture().ring, "general");
  });
});
