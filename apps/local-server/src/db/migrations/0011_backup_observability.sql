-- Migration 0011 -- survivable backups and knowing when a property is down.
--
-- Backend Blueprint B19. Two failures this addresses, both of which end with
-- a hotel losing its data and nobody having noticed in time:
--
--   1. AN UNTESTED BACKUP IS NOT A BACKUP. The existing snapshots were a
--      file copy with a size recorded next to them. Nothing verified the file
--      was readable, nothing checked it had not been truncated by a full
--      disk, and nothing had ever restored one. A property discovers that on
--      the morning it needs one.
--
--   2. A DEAD PROPERTY IS SILENT. There was no heartbeat, so a branch whose
--      server died at 02:00 looked exactly like a branch that was simply
--      quiet. The absence of data is the alert, which means the alert has to
--      be driven by expected-and-missing, not by an error arriving.

-- ─── backup_snapshots: from "a file exists" to "a restore is known to work" ──
--
-- created_by must become NULLABLE first. It was NOT NULL because every backup
-- was taken by a person clicking a button; a SCHEDULED backup has no operator
-- behind it, and inventing a fake user id to satisfy the constraint would put
-- a fiction in the audit trail. SQLite cannot drop a NOT NULL in place, so the
-- table is rebuilt -- copying the rows, not discarding them.
CREATE TABLE backup_snapshots_new (
  id          TEXT PRIMARY KEY,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  file_name   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  type        TEXT NOT NULL DEFAULT 'local',
  status      TEXT NOT NULL DEFAULT 'completed',
  created_by  TEXT REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  restored_at INTEGER
);
INSERT INTO backup_snapshots_new (id, branch_id, file_name, size_bytes, type, status, created_by, created_at, restored_at)
SELECT id, branch_id, file_name, size_bytes, type, status, created_by, created_at, restored_at FROM backup_snapshots;
DROP TABLE backup_snapshots;
ALTER TABLE backup_snapshots_new RENAME TO backup_snapshots;

ALTER TABLE backup_snapshots ADD COLUMN encryption_algorithm TEXT;
-- The integrity check. Computed over the PLAINTEXT snapshot before
-- encryption, so it verifies the database, not the envelope.
ALTER TABLE backup_snapshots ADD COLUMN checksum_sha256 TEXT;
ALTER TABLE backup_snapshots ADD COLUMN offsite_status TEXT NOT NULL DEFAULT 'not_configured';
                            -- not_configured|pending|synced|failed
ALTER TABLE backup_snapshots ADD COLUMN offsite_synced_at INTEGER;
ALTER TABLE backup_snapshots ADD COLUMN retention_expires_at INTEGER;
ALTER TABLE backup_snapshots ADD COLUMN backup_kind TEXT NOT NULL DEFAULT 'manual';
                            -- scheduled|manual|pre_migration
-- The three columns that turn a hopeful file into a verified one.
ALTER TABLE backup_snapshots ADD COLUMN restore_test_at INTEGER;
ALTER TABLE backup_snapshots ADD COLUMN restore_test_result TEXT;  -- passed|failed
ALTER TABLE backup_snapshots ADD COLUMN restore_test_detail TEXT;

CREATE INDEX IF NOT EXISTS idx_backup_snapshots_kind ON backup_snapshots(backup_kind, created_at);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_retention ON backup_snapshots(retention_expires_at);

-- ─── health_heartbeats: a local ring buffer, also pushed to central ──────
-- Kept LOCALLY as well as pushed, deliberately: the moment central most wants
-- this data is when the uplink is down, and a metric that only exists once
-- it has been successfully transmitted is missing exactly when it matters.
-- The local buffer is what an engineer reads after the fact to find out what
-- the machine was doing before it stopped talking.
CREATE TABLE IF NOT EXISTS health_heartbeats (
  id                      TEXT PRIMARY KEY,
  branch_id               TEXT REFERENCES branches(id),
  recorded_at             INTEGER NOT NULL,
  disk_free_bytes         INTEGER,
  disk_total_bytes        INTEGER,
  db_size_bytes           INTEGER,
  wal_size_bytes          INTEGER,
  memory_used_bytes       INTEGER,
  cpu_percent             REAL,
  uptime_seconds          INTEGER,
  error_count_1h          INTEGER NOT NULL DEFAULT 0,
  pending_sync_count      INTEGER NOT NULL DEFAULT 0,
  pending_lock_queue_count INTEGER NOT NULL DEFAULT 0,
  schema_version          INTEGER,
  app_digest              TEXT,
  -- Clock drift is not a curiosity here: the business date, token expiry and
  -- the append-only ledger all depend on this machine agreeing with reality
  -- about what time it is.
  clock_offset_seconds    REAL,
  -- Whether this sample was successfully pushed to central, so a reconnecting
  -- branch can backfill rather than losing the window it was offline for.
  pushed_at               INTEGER
);
CREATE INDEX IF NOT EXISTS idx_health_heartbeats_recorded ON health_heartbeats(recorded_at);
CREATE INDEX IF NOT EXISTS idx_health_heartbeats_unpushed ON health_heartbeats(pushed_at) WHERE pushed_at IS NULL;

-- ─── Operational thresholds, per branch ─────────────────────────────────
-- Disk headroom is a real failure mode, not a theoretical one: WAL plus a
-- month of snapshots on the small SSD of a back-office PC fills up, and
-- SQLite's behaviour when it cannot write is to fail the transaction -- which
-- surfaces to a clerk as a check-in that will not save.
ALTER TABLE sync_state ADD COLUMN disk_warn_bytes INTEGER NOT NULL DEFAULT 2147483648;    -- 2 GiB
ALTER TABLE sync_state ADD COLUMN disk_block_bytes INTEGER NOT NULL DEFAULT 536870912;    -- 512 MiB
ALTER TABLE sync_state ADD COLUMN backup_retention_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE sync_state ADD COLUMN offsite_target TEXT;
ALTER TABLE sync_state ADD COLUMN last_restore_test_at INTEGER;
ALTER TABLE sync_state ADD COLUMN last_restore_test_result TEXT;
