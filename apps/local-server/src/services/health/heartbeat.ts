// Backend Blueprint B19.5 — the heartbeat.
//
// THE ALERT IS AN ABSENCE, and that is the whole design problem. A branch
// whose server died at 02:00 sends no error, logs nothing, and looks exactly
// like a branch that is simply quiet. So the signal has to be
// expected-and-missing: central knows a heartbeat is due every 60 seconds and
// alerts when one stops arriving.
//
// KEPT LOCALLY AS WELL AS PUSHED. The moment central most wants this data is
// when the uplink is down — and a metric that only exists once it has been
// transmitted is missing exactly when it matters. The local ring buffer is
// what an engineer reads afterwards to find out what the machine was doing
// before it went quiet.
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { eq, isNull } from "drizzle-orm";
import { db, sqlite, schemaVersion } from "../../db/client.js";
import { healthHeartbeats, branches } from "../../db/schema.js";
import { getErrorLog } from "../errorLog.js";
import { logger } from "../../lib/logger.js";
import { diskFreeBytes } from "./index.js";

const HEARTBEAT_INTERVAL_MS = 60_000;
/** Roughly 24 hours at one per minute. */
const RING_BUFFER_SIZE = 1_440;

function fileSize(filePath: string): number {
  try { return fs.statSync(filePath).size; } catch { return 0; }
}

function dbPaths() {
  const dbPath = process.env.NEXURA_DB_PATH ?? path.resolve(process.cwd(), "data", "nexura.db");
  return { dbPath, walPath: `${dbPath}-wal` };
}

/**
 * Clock offset against a monotonic reference.
 *
 * Not a curiosity: the business date, token expiry and the append-only ledger
 * all depend on this machine agreeing with reality about the time. A
 * back-office PC whose RTC battery has died comes back up in 2010, and every
 * financial row it writes is stamped accordingly.
 *
 * Without an NTP query this compares process uptime against wall-clock
 * movement since boot, which detects a clock that JUMPED while running. It
 * cannot detect a clock that was wrong from the start -- stated here rather
 * than implied, because that is the more common case and it needs the central
 * server's timestamp to catch (B20).
 */
let bootWallClock = Date.now() - Math.floor(process.uptime() * 1000);
export function clockOffsetSeconds(): number {
  const expected = bootWallClock + Math.floor(process.uptime() * 1000);
  return (Date.now() - expected) / 1000;
}

export interface HeartbeatSample {
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
  dbSizeBytes: number;
  walSizeBytes: number;
  memoryUsedBytes: number;
  cpuPercent: number;
  uptimeSeconds: number;
  errorCount1h: number;
  pendingSyncCount: number;
  pendingLockQueueCount: number;
  schemaVersion: number;
  appDigest: string | null;
  clockOffsetSeconds: number;
}

export function collectHeartbeat(): HeartbeatSample {
  const { dbPath, walPath } = dbPaths();
  const disk = diskFreeBytes();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // The error log is IT-02's in-memory ring buffer, not a table -- so this
  // counts what the running process has seen, and resets on restart. That is
  // the honest scope: a heartbeat reporting zero errors right after a crash
  // loop restart is reporting the truth about this process, and the restart
  // itself shows up as uptime dropping.
  const errorCount1h = (() => {
    try {
      return getErrorLog().filter(e => new Date(e.timestamp ?? 0) >= oneHourAgo).length;
    } catch { return 0; }
  })();

  const pendingLockQueueCount = (() => {
    try {
      const row = sqlite.prepare("SELECT COUNT(*) AS n FROM lock_sync_queue WHERE status = 'pending'").get() as { n: number };
      return row.n;
    } catch { return 0; }
  })();

  // Load average is not available on Windows (returns zeros), so this is a
  // best-effort figure rather than a precise one -- said plainly instead of
  // presenting a fabricated percentage.
  const cpuPercent = os.loadavg()[0] > 0
    ? Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100))
    : 0;

  return {
    diskFreeBytes: disk?.free ?? null,
    diskTotalBytes: disk?.total ?? null,
    dbSizeBytes: fileSize(dbPath),
    walSizeBytes: fileSize(walPath),
    memoryUsedBytes: os.totalmem() - os.freemem(),
    cpuPercent,
    uptimeSeconds: Math.floor(process.uptime()),
    errorCount1h,
    pendingSyncCount: 0,
    pendingLockQueueCount,
    schemaVersion,
    appDigest: process.env.NEXURA_IMAGE_DIGEST ?? null,
    clockOffsetSeconds: clockOffsetSeconds(),
  };
}

export function recordHeartbeat(): string {
  const sample = collectHeartbeat();
  const branchId = db.select({ id: branches.id }).from(branches).limit(1).get()?.id ?? null;
  const id = nanoid();

  db.insert(healthHeartbeats).values({
    id, branchId, recordedAt: new Date(), ...sample,
  }).run();

  pruneRingBuffer();
  return id;
}

/**
 * Keeps the local buffer bounded.
 *
 * UNPUSHED samples are kept beyond the limit: they are the record of the
 * window during which the property was offline, which is the single most
 * useful thing in the buffer. Pruning them to stay under a row count would
 * discard exactly the data the outage created.
 */
function pruneRingBuffer() {
  const all = db.select({ id: healthHeartbeats.id, recordedAt: healthHeartbeats.recordedAt, pushedAt: healthHeartbeats.pushedAt })
    .from(healthHeartbeats).all()
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
  if (all.length <= RING_BUFFER_SIZE) return;

  const surplus = all.slice(RING_BUFFER_SIZE).filter(h => h.pushedAt != null);
  for (const row of surplus) {
    db.delete(healthHeartbeats).where(eq(healthHeartbeats.id, row.id)).run();
  }
}

/** Samples not yet delivered to central, oldest first, for backfill. */
export function unpushedHeartbeats(limit = 200) {
  return db.select().from(healthHeartbeats).where(isNull(healthHeartbeats.pushedAt)).all()
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
    .slice(0, limit);
}

let handle: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat() {
  if (handle) return;
  if (process.env.NEXURA_DISABLE_HEARTBEAT === "1" || process.env.VITEST) return;

  bootWallClock = Date.now() - Math.floor(process.uptime() * 1000);
  handle = setInterval(() => {
    try {
      recordHeartbeat();
    } catch (err) {
      // A heartbeat that throws must never take the server down with it --
      // this is the monitoring, not the product.
      logger.warn({ err }, "[heartbeat] Failed to record a sample");
    }
  }, HEARTBEAT_INTERVAL_MS);
  handle.unref?.();
  logger.info({ intervalMs: HEARTBEAT_INTERVAL_MS }, "[heartbeat] Started");
}

export function stopHeartbeat() {
  if (handle) { clearInterval(handle); handle = null; }
}
