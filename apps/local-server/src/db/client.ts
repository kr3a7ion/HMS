import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema.js";
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
    console.log(`[db] Restored from snapshot: ${snapshotPath}`);
  } else {
    console.error(`[db] Pending restore marker points at a missing snapshot: ${snapshotPath} -- skipping restore.`);
  }
  fs.unlinkSync(pendingRestoreMarker);
}

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Bootstrap schema on boot. See init.sql for why this isn't a Drizzle
// migration yet. Resolved from cwd (not __dirname) so this works both under
// `tsx watch src/index.ts` and the compiled `node dist/index.js` -- always
// run this server with `server/` as the working directory.
const initSql = fs.readFileSync(path.resolve(process.cwd(), "src/db/init.sql"), "utf8");
sqlite.exec(initSql);

// `CREATE TABLE IF NOT EXISTS` above is a no-op against a database that
// already has the table from an earlier boot -- it won't add columns a
// later schema change introduced. Self-heal by diffing each table's actual
// columns against what init.sql now expects and ALTER-ing in whatever's
// missing, with a sane default so existing rows stay valid. Same caveat as
// the rest of init.sql: fine while the schema is still moving, replace with
// real migrations once it stabilizes.
const columnDefaults: Record<string, Record<string, string>> = {
  rooms: {
    housekeeping_status: "TEXT NOT NULL DEFAULT 'clean'",
    assigned_attendant_id: "TEXT REFERENCES users(id)",
    priority: "INTEGER NOT NULL DEFAULT 0",
    dnd: "INTEGER NOT NULL DEFAULT 0",
  },
  reservations: {
    disputed: "INTEGER NOT NULL DEFAULT 0",
  },
  users: {
    employee_id: "TEXT",
    department: "TEXT",
    phone: "TEXT",
    emergency_contact_name: "TEXT",
    emergency_contact_phone: "TEXT",
    start_date: "INTEGER",
    pay_rate: "REAL",
    contract_type: "TEXT",
  },
  guests: {
    nationality: "TEXT",
  },
  branches: {
    address: "TEXT",
    contact_phone: "TEXT",
    contact_email: "TEXT",
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
for (const [table, columns] of Object.entries(columnDefaults)) {
  const existing = new Set(sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c: any) => c.name));
  for (const [column, definition] of Object.entries(columns)) {
    if (!existing.has(column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[db] Migrated: added ${table}.${column}`);
    }
  }
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
  console.log(`[db] Bootstrapped role: ${code} (${seed.name})`);
}

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Reflect the applied restore in backup_snapshots now that the table
// definitely exists (init.sql above just ran) and `db` is open.
if (restoredFileName) {
  sqlite.prepare(`UPDATE backup_snapshots SET status = 'restored', restored_at = ? WHERE file_name = ?`)
    .run(Date.now(), restoredFileName);
}
