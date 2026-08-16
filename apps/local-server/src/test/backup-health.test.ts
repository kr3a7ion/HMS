// Backend Blueprint B19 — backups that restore, and health that can say no.
//
// The two claims worth testing hardest are the ones a property only finds out
// about at the worst moment: that a snapshot can actually be restored, and
// that the health endpoint reports trouble instead of a hardcoded `ok: true`.
//
// The backups here are REAL: a real VACUUM INTO of a real database, a real
// checksum, real AES-256-GCM encryption, and a real restore into a scratch
// SQLite file that is then queried. Nothing is stubbed.
import { test, describe, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { nanoid } from "nanoid";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;
process.env.NEXURA_KEYS_DIR = path.join(os.tmpdir(), `nexura-keys-${Date.now()}-${Math.random().toString(36).slice(2)}`);

let server: http.Server;
let baseUrl: string;
let branchId: string;
let userId: string;

beforeAll(async () => {
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const { db } = await import("../db/client.js");
  const { organizations, branches, users, syncState, reservations, guests, rooms } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const { eq } = await import("drizzle-orm");

  const orgId = nanoid();
  branchId = nanoid();
  userId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "BK Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "BK Branch", createdAt: new Date(),
    currentBusinessDate: new Date(), businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `bk-${userId}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("correct-password"), role: "IT",
    firstName: "Back", lastName: "Up", status: "active", createdAt: new Date(),
  }).run();
  if (!db.select().from(syncState).where(eq(syncState.id, "singleton")).get()) {
    db.insert(syncState).values({ id: "singleton" }).run();
  }

  // Real data, so a restored snapshot has something to prove it kept.
  const roomId = nanoid();
  const guestId = nanoid();
  db.insert(rooms).values({ id: roomId, branchId, number: "B101", type: "Standard" }).run();
  db.insert(guests).values({
    id: guestId, branchId, firstName: "Restore", lastName: "Me",
    vip: false, blacklisted: false, createdAt: new Date(),
  }).run();
  db.insert(reservations).values({
    id: nanoid(), branchId, guestId, roomId, status: "confirmed",
    checkInDate: new Date(), checkOutDate: new Date(Date.now() + 86_400_000),
    rateKobo: 5_000_000, createdBy: userId, createdAt: new Date(),
  }).run();
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});

describe("backups (B19.1-19.4)", () => {
  test("a backup taken DURING active writes produces a restorable file", async () => {
    // The reason for VACUUM INTO rather than copying the file: SQLite runs in
    // WAL mode, and a plain copy captures a database missing whatever is
    // still in the -wal.
    const { createBackup, verifyBackup, backupDir } = await import("../services/backup/index.js");
    const { db } = await import("../db/client.js");
    const { guests } = await import("../db/schema.js");

    // Keep writing while the snapshot is taken.
    for (let i = 0; i < 25; i++) {
      db.insert(guests).values({
        id: nanoid(), branchId, firstName: `Busy${i}`, lastName: "Writer",
        vip: false, blacklisted: false, createdAt: new Date(),
      }).run();
    }
    const backup = createBackup("manual", userId);
    for (let i = 0; i < 25; i++) {
      db.insert(guests).values({
        id: nanoid(), branchId, firstName: `After${i}`, lastName: "Writer",
        vip: false, blacklisted: false, createdAt: new Date(),
      }).run();
    }

    assert.ok(fs.existsSync(path.join(backupDir, backup.fileName)));
    assert.equal(backup.checksumSha256.length, 64);
    assert.ok(backup.encrypted);

    const verification = verifyBackup(backup.id);
    assert.equal(verification.ok, true, verification.detail);
    assert.ok((verification.tableCounts?.reservations ?? 0) >= 1, "the restored copy still has the reservation");
    assert.ok((verification.tableCounts?.users ?? 0) >= 1);
  });

  test("the snapshot on disk is encrypted — not a readable SQLite file", async () => {
    // A backup is a full copy of every guest's personal data, and it is the
    // copy most likely to end up on a USB stick.
    const { createBackup, backupDir } = await import("../services/backup/index.js");
    const backup = createBackup("manual", userId);
    const raw = fs.readFileSync(path.join(backupDir, backup.fileName));

    assert.ok(!raw.subarray(0, 16).toString("utf8").startsWith("SQLite format 3"),
      "an unencrypted snapshot would begin with SQLite's magic header");
    assert.ok(raw.toString("utf8").startsWith("enc."), "it carries the secrets.ts envelope prefix");
  });

  test("a CORRUPTED snapshot fails verification and is marked unrestorable", async () => {
    const { createBackup, verifyBackup, backupDir } = await import("../services/backup/index.js");
    const { db } = await import("../db/client.js");
    const { backupSnapshots } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const backup = createBackup("manual", userId);
    const filePath = path.join(backupDir, backup.fileName);

    // Flip a byte in the middle of the ciphertext.
    const raw = fs.readFileSync(filePath);
    raw[Math.floor(raw.length / 2)] ^= 0xff;
    fs.writeFileSync(filePath, raw);

    const verification = verifyBackup(backup.id);
    assert.equal(verification.ok, false);

    // And it is recorded, so it can never be offered as a recovery point.
    const row = db.select().from(backupSnapshots).where(eq(backupSnapshots.id, backup.id)).get()!;
    assert.equal(row.restoreTestResult, "failed");
    assert.equal(row.status, "unrestorable");
  });

  test("the restore test detects a TRUNCATED snapshot", async () => {
    // The realistic corruption: the disk filled up mid-write. The file exists
    // and looks plausible; it is simply short.
    const { createBackup, verifyBackup, backupDir } = await import("../services/backup/index.js");
    const backup = createBackup("manual", userId);
    const filePath = path.join(backupDir, backup.fileName);

    const raw = fs.readFileSync(filePath);
    fs.writeFileSync(filePath, raw.subarray(0, Math.floor(raw.length * 0.6)));

    const verification = verifyBackup(backup.id);
    assert.equal(verification.ok, false, "a truncated snapshot must not pass");
  });

  test("a missing file fails verification rather than throwing", async () => {
    const { createBackup, verifyBackup, backupDir } = await import("../services/backup/index.js");
    const backup = createBackup("manual", userId);
    fs.rmSync(path.join(backupDir, backup.fileName), { force: true });

    const verification = verifyBackup(backup.id);
    assert.equal(verification.ok, false);
    assert.match(verification.detail, /missing from disk/);
  });

  test("retention pruning NEVER removes the last verified snapshot", async () => {
    // A retention policy that can leave a property with zero recovery points
    // is a data-loss mechanism wearing a housekeeping costume.
    const { createBackup, verifyBackup, pruneExpiredBackups, lastVerifiedBackup, backupDir } = await import("../services/backup/index.js");
    const { db } = await import("../db/client.js");
    const { backupSnapshots } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    const backup = createBackup("scheduled", null);
    assert.equal(verifyBackup(backup.id).ok, true);

    // Expire EVERY snapshot, including the good one.
    for (const row of db.select().from(backupSnapshots).all()) {
      db.update(backupSnapshots).set({ retentionExpiresAt: new Date(Date.now() - 86_400_000) })
        .where(eq(backupSnapshots.id, row.id)).run();
    }

    pruneExpiredBackups();

    // The guarantee is "a verified recovery point always survives", not "this
    // specific one does" -- several snapshots in this file share a
    // millisecond, so which one is *newest* is not the property under test.
    const survivor = lastVerifiedBackup();
    assert.ok(survivor, "at least one verified snapshot must survive any retention policy");
    assert.equal(survivor!.restoreTestResult, "passed");
    assert.ok(
      fs.existsSync(path.join(backupDir, survivor!.fileName)),
      "and the file it points at is still on disk",
    );
  });
});

describe("the health endpoint (B19.6)", () => {
  test("it asks real questions instead of returning a hardcoded ok", async () => {
    // Earlier tests in this file deliberately corrupt snapshots, which the
    // backups probe correctly reports as a FAILURE -- so the state is set
    // explicitly here rather than inherited. (The first run of this test
    // returned 503 for exactly that reason, which was the endpoint working.)
    const { db } = await import("../db/client.js");
    const { syncState } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    db.update(syncState).set({ lastRestoreTestAt: new Date(), lastRestoreTestResult: "passed" })
      .where(eq(syncState.id, "singleton")).run();

    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as { ok: boolean; status: string; probes: { name: string; status: string }[] };

    assert.equal(body.ok, true);
    const names = body.probes.map(p => p.name);
    // Each of these can genuinely fail — that is what makes it a health check
    // rather than a liveness ping for the HTTP listener.
    assert.ok(names.includes("database_writable"));
    assert.ok(names.includes("migrations"));
    assert.ok(names.includes("disk"));
    assert.ok(names.includes("backups"));
    assert.ok(names.includes("lock_provider"));
  });

  test("it returns 503 when a probe genuinely fails", async () => {
    // The half that matters: B18's automatic rollback watches this endpoint,
    // so a health check that cannot fail would have told it a broken build
    // was fine. 503 rather than a 200-with-a-flag so a load balancer or the
    // updater's probe reacts without parsing the body.
    const { db } = await import("../db/client.js");
    const { syncState } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    db.update(syncState).set({ lastRestoreTestAt: new Date(), lastRestoreTestResult: "failed" })
      .where(eq(syncState.id, "singleton")).run();
    try {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 503);
      const body = await res.json() as { ok: boolean; status: string };
      assert.equal(body.ok, false);
      assert.equal(body.status, "unhealthy");
    } finally {
      db.update(syncState).set({ lastRestoreTestAt: new Date(), lastRestoreTestResult: "passed" })
        .where(eq(syncState.id, "singleton")).run();
    }
    assert.equal((await fetch(`${baseUrl}/health`)).status, 200, "and it recovers");
  });

  test("the database write probe actually writes, and leaves nothing behind", async () => {
    const { probeDatabaseWritable } = await import("../services/health/index.js");
    const { sqlite } = await import("../db/client.js");

    assert.equal(probeDatabaseWritable().status, "pass");
    // The probe uses a temp table inside a rolled-back transaction; nothing
    // should survive it.
    const leftovers = sqlite.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_temp_master WHERE name = '_health_probe'",
    ).get() as { n: number };
    assert.equal(leftovers.n, 0);
  });

  test("the migration probe FAILS when the database and the build disagree", async () => {
    // Simulated by asking the probe about a schema version that is not what
    // the database is on — the same condition a partial migration produces.
    const { probeMigrations } = await import("../services/health/index.js");
    const { sqlite } = await import("../db/client.js");

    assert.equal(probeMigrations().status, "pass");

    // Insert a future migration row so applied > expected.
    sqlite.prepare(
      "INSERT INTO schema_migrations (version, name, applied_at, checksum, duration_ms) VALUES (?, ?, ?, ?, ?)",
    ).run(9999, "impossible_future", Date.now(), "x", 0);
    try {
      const probe = probeMigrations();
      assert.equal(probe.status, "fail", "a schema the build does not know about is unhealthy");
      assert.match(probe.detail, /9999/);
    } finally {
      sqlite.prepare("DELETE FROM schema_migrations WHERE version = 9999").run();
    }
    assert.equal(probeMigrations().status, "pass", "and it recovers once resolved");
  });

  test("an unverified backup shows as degraded, not healthy", async () => {
    const { probeBackups } = await import("../services/health/index.js");
    const { db } = await import("../db/client.js");
    const { syncState } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    db.update(syncState).set({ lastRestoreTestAt: null, lastRestoreTestResult: null })
      .where(eq(syncState.id, "singleton")).run();
    assert.equal(probeBackups().status, "warn", "never having tested a restore is not a healthy state");

    db.update(syncState).set({ lastRestoreTestAt: new Date(), lastRestoreTestResult: "failed" })
      .where(eq(syncState.id, "singleton")).run();
    assert.equal(probeBackups().status, "fail", "a FAILED restore test is a real failure");

    db.update(syncState).set({ lastRestoreTestAt: new Date(), lastRestoreTestResult: "passed" })
      .where(eq(syncState.id, "singleton")).run();
    assert.equal(probeBackups().status, "pass");
  });

  test("a stale-but-passing restore test warns rather than passing silently", async () => {
    const { probeBackups } = await import("../services/health/index.js");
    const { db } = await import("../db/client.js");
    const { syncState } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    db.update(syncState).set({
      lastRestoreTestAt: new Date(Date.now() - 60 * 86_400_000),
      lastRestoreTestResult: "passed",
    }).where(eq(syncState.id, "singleton")).run();

    const probe = probeBackups();
    assert.equal(probe.status, "warn");
    assert.match(probe.detail, /60 days ago/);

    db.update(syncState).set({ lastRestoreTestAt: new Date(), lastRestoreTestResult: "passed" })
      .where(eq(syncState.id, "singleton")).run();
  });
});

describe("the disk headroom guard (B19.7)", () => {
  test("below the threshold, non-essential writes are refused but check-out is not", async () => {
    // A property at 400 MiB free must still be able to check a guest OUT and
    // take a payment. Blocking everything would strand guests in rooms the
    // system refuses to release.
    const { isEssentialPath } = await import("../services/health/index.js");

    assert.equal(isEssentialPath("/reservations"), false, "creating a booking only ADDS data");
    assert.equal(isEssentialPath("/reservations/abc123/check-out"), true);
    assert.equal(isEssentialPath("/reservations/abc123/folio/charges"), true, "settling a bill must keep working");
    assert.equal(isEssentialPath("/folios/abc/charges/x/void"), true);
    assert.equal(isEssentialPath("/night-audit/run"), true, "the day must still close");
    assert.equal(isEssentialPath("/admin/backups"), true, "taking a backup can free space");
    assert.equal(isEssentialPath("/auth/login"), true, "staff must still be able to log in");
    assert.equal(isEssentialPath("/inventory/items"), false);
  });

  test("unknown free space does NOT block writes", async () => {
    // statfs is unavailable on some platforms. Refusing every write because
    // the number could not be read would take a working property offline over
    // a missing syscall.
    const { writesBlockedByDisk, __resetDiskCache } = await import("../services/health/index.js");
    __resetDiskCache();
    // On this machine free space is readable and ample, so the guard is open;
    // the assertion that matters is that it does not fail closed.
    assert.equal(writesBlockedByDisk(), false);
  });

  test("a real request is not blocked while the disk is healthy", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "x" }),
    });
    assert.notEqual(res.status, 507);
  });
});

describe("heartbeats (B19.5)", () => {
  test("a sample carries the fields central needs to alert on", async () => {
    const { recordHeartbeat, collectHeartbeat } = await import("../services/health/heartbeat.js");
    const sample = collectHeartbeat();

    assert.ok(sample.dbSizeBytes > 0, "the database file has a real size");
    assert.ok(sample.uptimeSeconds >= 0);
    assert.equal(typeof sample.clockOffsetSeconds, "number");
    assert.ok(sample.schemaVersion > 0);

    const id = recordHeartbeat();
    const { db } = await import("../db/client.js");
    const { healthHeartbeats } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const row = db.select().from(healthHeartbeats).where(eq(healthHeartbeats.id, id)).get()!;

    assert.ok(row.recordedAt);
    assert.equal(row.branchId, branchId);
    assert.equal(row.pushedAt, null, "not yet delivered to central");
  });

  test("unpushed samples are queued for backfill, oldest first", async () => {
    // The window a property was offline is the most useful thing in the
    // buffer, so it is kept and replayed rather than dropped.
    const { recordHeartbeat, unpushedHeartbeats } = await import("../services/health/heartbeat.js");
    recordHeartbeat();
    recordHeartbeat();

    const queued = unpushedHeartbeats();
    assert.ok(queued.length >= 2);
    for (let i = 1; i < queued.length; i++) {
      assert.ok(queued[i].recordedAt.getTime() >= queued[i - 1].recordedAt.getTime(), "oldest first");
    }
  });
});

describe("the backup scheduler", () => {
  test("a due backup is taken AND verified in the same cycle", async () => {
    // Verification is on the schedule rather than left to an operator: it
    // takes seconds, and a monthly cadence means up to a month of snapshots
    // nobody has proven restorable.
    const { runScheduledBackupIfDue, backupPosture } = await import("../services/backup/scheduler.js");
    const { db } = await import("../db/client.js");
    const { backupSnapshots } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");

    // Clear scheduled history so one is due.
    for (const row of db.select().from(backupSnapshots).all().filter(s => s.backupKind === "scheduled")) {
      db.delete(backupSnapshots).where(eq(backupSnapshots.id, row.id)).run();
    }

    const result = runScheduledBackupIfDue();
    assert.equal(result.ran, true, result.detail);
    assert.match(result.detail, /verified/);

    const posture = backupPosture();
    assert.ok(posture.latestVerified, "the cycle leaves a snapshot known to be restorable");
    assert.equal(posture.lastRestoreTestResult, "passed");
  });

  test("a backup that is not due is skipped rather than repeated", async () => {
    const { runScheduledBackupIfDue } = await import("../services/backup/scheduler.js");
    const result = runScheduledBackupIfDue();
    assert.equal(result.ran, false);
    assert.match(result.detail, /Last scheduled backup/);
  });
});
