// Backend Blueprint B19.6/19.7 — a health endpoint that can say "no".
//
// WHAT WAS THERE BEFORE: `res.json({ ok: true })`. A hardcoded literal. It
// returned `ok: true` while the disk was full, while the database was
// read-only, and while migrations had failed — because it never asked
// anything. A health check that cannot fail is not a health check; it is a
// liveness ping for the HTTP listener, and B18's automatic rollback would
// have trusted it and kept a broken build.
//
// Each probe below can genuinely return unhealthy, and each is something that
// has a plausible way of going wrong on a back-office PC in a hotel.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, sqlite, schemaVersion } from "../../db/client.js";
import { syncState, branches } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";

export type ProbeStatus = "pass" | "warn" | "fail";

export interface Probe {
  name: string;
  status: ProbeStatus;
  detail: string;
  [key: string]: unknown;
}

export interface HealthReport {
  ok: boolean;
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  schemaVersion: number;
  uptimeSeconds: number;
  probes: Probe[];
}

/** Bytes free on the volume holding the database. */
export function diskFreeBytes(target = process.cwd()): { free: number; total: number } | null {
  try {
    const stats = fs.statfsSync(target);
    return { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize };
  } catch {
    // statfs is not available on every platform/Node build. Reported as
    // unknown rather than guessed -- a fabricated "plenty of space" is how
    // the guard below would fail to fire.
    return null;
  }
}

function thresholds() {
  const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  return {
    warnBytes: state?.diskWarnBytes ?? 2 * 1024 ** 3,
    blockBytes: state?.diskBlockBytes ?? 512 * 1024 ** 2,
  };
}

/**
 * Is the database WRITABLE, not merely openable?
 *
 * Asked by actually writing. A read-only filesystem, a full disk, or a
 * stale lock all present as a database that opens perfectly and refuses the
 * first INSERT -- which surfaces to a clerk as a check-in that will not save,
 * with a green health indicator on the screen next to them.
 *
 * The write is done inside a transaction that is always rolled back, so the
 * probe leaves nothing behind.
 */
export function probeDatabaseWritable(): Probe {
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      sqlite.exec("CREATE TEMP TABLE IF NOT EXISTS _health_probe (v INTEGER)");
      sqlite.prepare("INSERT INTO _health_probe (v) VALUES (?)").run(Date.now());
      sqlite.exec("DROP TABLE _health_probe");
    } finally {
      sqlite.exec("ROLLBACK");
    }
    return { name: "database_writable", status: "pass", detail: "write probe committed and rolled back" };
  } catch (err) {
    return {
      name: "database_writable", status: "fail",
      detail: `The database is not accepting writes: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Have migrations actually applied, and does the app agree with the file? */
export function probeMigrations(): Probe {
  try {
    const row = sqlite.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as { v: number | null };
    const applied = row.v ?? 0;
    if (applied !== schemaVersion) {
      return {
        name: "migrations", status: "fail", applied, expected: schemaVersion,
        detail: `Database is at schema ${applied} but this build expects ${schemaVersion}`,
      };
    }
    return { name: "migrations", status: "pass", applied, detail: `schema v${applied}` };
  } catch (err) {
    return {
      name: "migrations", status: "fail",
      detail: `Could not read schema_migrations: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Disk headroom. A real failure mode, not a theoretical one: WAL plus a
 * month of snapshots on the small SSD of a back-office PC fills up, and
 * SQLite's response to a full disk is to fail the transaction.
 */
export function probeDisk(): Probe {
  const disk = diskFreeBytes();
  if (!disk) {
    return { name: "disk", status: "warn", detail: "Free space could not be determined on this platform" };
  }
  const { warnBytes, blockBytes } = thresholds();
  const gib = (n: number) => `${(n / 1024 ** 3).toFixed(2)} GiB`;

  if (disk.free < blockBytes) {
    return {
      name: "disk", status: "fail", freeBytes: disk.free, totalBytes: disk.total,
      detail: `Only ${gib(disk.free)} free — below the ${gib(blockBytes)} block threshold. Non-essential writes are being refused.`,
    };
  }
  if (disk.free < warnBytes) {
    return {
      name: "disk", status: "warn", freeBytes: disk.free, totalBytes: disk.total,
      detail: `${gib(disk.free)} free — below the ${gib(warnBytes)} warning threshold.`,
    };
  }
  return { name: "disk", status: "pass", freeBytes: disk.free, totalBytes: disk.total, detail: `${gib(disk.free)} free` };
}

/** Is there a recent, VERIFIED backup? An old one is a warning, not a pass. */
export function probeBackups(now: Date = new Date()): Probe {
  const rows = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  const lastTest = rows?.lastRestoreTestAt ?? null;
  const lastResult = rows?.lastRestoreTestResult ?? null;

  if (!lastTest) {
    return { name: "backups", status: "warn", detail: "No restore test has ever run — no snapshot is known to be restorable" };
  }
  if (lastResult !== "passed") {
    return { name: "backups", status: "fail", detail: `The last restore test FAILED (${lastTest.toISOString()})` };
  }
  const ageDays = (now.getTime() - lastTest.getTime()) / 86_400_000;
  if (ageDays > 35) {
    return { name: "backups", status: "warn", detail: `The last successful restore test was ${Math.floor(ageDays)} days ago` };
  }
  return { name: "backups", status: "pass", detail: `Restore test passed ${Math.floor(ageDays)} day(s) ago` };
}

/**
 * Door-lock provider reachability.
 *
 * `warn`, never `fail`: an unreachable lock provider is a real problem but it
 * does not make the PMS unhealthy, and B18's rollback watches this endpoint.
 * Failing the whole health check because TTLock's API is down would roll back
 * a perfectly good deployment.
 */
export function probeLockProvider(): Probe {
  try {
    const configured = sqlite.prepare("SELECT COUNT(*) AS n FROM door_lock_config WHERE enabled = 1").get() as { n: number };
    if (configured.n === 0) {
      return { name: "lock_provider", status: "pass", detail: "No lock provider configured" };
    }
    const queued = sqlite.prepare("SELECT COUNT(*) AS n FROM lock_sync_queue WHERE status = 'pending'").get() as { n: number };
    if (queued.n > 50) {
      return { name: "lock_provider", status: "warn", pendingCommands: queued.n,
        detail: `${queued.n} lock commands queued — the provider may be unreachable` };
    }
    return { name: "lock_provider", status: "pass", pendingCommands: queued.n, detail: `${queued.n} command(s) queued` };
  } catch {
    return { name: "lock_provider", status: "warn", detail: "Lock provider state could not be read" };
  }
}

/**
 * The full report.
 *
 * `unhealthy` only when something makes the property genuinely unable to
 * operate — the database refusing writes, migrations mismatched, the disk at
 * the blocking threshold. Everything else is `degraded`, which is visible and
 * alertable without triggering B18's automatic rollback.
 */
export function healthReport(): HealthReport {
  const probes = [
    probeDatabaseWritable(),
    probeMigrations(),
    probeDisk(),
    probeBackups(),
    probeLockProvider(),
  ];
  const failed = probes.some(p => p.status === "fail");
  const warned = probes.some(p => p.status === "warn");

  return {
    ok: !failed,
    status: failed ? "unhealthy" : warned ? "degraded" : "healthy",
    service: "nexura-local-server",
    schemaVersion,
    uptimeSeconds: Math.floor(process.uptime()),
    probes,
  };
}

// ─── B19.7 — the disk headroom guard ────────────────────────────────────

let cachedDiskState: { checkedAt: number; blocked: boolean } = { checkedAt: 0, blocked: false };

/**
 * True when the disk is below the blocking threshold.
 *
 * Cached for 30 seconds: statfs on every request would be a syscall per API
 * call, and free space does not change meaningfully in that window.
 */
export function writesBlockedByDisk(now = Date.now()): boolean {
  if (now - cachedDiskState.checkedAt < 30_000) return cachedDiskState.blocked;
  const disk = diskFreeBytes();
  // Unknown free space does NOT block: refusing every write because a
  // platform lacks statfs would take a working property offline.
  const blocked = disk ? disk.free < thresholds().blockBytes : false;
  if (blocked && !cachedDiskState.blocked) {
    logger.error({ freeBytes: disk?.free }, "[health] Disk below the blocking threshold — refusing non-essential writes");
  }
  cachedDiskState = { checkedAt: now, blocked };
  return blocked;
}

/** Test seam: forget the cached disk reading. */
export function __resetDiskCache() {
  cachedDiskState = { checkedAt: 0, blocked: false };
}

/**
 * Paths that keep working even when the disk is critical.
 *
 * A property at 400 MiB free must still be able to check a guest OUT, take a
 * payment and close the day — those free space and settle money. What is
 * refused is work that only ADDS data: new bookings, new stock, new
 * announcements. Blocking everything would strand guests in rooms the system
 * refuses to release.
 */
const ESSENTIAL_PREFIXES = [
  "/auth", "/health", "/updates",
  "/folios",              // settle and void
  "/night-audit",         // close the day
  "/admin/backups",       // free space by taking/pruning a backup
  "/sync",                // get data off the box
];

export function isEssentialPath(pathname: string): boolean {
  if (ESSENTIAL_PREFIXES.some(p => pathname.startsWith(p))) return true;
  // Check-out and payment on a reservation stay available; creating one does
  // not.
  return /^\/reservations\/[^/]+\/(check-out|folio\/charges)$/.test(pathname);
}

export function recordBranchHeartbeatContext() {
  return db.select({ id: branches.id }).from(branches).limit(1).get()?.id ?? null;
}
