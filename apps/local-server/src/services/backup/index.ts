// Backend Blueprint B19.1-19.4 — backups that are actually restorable.
//
// WHAT WAS THERE BEFORE. `sqlite.backup(dest)` wrote a file and recorded its
// size. Nothing verified the file was readable, nothing detected a truncation
// caused by a full disk, nothing was ever encrypted, and no snapshot had ever
// been restored. A property finds out which of those mattered on the one
// morning it needs a backup — which is the worst possible moment to discover
// that the answer is "all of them".
//
// FOUR THINGS MAKE A FILE INTO A BACKUP, and this module does all four:
//   1. VACUUM INTO, not a file copy. SQLite is running in WAL mode with live
//      connections; copying the .db file alone captures a database missing
//      everything still in the WAL. VACUUM INTO produces a consistent
//      snapshot from inside the engine while writes continue.
//   2. A CHECKSUM over the plaintext, so corruption is detectable. Computed
//      before encryption, so it verifies the database rather than the
//      envelope.
//   3. ENCRYPTION, because a backup is a full copy of every guest's personal
//      data and it is the copy most likely to end up on a USB stick.
//   4. A RESTORE TEST. An untested backup is not a backup; it is a file.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../../db/client.js";
import { backupSnapshots, syncState, branches } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { encryptSecret, decryptSecret } from "../../lib/secrets.js";

export const backupDir = path.resolve(process.cwd(), "data", "backups");
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

export type BackupKind = "scheduled" | "manual" | "pre_migration";

export interface BackupResult {
  id: string;
  fileName: string;
  sizeBytes: number;
  checksumSha256: string;
  encrypted: boolean;
  retentionExpiresAt: Date | null;
}

function sha256File(filePath: string): string {
  // Streamed in chunks: a property's database will not fit comfortably in
  // memory forever, and reading it whole to hash it would be the thing that
  // fails first on the machine with the least headroom.
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(64 * 1024);
    let bytes: number;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function branchIdOrNull(): string | null {
  return db.select({ id: branches.id }).from(branches).limit(1).get()?.id ?? null;
}

function settings() {
  const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  return {
    retentionDays: state?.backupRetentionDays ?? 30,
    offsiteTarget: state?.offsiteTarget ?? null,
  };
}

/**
 * Takes a snapshot.
 *
 * VACUUM INTO rather than the previous `sqlite.backup()`: both are safe
 * against a live connection, but VACUUM INTO also compacts, which matters
 * when the snapshot is about to be encrypted and shipped over a Nigerian
 * hotel's uplink.
 */
export function createBackup(kind: BackupKind, createdBy: string | null): BackupResult {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `nexura-${kind}-${stamp}.db`;
  const plainPath = path.join(backupDir, baseName);

  // Safe while other connections are writing -- the whole reason not to copy
  // the file. A plain `cp` of a WAL-mode database captures a torn state that
  // is missing whatever is still in the -wal file.
  sqlite.exec(`VACUUM INTO '${plainPath.replace(/'/g, "''")}'`);

  // Checksum the PLAINTEXT: this verifies the database survived, not that the
  // encryption round-tripped.
  const checksum = sha256File(plainPath);

  // Encrypt in place. The key comes from lib/secrets.ts, which derives it
  // from the property's signing key -- so a snapshot is readable only on a
  // machine that also holds that key.
  const plaintext = fs.readFileSync(plainPath);
  const encrypted = encryptSecret(plaintext.toString("base64"));
  const fileName = `${baseName}.enc`;
  const encPath = path.join(backupDir, fileName);
  fs.writeFileSync(encPath, encrypted, { mode: 0o600 });
  fs.rmSync(plainPath, { force: true });

  const sizeBytes = fs.statSync(encPath).size;
  const { retentionDays, offsiteTarget } = settings();
  const retentionExpiresAt = retentionDays > 0
    ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000)
    : null;

  const branchId = branchIdOrNull();
  if (!branchId) {
    // A snapshot must belong to a branch: an orphan row cannot be listed on
    // the IT screen or reported to central, and would be invisible.
    fs.rmSync(encPath, { force: true });
    throw new Error("Cannot take a backup before the branch is provisioned");
  }

  const id = nanoid();
  db.insert(backupSnapshots).values({
    id,
    branchId,
    fileName,
    sizeBytes,
    type: "local",
    status: "completed",
    createdBy,
    createdAt: new Date(),
    encryptionAlgorithm: ENCRYPTION_ALGORITHM,
    checksumSha256: checksum,
    backupKind: kind,
    retentionExpiresAt,
    offsiteStatus: offsiteTarget ? "pending" : "not_configured",
  }).run();

  logger.info({ id, fileName, sizeBytes, kind }, "[backup] Snapshot created, checksummed and encrypted");
  return { id, fileName, sizeBytes, checksumSha256: checksum, encrypted: true, retentionExpiresAt };
}

export interface VerificationResult {
  ok: boolean;
  detail: string;
  /** Rows counted from the restored copy, when it opened. */
  tableCounts?: Record<string, number>;
}

/**
 * THE RESTORE TEST. Decrypts a snapshot into a scratch file, opens it as a
 * real SQLite database, and runs a validation query set.
 *
 * This is the difference between a backup and a file. It catches:
 *   * truncation (a full disk mid-write),
 *   * bit corruption (checksum mismatch),
 *   * a snapshot encrypted with a key this machine no longer has,
 *   * and a structurally-intact file whose schema never actually applied.
 *
 * Restores into a TEMP path, never over the live database. A "restore test"
 * that touched production data would be a considerably worse bug than the one
 * it is checking for.
 */
export function verifyBackup(snapshotId: string): VerificationResult {
  const snapshot = db.select().from(backupSnapshots).where(eq(backupSnapshots.id, snapshotId)).get();
  if (!snapshot) return { ok: false, detail: "Snapshot record not found" };

  const encPath = path.join(backupDir, snapshot.fileName);
  if (!fs.existsSync(encPath)) {
    return record(snapshotId, { ok: false, detail: "Snapshot file is missing from disk" });
  }

  const scratch = path.join(os.tmpdir(), `nexura-restore-test-${nanoid()}.db`);
  try {
    // 1. Decrypt.
    let restored: Buffer;
    try {
      const decrypted = decryptSecret(fs.readFileSync(encPath, "utf8"));
      if (!decrypted) throw new Error("decryption returned nothing");
      restored = Buffer.from(decrypted, "base64");
    } catch (err) {
      return record(snapshotId, {
        ok: false,
        detail: `Could not decrypt the snapshot: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    fs.writeFileSync(scratch, restored);

    // 2. Checksum the restored plaintext against what was recorded. This is
    //    what catches a truncated or altered file.
    if (snapshot.checksumSha256) {
      const actual = sha256File(scratch);
      if (actual !== snapshot.checksumSha256) {
        return record(snapshotId, {
          ok: false,
          detail: `Checksum mismatch: recorded ${snapshot.checksumSha256.slice(0, 12)}…, restored ${actual.slice(0, 12)}…`,
        });
      }
    }

    // 3. Open it as a database and ask it real questions. A file can pass a
    //    checksum and still be unusable if it was never a valid database.
    const probe = new Database(scratch, { readonly: true });
    try {
      const integrity = probe.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") {
        return record(snapshotId, { ok: false, detail: `SQLite integrity_check returned: ${integrity}` });
      }

      // The validation query set: the tables a restored property cannot
      // function without. An empty `users` table means nobody can log in,
      // which is a failed restore even though the file opened fine.
      const counts: Record<string, number> = {};
      for (const table of ["users", "branches", "reservations", "folio_charges", "schema_migrations"]) {
        const row = probe.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
        counts[table] = row.n;
      }
      if (counts.users === 0 || counts.branches === 0) {
        return record(snapshotId, {
          ok: false,
          detail: "Restored database has no users or no branches — nobody could log in to it",
          tableCounts: counts,
        });
      }

      const version = probe.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
      return record(snapshotId, {
        ok: true,
        detail: `Restored and validated: schema v${version.v}, ${counts.users} user(s), ${counts.reservations} reservation(s)`,
        tableCounts: counts,
      });
    } finally {
      probe.close();
    }
  } catch (err) {
    return record(snapshotId, {
      ok: false,
      detail: `Restore test failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    fs.rmSync(scratch, { force: true });
  }
}

function record(snapshotId: string, result: VerificationResult): VerificationResult {
  db.update(backupSnapshots).set({
    restoreTestAt: new Date(),
    restoreTestResult: result.ok ? "passed" : "failed",
    restoreTestDetail: result.detail,
    // A snapshot that fails its restore test is marked so it is never
    // presented as a viable recovery point.
    ...(result.ok ? {} : { status: "unrestorable" }),
  }).where(eq(backupSnapshots.id, snapshotId)).run();

  db.update(syncState).set({
    lastRestoreTestAt: new Date(),
    lastRestoreTestResult: result.ok ? "passed" : "failed",
  }).where(eq(syncState.id, "singleton")).run();

  if (!result.ok) {
    logger.error({ snapshotId, detail: result.detail }, "[backup] RESTORE TEST FAILED — this snapshot is not a viable recovery point");
  } else {
    logger.info({ snapshotId, detail: result.detail }, "[backup] Restore test passed");
  }
  return result;
}

/**
 * Deletes snapshots past their retention date.
 *
 * NEVER prunes the most recent verified snapshot, whatever retention says. A
 * retention policy that can leave a property with zero recovery points is a
 * data-loss mechanism wearing a housekeeping costume.
 */
export function pruneExpiredBackups(now: Date = new Date()): { pruned: number; kept: string[] } {
  // Tie-broken on id. Several snapshots can share a millisecond, and an
  // unstable sort meant the snapshot this function PROTECTED could differ
  // from the one lastVerifiedBackup() reported -- so a caller could be told
  // a recovery point existed that prune had just deleted.
  const all = db.select().from(backupSnapshots).all().sort(byNewest);

  const newestVerified = all.find(s => s.restoreTestResult === "passed");
  const newest = all[0];
  const protectedIds = new Set([newestVerified?.id, newest?.id].filter(Boolean) as string[]);

  let pruned = 0;
  for (const snapshot of all) {
    if (protectedIds.has(snapshot.id)) continue;
    if (!snapshot.retentionExpiresAt || snapshot.retentionExpiresAt > now) continue;

    fs.rmSync(path.join(backupDir, snapshot.fileName), { force: true });
    db.delete(backupSnapshots).where(eq(backupSnapshots.id, snapshot.id)).run();
    pruned += 1;
  }
  if (pruned > 0) logger.info({ pruned, protected: [...protectedIds] }, "[backup] Pruned expired snapshots");
  return { pruned, kept: [...protectedIds] };
}

/** The most recent snapshot that has actually been proven restorable. */
export function lastVerifiedBackup() {
  return db.select().from(backupSnapshots).all()
    .filter(s => s.restoreTestResult === "passed")
    .sort(byNewest)[0] ?? null;
}

/** Newest first, deterministically — see the note in pruneExpiredBackups. */
function byNewest(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }) {
  return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
}
