import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema.js";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// NEXURA_CENTRAL_DB_PATH lets a future test suite point at an isolated
// file, same reasoning as the local server's NEXURA_DB_PATH.
const dbPath = process.env.NEXURA_CENTRAL_DB_PATH ?? path.join(dataDir, "central.db");
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const initSql = fs.readFileSync(path.resolve(process.cwd(), "src/db/init.sql"), "utf8");
sqlite.exec(initSql);

// Same self-healing migration pattern as the local server's db/client.ts:
// diff existing columns against what's expected and ALTER-in whatever's
// missing, with a safe default. Fine while the schema is still moving.
const columnDefaults: Record<string, Record<string, string>> = {
  branches: {
    current_version: "TEXT",
    last_update_check_at: "INTEGER",
    last_update_status: "TEXT",
    update_channel: "TEXT NOT NULL DEFAULT 'stable'",
    force_update_requested_at: "INTEGER",
    rollback_to_version: "TEXT",
  },
  admin_users: {
    totp_enabled_at: "INTEGER",
  },
};
for (const [table, columns] of Object.entries(columnDefaults)) {
  const existing = new Set(sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c: any) => c.name));
  for (const [column, definition] of Object.entries(columns)) {
    if (!existing.has(column)) {
      sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`[central-db] Migrated: added ${table}.${column}`);
    }
  }
}

export const db = drizzle(sqlite, { schema });
export { sqlite };
