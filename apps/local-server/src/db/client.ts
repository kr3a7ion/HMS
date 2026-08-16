import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema.js";
import { logger } from "../lib/logger.js";
import { runMigrations } from "./migrate.js";
import { SYSTEM_ROLE_SEED } from "../auth/permissionKeys.js";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// NEXURA_DB_PATH lets tests point at an isolated file instead of the real
// dev database (server/data/nexura.db) that a running `npm run dev` / the
// seed script would also have open.
const dbPath = process.env.NEXURA_DB_PATH ?? path.join(dataDir, "nexura.db");

// IT-04 Restore. A running process can't safely swap its own open SQLite
// file mid-request, so POST /admin/backups/:id/restore only stages this
// marker (see routes/admin.ts) -- applying it is the very first thing the
// next boot does, before the live connection below is ever opened.
const pendingRestoreMarker = `${dbPath}.pending-restore`;
let restoredFileName: string | null = null;
if (fs.existsSync(pendingRestoreMarker)) {
  const snapshotPath = fs.readFileSync(pendingRestoreMarker, "utf8").trim();
  if (fs.existsSync(snapshotPath)) {
    for (const suffix of ["-wal", "-shm"]) {
      if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
    }
    fs.copyFileSync(snapshotPath, dbPath);
    restoredFileName = path.basename(snapshotPath);
    logger.info(`[db] Restored from snapshot: ${snapshotPath}`);
  } else {
    logger.error(`[db] Pending restore marker points at a missing snapshot: ${snapshotPath} -- skipping restore.`);
  }
  fs.unlinkSync(pendingRestoreMarker);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Backend Blueprint B1. Schema is now owned entirely by versioned
// migrations in src/db/migrations (see migrate.ts). init.sql no longer runs
// at boot -- it survives only as the frozen source of 0001_baseline.sql --
// and the old `columnDefaults` / PRAGMA table_info self-healer is gone: a
// database that silently repairs its own shape on boot can never be
// reasoned about, because no two properties are guaranteed to agree.
//
// This runs before drizzle opens over the connection, and after the restore
// marker above, so a staged restore is applied first and then migrated
// forward.
//
// A failure here is fatal by design. The alternative -- starting anyway --
// means serving a hotel from a database whose shape the code disagrees
// with, which is how you get silently wrong folio balances rather than an
// outage someone notices.
export let schemaVersion = 0;
try {
  const outcome = runMigrations(sqlite, dbPath);
  schemaVersion = outcome.currentVersion;
  if (outcome.appliedNow.length > 0) {
    logger.info({ applied: outcome.appliedNow, schemaVersion }, "[db] Migrations applied");
  }
} catch (err) {
  logger.fatal({ err }, "[db] FATAL: database migration failed -- refusing to start");
  // Also to stderr: if the failure is in the logger's own transport, or an
  // operator is reading raw container output, the pino line may not surface.
  console.error(`\n[db] FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}

// HR-03 Roles & Permissions. Bootstraps the 12 built-in roles (Blueprint
// 2.4) from permissionKeys.ts's SYSTEM_ROLE_SEED the first time this table
// is empty -- afterward, this row is the live, editable source of truth
// (HR-03's "Edit permissions" applies to built-in roles too), so this never
// overwrites an existing row, only fills in ones that are missing (e.g. a
// role added to SYSTEM_ROLE_SEED after a DB already exists).
const existingRoleIds = new Set(sqlite.prepare(`SELECT id FROM roles`).all().map((r: any) => r.id));
const insertRole = sqlite.prepare(`INSERT INTO roles (id, name, is_system_role, permissions_json, created_at) VALUES (?, ?, 1, ?, ?)`);
for (const [code, seed] of Object.entries(SYSTEM_ROLE_SEED)) {
  if (existingRoleIds.has(code)) continue;
  insertRole.run(code, seed.name, JSON.stringify(seed.permissions), Date.now());
  logger.info(`[db] Bootstrapped role: ${code} (${seed.name})`);
}

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Reflect the applied restore in backup_snapshots now that the table
// definitely exists (init.sql above just ran) and `db` is open.
if (restoredFileName) {
  sqlite.prepare(`UPDATE backup_snapshots SET status = 'restored', restored_at = ? WHERE file_name = ?`)
    .run(Date.now(), restoredFileName);
}
