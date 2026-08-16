// Backend Blueprint B1 — versioned migrations, replacing init.sql + the
// ad-hoc `columnDefaults` self-healer.
//
// WHY A CUSTOM RUNNER RATHER THAN drizzle-kit's MIGRATOR. Drizzle's migrator
// applies pending SQL and records a journal; it does not do the three things
// this deployment actually needs, all of which come from shipping to
// unattended offline properties with nobody on site:
//   * refuse to start against a schema newer than the binary (a rolled-back
//     container must not quietly run against a future DB and corrupt it),
//   * take a pre-migration snapshot and stage a restore if a migration
//     fails,
//   * baseline an existing database that predates migrations entirely.
// `drizzle-kit generate` is still configured (drizzle.config.ts) for
// *authoring* new migrations; this file is what applies them.
//
// FILES. src/db/migrations/NNNN_name.sql, applied in numeric order. Resolved
// from process.cwd() rather than __dirname, matching the existing init.sql
// convention, so the same path works under `tsx watch src/index.ts` and the
// compiled `node dist/index.js` (tsc does not copy .sql into dist/).
import type BetterSqlite3 from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger.js";

export class FutureSchemaError extends Error {
  constructor(public readonly dbVersion: number, public readonly binaryVersion: number) {
    super(
      `Database schema version ${dbVersion} is newer than this build knows about (max ${binaryVersion}). ` +
      `This almost always means the application was rolled back to an older version while the database ` +
      `stayed migrated. Refusing to start: running against a future schema risks silent data corruption. ` +
      `Either deploy a build at or above version ${dbVersion}, or restore a pre-upgrade snapshot.`,
    );
    this.name = "FutureSchemaError";
  }
}

export class ChecksumMismatchError extends Error {
  constructor(version: number, name: string) {
    super(
      `Migration ${version} (${name}) has been modified since it was applied to this database. ` +
      `Applied migrations are immutable -- editing one means databases in the field silently disagree ` +
      `about their schema. Revert the file and add a new migration instead.`,
    );
    this.name = "ChecksumMismatchError";
  }
}

export class MigrationFailedError extends Error {
  constructor(version: number, name: string, public readonly cause: unknown, public readonly snapshotPath: string | null) {
    super(
      `Migration ${version} (${name}) failed: ${cause instanceof Error ? cause.message : String(cause)}. ` +
      `The transaction was rolled back, so the database remains at the previous version.` +
      (snapshotPath ? ` A pre-migration snapshot was staged for restore: ${snapshotPath}` : ""),
    );
    this.name = "MigrationFailedError";
  }
}

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationOutcome {
  currentVersion: number;
  appliedNow: number[];
  baselined: boolean;
  snapshotPath: string | null;
}

const MIGRATIONS_DIR = () => path.resolve(process.cwd(), "src/db/migrations");

function checksumOf(sql: string): string {
  // Normalise line endings so a git checkout with different autocrlf
  // settings doesn't read as tampering.
  return crypto.createHash("sha256").update(sql.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export function loadMigrations(dir = MIGRATIONS_DIR()): MigrationFile[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const migrations = files.map(file => {
    const match = /^(\d+)_(.+)\.sql$/.exec(file);
    if (!match) throw new Error(`Migration file name must be NNNN_name.sql, got: ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    return { version: Number(match[1]), name: match[2], sql, checksum: checksumOf(sql) };
  }).sort((a, b) => a.version - b.version);

  const seen = new Set<number>();
  for (const m of migrations) {
    if (seen.has(m.version)) throw new Error(`Duplicate migration version ${m.version}`);
    seen.add(m.version);
  }
  return migrations;
}

function ensureMigrationsTable(sqlite: BetterSqlite3.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  INTEGER NOT NULL,
      checksum    TEXT NOT NULL,
      duration_ms INTEGER
    );
  `);
}

/** True if this database already has application tables from the pre-migration init.sql era. */
function looksLikeExistingDatabase(sqlite: BetterSqlite3.Database): boolean {
  const row = sqlite.prepare(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'`,
  ).get() as { n: number };
  return row.n > 0;
}

// The retired self-healer, preserved for exactly one purpose: a database
// created before the migration system may be missing columns that later
// edits to init.sql introduced, because CREATE TABLE IF NOT EXISTS never
// adds columns to an existing table. Baselining such a database asserts it
// matches 0001, so this runs once during that adoption to make the assertion
// true. It is NOT part of the boot path any more -- after baselining, schema
// changes only ever arrive as numbered migrations.
const LEGACY_COLUMN_BACKFILL: Record<string, Record<string, string>> = {
  rooms: {
    housekeeping_status: "TEXT NOT NULL DEFAULT 'clean'",
    assigned_attendant_id: "TEXT REFERENCES users(id)",
    priority: "INTEGER NOT NULL DEFAULT 0",
    dnd: "INTEGER NOT NULL DEFAULT 0",
  },
  reservations: { disputed: "INTEGER NOT NULL DEFAULT 0" },
  users: {
    employee_id: "TEXT", department: "TEXT", phone: "TEXT",
    emergency_contact_name: "TEXT", emergency_contact_phone: "TEXT",
    start_date: "INTEGER", pay_rate: "REAL", contract_type: "TEXT",
  },
  guests: { nationality: "TEXT" },
  branches: {
    address: "TEXT", contact_phone: "TEXT", contact_email: "TEXT",
    check_in_time: "TEXT NOT NULL DEFAULT '14:00'",
    check_out_time: "TEXT NOT NULL DEFAULT '11:00'",
    currency: "TEXT NOT NULL DEFAULT 'NGN'",
    timezone: "TEXT NOT NULL DEFAULT 'Africa/Lagos'",
    tax_name: "TEXT NOT NULL DEFAULT 'VAT'",
    tax_rate: "REAL NOT NULL DEFAULT 7.5",
    tax_inclusive: "INTEGER NOT NULL DEFAULT 0",
    rate_rounding: "INTEGER NOT NULL DEFAULT 0",
    discount_approval_threshold: "REAL NOT NULL DEFAULT 0",
    enabled_modules_json: "TEXT NOT NULL DEFAULT '[\"restaurant\",\"inventory\",\"multiBranch\",\"doorLock\"]'",
  },
  sync_state: {
    update_channel: "TEXT",
    force_update_requested: "INTEGER NOT NULL DEFAULT 0",
    rollback_to_version: "TEXT",
    last_update_check_at: "INTEGER",
    last_update_status: "TEXT",
    last_update_error: "TEXT",
  },
};

function reconcileLegacyColumns(sqlite: BetterSqlite3.Database): void {
  const tables = new Set(
    (sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(t => t.name),
  );
  for (const [table, columns] of Object.entries(LEGACY_COLUMN_BACKFILL)) {
    if (!tables.has(table)) continue;
    const existing = new Set((sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(c => c.name));
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing.has(column)) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        logger.warn({ table, column }, "[migrate] Baseline reconciliation added a column missing from a pre-migration database");
      }
    }
  }
}

/**
 * Pre-migration snapshot via VACUUM INTO, which is safe against a live WAL
 * connection (unlike copying the file). Returns the snapshot path, or null
 * if a snapshot was not taken or failed.
 *
 * A failure here is deliberately non-fatal: refusing to migrate because the
 * safety net could not be written would strand the property on an old
 * schema, which is worse than migrating without one. It is logged loudly.
 */
function takePreMigrationSnapshot(sqlite: BetterSqlite3.Database, dbPath: string, targetVersion: number): string | null {
  try {
    const backupDir = path.resolve(process.cwd(), "data/backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const fileName = `pre-migration-v${targetVersion}-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
    const dest = path.join(backupDir, fileName);
    if (fs.existsSync(dest)) fs.unlinkSync(dest); // VACUUM INTO requires a non-existent target
    sqlite.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);

    // Record it in backup_snapshots so it shows up in IT-04 alongside manual
    // backups. Both branch_id and created_by are NOT NULL foreign keys and
    // this runs with no authenticated user, so the row is only written when
    // a branch and a user actually exist to satisfy them. The file on disk
    // is what recovery depends on; the row is for visibility, so skipping it
    // is not a failure. (B19 revisits this with a backup_kind column.)
    try {
      const branch = sqlite.prepare(`SELECT id FROM branches LIMIT 1`).get() as { id: string } | undefined;
      const user = sqlite.prepare(`SELECT id FROM users ORDER BY created_at LIMIT 1`).get() as { id: string } | undefined;
      if (branch && user) {
        sqlite.prepare(
          `INSERT INTO backup_snapshots (id, branch_id, file_name, size_bytes, type, status, created_by, created_at)
           VALUES (?, ?, ?, ?, 'local', 'completed', ?, ?)`,
        ).run(crypto.randomUUID(), branch.id, fileName, fs.statSync(dest).size, user.id, Date.now());
      }
    } catch (err) {
      logger.warn({ err }, "[migrate] Snapshot written but could not be recorded in backup_snapshots");
    }

    logger.info({ snapshot: dest, targetVersion }, "[migrate] Pre-migration snapshot created");
    return dest;
  } catch (err) {
    logger.error({ err }, "[migrate] Could not create pre-migration snapshot -- continuing without one");
    return null;
  }
}

export function currentSchemaVersion(sqlite: BetterSqlite3.Database): number {
  try {
    const row = sqlite.prepare(`SELECT MAX(version) AS v FROM schema_migrations`).get() as { v: number | null };
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

export function runMigrations(
  sqlite: BetterSqlite3.Database,
  dbPath: string,
  // Injectable so tests can drive the runner with fixture migrations
  // (including a deliberately failing one) instead of the real schema.
  options: { migrationsDir?: string } = {},
): MigrationOutcome {
  const migrations = loadMigrations(options.migrationsDir ?? MIGRATIONS_DIR());
  if (migrations.length === 0) {
    logger.warn("[migrate] No migration files found");
    return { currentVersion: 0, appliedNow: [], baselined: false, snapshotPath: null };
  }

  const isPreExisting = looksLikeExistingDatabase(sqlite);
  ensureMigrationsTable(sqlite);

  const applied = sqlite.prepare(`SELECT version, name, checksum FROM schema_migrations ORDER BY version`).all() as
    { version: number; name: string; checksum: string }[];
  const appliedByVersion = new Map(applied.map(a => [a.version, a]));
  const maxKnown = migrations[migrations.length - 1].version;
  const maxApplied = applied.length > 0 ? Math.max(...applied.map(a => a.version)) : 0;

  // Step 2: never operate against a future schema.
  if (maxApplied > maxKnown) throw new FutureSchemaError(maxApplied, maxKnown);

  // Immutability check on everything already applied.
  for (const m of migrations) {
    const record = appliedByVersion.get(m.version);
    if (record && record.checksum !== m.checksum) throw new ChecksumMismatchError(m.version, m.name);
  }

  // Baseline adoption: a database that already has tables but no migration
  // history was built by the old init.sql path. Record 0001 as applied
  // WITHOUT executing it -- its tables already exist -- after one final
  // reconciliation of columns that later init.sql edits had introduced.
  let baselined = false;
  if (applied.length === 0 && isPreExisting) {
    const baseline = migrations[0];
    reconcileLegacyColumns(sqlite);
    sqlite.prepare(
      `INSERT INTO schema_migrations (version, name, applied_at, checksum, duration_ms) VALUES (?, ?, ?, ?, ?)`,
    ).run(baseline.version, baseline.name, Date.now(), baseline.checksum, 0);
    appliedByVersion.set(baseline.version, { version: baseline.version, name: baseline.name, checksum: baseline.checksum });
    baselined = true;
    logger.info({ version: baseline.version }, "[migrate] Existing database baselined at migration 0001 (not re-executed)");
  }

  const pending = migrations.filter(m => !appliedByVersion.has(m.version));
  if (pending.length === 0) {
    const version = currentSchemaVersion(sqlite);
    logger.info({ schemaVersion: version }, "[migrate] Schema up to date");
    return { currentVersion: version, appliedNow: [], baselined, snapshotPath: null };
  }

  // Step 3: snapshot before touching anything -- but only when there is data
  // to lose. A brand-new database has nothing worth a snapshot, and the
  // backup_snapshots table it would be recorded in does not exist yet.
  const targetVersion = pending[pending.length - 1].version;
  const snapshotPath = isPreExisting ? takePreMigrationSnapshot(sqlite, dbPath, targetVersion) : null;

  // Step 4: each migration in its own transaction, with its
  // schema_migrations row committed atomically alongside its DDL. SQLite
  // makes DDL transactional, so a mid-migration failure leaves no partial
  // schema.
  for (const migration of pending) {
    const startedAt = Date.now();
    try {
      sqlite.exec("BEGIN");
      sqlite.exec(migration.sql);
      sqlite.prepare(
        `INSERT INTO schema_migrations (version, name, applied_at, checksum, duration_ms) VALUES (?, ?, ?, ?, ?)`,
      ).run(migration.version, migration.name, Date.now(), migration.checksum, Date.now() - startedAt);
      sqlite.exec("COMMIT");
      logger.info({ version: migration.version, name: migration.name, durationMs: Date.now() - startedAt }, "[migrate] Applied migration");
    } catch (err) {
      try { sqlite.exec("ROLLBACK"); } catch { /* already rolled back */ }

      // Step 5: stage the snapshot for restore on next boot, via the same
      // marker mechanism IT-04 restore uses (see db/client.ts). The
      // transaction already rolled back, so this is belt-and-braces against
      // a migration that managed something non-transactional.
      if (snapshotPath && fs.existsSync(snapshotPath)) {
        try {
          fs.writeFileSync(`${dbPath}.pending-restore`, snapshotPath, "utf8");
          logger.error({ snapshotPath }, "[migrate] Staged pre-migration snapshot for restore on next boot");
        } catch (markerErr) {
          logger.error({ err: markerErr }, "[migrate] Could not stage restore marker");
        }
      }
      throw new MigrationFailedError(migration.version, migration.name, err, snapshotPath);
    }
  }

  const currentVersion = currentSchemaVersion(sqlite);
  return { currentVersion, appliedNow: pending.map(m => m.version), baselined, snapshotPath };
}
