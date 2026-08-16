// Backend Blueprint B19.1-19.4 — the backup schedule.
//
// A 15-minute tick rather than a cron dependency, same reasoning as B5's night
// audit scheduler: the requirement is "is anything due?", which needs no new
// package, and the work itself is idempotent enough that an extra check costs
// nothing.
//
// THE RESTORE TEST IS ON THE SCHEDULE, not left to an operator. The blueprint
// asks for it monthly; this runs it after every scheduled backup, because it
// takes seconds on a property-sized database and a monthly cadence means up to
// a month of snapshots nobody has proven restorable. The thing that makes a
// backup real should not be the thing that is easiest to skip.
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { backupSnapshots, syncState } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { createBackup, pruneExpiredBackups, verifyBackup } from "./index.js";

const TICK_MS = 15 * 60 * 1000;
/** One scheduled snapshot per day is the floor for a hotel's data. */
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let handle: ReturnType<typeof setInterval> | null = null;

function lastScheduledBackup(): Date | null {
  return db.select().from(backupSnapshots).all()
    .filter(s => s.backupKind === "scheduled")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt ?? null;
}

/**
 * Runs a backup if one is due. Exported so a test — and an operator — can
 * trigger the whole cycle without waiting for a timer.
 */
export function runScheduledBackupIfDue(now: Date = new Date()): { ran: boolean; detail: string } {
  const last = lastScheduledBackup();
  if (last && now.getTime() - last.getTime() < BACKUP_INTERVAL_MS) {
    return { ran: false, detail: `Last scheduled backup was ${last.toISOString()}` };
  }

  try {
    const backup = createBackup("scheduled", null);

    // Verify IMMEDIATELY. A snapshot that cannot be restored is worse than no
    // snapshot, because it is counted as protection that does not exist.
    const verification = verifyBackup(backup.id);
    const pruned = pruneExpiredBackups(now);

    if (!verification.ok) {
      logger.error({ backupId: backup.id, detail: verification.detail },
        "[backup] The scheduled snapshot FAILED its restore test — this property has no verified recovery point from this run");
    }
    return {
      ran: true,
      detail: `${backup.fileName} (${verification.ok ? "verified" : "FAILED VERIFICATION"}), ${pruned.pruned} pruned`,
    };
  } catch (err) {
    logger.error({ err }, "[backup] Scheduled backup failed");
    return { ran: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function startBackupScheduler() {
  if (handle) return;
  if (process.env.NEXURA_DISABLE_BACKUP_SCHEDULER === "1" || process.env.VITEST) return;

  handle = setInterval(() => {
    try {
      const result = runScheduledBackupIfDue();
      if (result.ran) logger.info({ detail: result.detail }, "[backup] Scheduled backup cycle complete");
    } catch (err) {
      // Backups must never take the server down. A property that cannot back
      // up is a problem; a property that will not check guests in because the
      // backup threw is a bigger one.
      logger.error({ err }, "[backup] Scheduler tick failed");
    }
  }, TICK_MS);
  handle.unref?.();
  logger.info("[backup] Scheduler started (daily snapshot, verified on creation, retention pruned)");
}

export function stopBackupScheduler() {
  if (handle) { clearInterval(handle); handle = null; }
}

/** Current backup posture, for the health endpoint and the IT screen. */
export function backupPosture() {
  const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  const snapshots = db.select().from(backupSnapshots).all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const verified = snapshots.filter(s => s.restoreTestResult === "passed");

  return {
    total: snapshots.length,
    verifiedCount: verified.length,
    latest: snapshots[0] ?? null,
    latestVerified: verified[0] ?? null,
    retentionDays: state?.backupRetentionDays ?? 30,
    offsiteTarget: state?.offsiteTarget ?? null,
    lastRestoreTestAt: state?.lastRestoreTestAt ?? null,
    lastRestoreTestResult: state?.lastRestoreTestResult ?? null,
  };
}
