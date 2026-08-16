// Backend Blueprint B1 — the five required migration-runner tests.
//
// These drive runMigrations() against fixture migration directories rather
// than the real schema, so a deliberately-failing migration can be exercised
// without a 623-line baseline in the way. The one case that cannot be tested
// in-process -- "refuses to start" -- is driven through a real subprocess,
// because asserting on a thrown error would prove nothing about whether the
// server actually exits non-zero.
import { test, describe, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

import {
  runMigrations, loadMigrations, currentSchemaVersion,
  FutureSchemaError, ChecksumMismatchError, MigrationFailedError,
} from "../db/migrate.js";

let tmpRoot: string;
let dbPath: string;
let migrationsDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nexura-mig-"));
  dbPath = path.join(tmpRoot, "test.db");
  migrationsDir = path.join(tmpRoot, "migrations");
  fs.mkdirSync(migrationsDir, { recursive: true });
});

afterEach(() => {
  // A test that throws mid-way leaves its handle open, and Windows refuses
  // to unlink an open file -- which would mask the real failure behind an
  // EBUSY from cleanup.
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort: the OS reclaims the temp dir */
  }
});

function writeMigration(version: number, name: string, sql: string) {
  fs.writeFileSync(path.join(migrationsDir, `${String(version).padStart(4, "0")}_${name}.sql`), sql, "utf8");
}

function openDb() {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("fresh database", () => {
  test("applies every migration and populates schema_migrations", () => {
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT);`);
    writeMigration(2, "add_gadgets", `CREATE TABLE gadgets (id TEXT PRIMARY KEY);`);

    const db = openDb();
    const outcome = runMigrations(db, dbPath, { migrationsDir });

    assert.deepEqual(outcome.appliedNow, [1, 2]);
    assert.equal(outcome.currentVersion, 2);
    assert.equal(outcome.baselined, false, "a fresh DB is not baselined, it is migrated");

    const rows = db.prepare(`SELECT version, name, checksum, duration_ms FROM schema_migrations ORDER BY version`).all() as any[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].version, 1);
    assert.equal(rows[0].name, "baseline");
    assert.ok(rows[0].checksum?.length === 64, "checksum should be a sha256 hex digest");
    assert.ok(typeof rows[0].duration_ms === "number");

    // The DDL really ran.
    const tables = new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map(t => t.name));
    assert.ok(tables.has("widgets") && tables.has("gadgets"));
    db.close();
  });

  test("no snapshot is taken for a fresh database -- there is nothing to lose", () => {
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY);`);
    const db = openDb();
    const outcome = runMigrations(db, dbPath, { migrationsDir });
    assert.equal(outcome.snapshotPath, null);
    db.close();
  });
});

describe("existing database", () => {
  test("is baselined without re-executing 0001, then applies only what is pending", () => {
    // Simulate the pre-migration world: tables exist, no schema_migrations.
    const seed = openDb();
    seed.exec(`CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT);`);
    seed.prepare(`INSERT INTO widgets (id, name) VALUES ('w1', 'existing row')`).run();
    seed.close();

    // 0001 would fail outright if it were re-executed (no IF NOT EXISTS),
    // which is exactly what proves baselining skipped it.
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT);`);
    writeMigration(2, "add_gadgets", `CREATE TABLE gadgets (id TEXT PRIMARY KEY);`);

    const db = openDb();
    const outcome = runMigrations(db, dbPath, { migrationsDir });

    assert.equal(outcome.baselined, true);
    assert.deepEqual(outcome.appliedNow, [2], "only the pending migration should run");
    assert.equal(outcome.currentVersion, 2);

    // Pre-existing data survived.
    const row = db.prepare(`SELECT name FROM widgets WHERE id = 'w1'`).get() as any;
    assert.equal(row.name, "existing row");
    db.close();
  });

  test("a second boot with nothing pending is a no-op", () => {
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY);`);
    const first = openDb();
    runMigrations(first, dbPath, { migrationsDir });
    first.close();

    const second = openDb();
    const outcome = runMigrations(second, dbPath, { migrationsDir });
    assert.deepEqual(outcome.appliedNow, []);
    assert.equal(outcome.currentVersion, 1);
    second.close();
  });
});

describe("failure handling", () => {
  test("a migration that throws leaves the database at the prior version with data intact", () => {
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT);`);
    const first = openDb();
    runMigrations(first, dbPath, { migrationsDir });
    first.prepare(`INSERT INTO widgets (id, name) VALUES ('w1', 'precious')`).run();
    first.close();

    // A migration that does real work and THEN fails, so a non-transactional
    // runner would leave the new table behind.
    writeMigration(2, "broken", `
      CREATE TABLE gadgets (id TEXT PRIMARY KEY);
      INSERT INTO gadgets (id) VALUES ('g1');
      THIS IS NOT VALID SQL;
    `);

    const db = openDb();
    assert.throws(
      () => runMigrations(db, dbPath, { migrationsDir }),
      (err: unknown) => err instanceof MigrationFailedError,
    );

    // Version unchanged.
    assert.equal(currentSchemaVersion(db), 1);
    // The failed migration's DDL was rolled back entirely.
    const tables = new Set((db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map(t => t.name));
    assert.ok(!tables.has("gadgets"), "partial DDL from the failed migration must not survive");
    // Existing data untouched.
    const row = db.prepare(`SELECT name FROM widgets WHERE id = 'w1'`).get() as any;
    assert.equal(row.name, "precious");
    db.close();
  });

  test("an applied migration that is later edited is rejected as tampering", () => {
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY);`);
    const first = openDb();
    runMigrations(first, dbPath, { migrationsDir });
    first.close();

    // Edit an already-applied migration.
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY, sneaky TEXT);`);

    const db = openDb();
    assert.throws(
      () => runMigrations(db, dbPath, { migrationsDir }),
      (err: unknown) => err instanceof ChecksumMismatchError,
    );
    db.close();
  });
});

describe("future schema guard", () => {
  test("a database migrated beyond what this build knows is refused", () => {
    writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY);`);
    writeMigration(2, "later", `CREATE TABLE gadgets (id TEXT PRIMARY KEY);`);
    const first = openDb();
    runMigrations(first, dbPath, { migrationsDir });
    first.close();

    // Simulate an application rollback: the binary now only knows about 0001.
    fs.unlinkSync(path.join(migrationsDir, "0002_later.sql"));

    const db = openDb();
    assert.throws(
      () => runMigrations(db, dbPath, { migrationsDir }),
      (err: unknown) => err instanceof FutureSchemaError && err.dbVersion === 2 && err.binaryVersion === 1,
    );
    db.close();
  });

  test("the server process actually exits non-zero rather than serving against a future schema", () => {
    // The in-process test above proves the throw; this proves db/client.ts
    // turns that into a refusal to start. Asserting only on the throw would
    // miss a regression where the catch block logs and continues.
    const realDbPath = path.join(tmpRoot, "real.db");
    const bootScript = path.join(tmpRoot, "boot.mts");
    // pathToFileURL, not a raw path: on Windows a dynamic import of
    // "c:\..." is rejected by the ESM loader as an unsupported URL scheme.
    const clientUrl = pathToFileURL(path.resolve("src/db/client.ts")).href;
    fs.writeFileSync(bootScript, `await import(${JSON.stringify(clientUrl)});\n`, "utf8");

    // First boot: build a real database at the current schema version.
    execFileSync("npx", ["tsx", bootScript], {
      env: { ...process.env, NEXURA_DB_PATH: realDbPath },
      stdio: "pipe", shell: true, timeout: 120_000,
    });

    // Forge a schema_migrations row far beyond any real migration.
    const forge = new Database(realDbPath);
    forge.prepare(
      `INSERT INTO schema_migrations (version, name, applied_at, checksum, duration_ms) VALUES (?, ?, ?, ?, ?)`,
    ).run(9999, "from_the_future", Date.now(), crypto.randomBytes(32).toString("hex"), 0);
    forge.close();

    let exitCode = 0;
    let output = "";
    try {
      execFileSync("npx", ["tsx", bootScript], {
        env: { ...process.env, NEXURA_DB_PATH: realDbPath },
        stdio: "pipe", shell: true, timeout: 120_000,
      });
    } catch (err: any) {
      exitCode = err.status ?? -1;
      output = `${err.stdout?.toString() ?? ""}${err.stderr?.toString() ?? ""}`;
    }

    assert.notEqual(exitCode, 0, "boot must exit non-zero against a future schema");
    assert.match(output, /newer than this build/i);
  }, 240_000);
});

describe("pre-migration snapshot", () => {
  test("is created before a migration runs against a database that has data", () => {
    // Snapshots land in <cwd>/data/backups, so run from a scratch cwd to
    // avoid writing into the real data directory.
    const originalCwd = process.cwd();
    const scratchCwd = path.join(tmpRoot, "cwd");
    fs.mkdirSync(scratchCwd, { recursive: true });
    process.chdir(scratchCwd);
    try {
      writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY, name TEXT);`);
      const first = openDb();
      runMigrations(first, dbPath, { migrationsDir });
      first.prepare(`INSERT INTO widgets (id, name) VALUES ('w1', 'precious')`).run();
      first.close();

      writeMigration(2, "add_gadgets", `CREATE TABLE gadgets (id TEXT PRIMARY KEY);`);
      const db = openDb();
      const outcome = runMigrations(db, dbPath, { migrationsDir });
      db.close();

      assert.ok(outcome.snapshotPath, "a snapshot should be taken when there is data to lose");
      assert.ok(fs.existsSync(outcome.snapshotPath!), "snapshot file should exist on disk");
      assert.match(path.basename(outcome.snapshotPath!), /^pre-migration-v2-/, "snapshot should name the target version");

      // The snapshot is a real, readable database holding the pre-migration
      // state -- not just an empty file.
      const snap = new Database(outcome.snapshotPath!, { readonly: true });
      const row = snap.prepare(`SELECT name FROM widgets WHERE id = 'w1'`).get() as any;
      assert.equal(row.name, "precious");
      const snapTables = new Set((snap.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[]).map(t => t.name));
      assert.ok(!snapTables.has("gadgets"), "snapshot must predate the migration");
      snap.close();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test("a failed migration stages the snapshot for restore on the next boot", () => {
    const originalCwd = process.cwd();
    const scratchCwd = path.join(tmpRoot, "cwd2");
    fs.mkdirSync(scratchCwd, { recursive: true });
    process.chdir(scratchCwd);
    try {
      writeMigration(1, "baseline", `CREATE TABLE widgets (id TEXT PRIMARY KEY);`);
      const first = openDb();
      runMigrations(first, dbPath, { migrationsDir });
      first.prepare(`INSERT INTO widgets (id) VALUES ('w1')`).run();
      first.close();

      writeMigration(2, "broken", `THIS IS NOT VALID SQL;`);
      const db = openDb();
      assert.throws(() => runMigrations(db, dbPath, { migrationsDir }));
      db.close();

      const marker = `${dbPath}.pending-restore`;
      assert.ok(fs.existsSync(marker), "a failed migration should stage a restore marker");
      const staged = fs.readFileSync(marker, "utf8").trim();
      assert.ok(fs.existsSync(staged), "the staged snapshot path should point at a real file");
      assert.match(path.basename(staged), /^pre-migration-v2-/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});

describe("0002_money_kobo backfill (Backend Blueprint B2)", () => {
  test("converts every money column from naira floats to exact integer kobo", () => {
    // Runs the REAL 0001 + 0002 against a seeded database with known values,
    // rather than fixture SQL -- the point is to prove the shipped migration
    // is correct, including the float values that motivated the batch.
    const realMigrations = path.resolve("src/db/migrations");
    const db = openDb();

    const baseline = fs.readFileSync(path.join(realMigrations, "0001_baseline.sql"), "utf8");
    db.exec(baseline);

    db.prepare(`INSERT INTO organizations (id,name,created_at) VALUES ('o1','H',1)`).run();
    db.prepare(
      `INSERT INTO branches (id,organization_id,name,created_at,tax_rate,discount_approval_threshold)
       VALUES ('b1','o1','Main',1,7.5,5000.50)`,
    ).run();
    db.prepare(
      `INSERT INTO users (id,organization_id,branch_id,email,password_hash,role,first_name,last_name,status,created_at,pay_rate)
       VALUES ('u1','o1','b1','a@b.co','h','ORG','A','B','active',1,250000.75)`,
    ).run();
    // A second user with NULL pay_rate: nullable columns must stay null, not
    // become 0, or "no pay rate on file" silently turns into "paid nothing".
    db.prepare(
      `INSERT INTO users (id,organization_id,branch_id,email,password_hash,role,first_name,last_name,status,created_at)
       VALUES ('u2','o1','b1','c@d.co','h','FD','C','D','active',1)`,
    ).run();
    db.prepare(`INSERT INTO guests (id,branch_id,first_name,last_name,vip,blacklisted,created_at) VALUES ('g1','b1','G','X',0,0,1)`).run();
    db.prepare(
      `INSERT INTO reservations (id,branch_id,guest_id,check_in_date,check_out_date,rate,created_by,created_at)
       VALUES ('r1','b1','g1',1,2,19.99,'u1',1)`,
    ).run();
    db.prepare(
      `INSERT INTO folio_charges (id,reservation_id,category,description,quantity,unit_price,amount,posted_by,posted_at)
       VALUES ('f1','r1','Room','n',1,19.99,19.99,'u1',1)`,
    ).run();
    db.prepare(`INSERT INTO menu_categories (id,branch_id,name,sort_order) VALUES ('mc1','b1','Mains',0)`).run();
    db.prepare(`INSERT INTO menu_items (id,branch_id,category_id,name,price,available) VALUES ('m1','b1','mc1','Jollof',3500.25,1)`).run();

    db.exec("BEGIN");
    db.exec(fs.readFileSync(path.join(realMigrations, "0002_money_kobo.sql"), "utf8"));
    db.exec("COMMIT");

    const branch = db.prepare(`SELECT tax_rate_bp, discount_approval_threshold_kobo FROM branches`).get() as any;
    assert.equal(branch.tax_rate_bp, 750, "7.5% must become 750 basis points, not 750.00 kobo");
    assert.equal(branch.discount_approval_threshold_kobo, 500050, "₦5,000.50");

    const users = db.prepare(`SELECT id, pay_rate_kobo FROM users ORDER BY id`).all() as any[];
    assert.equal(users[0].pay_rate_kobo, 25000075, "₦250,000.75");
    assert.equal(users[1].pay_rate_kobo, null, "a NULL pay rate must stay NULL, not become 0");

    // 19.99 is the canonical float trap: 19.99 * 100 is 1998.9999999999998.
    assert.equal((db.prepare(`SELECT rate_kobo FROM reservations`).get() as any).rate_kobo, 1999);
    const charge = db.prepare(`SELECT unit_price_kobo, amount_kobo FROM folio_charges`).get() as any;
    assert.equal(charge.unit_price_kobo, 1999);
    assert.equal(charge.amount_kobo, 1999);
    assert.equal((db.prepare(`SELECT price_kobo FROM menu_items`).get() as any).price_kobo, 350025);

    // The old float columns must be gone, not left behind to drift.
    const columnsOf = (table: string) =>
      new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name));
    assert.ok(!columnsOf("branches").has("tax_rate"));
    assert.ok(!columnsOf("branches").has("discount_approval_threshold"));
    assert.ok(!columnsOf("users").has("pay_rate"));
    assert.ok(!columnsOf("reservations").has("rate"));
    assert.ok(!columnsOf("folio_charges").has("amount"));
    assert.ok(!columnsOf("folio_charges").has("unit_price"));
    assert.ok(!columnsOf("menu_items").has("price"));

    // Quantities are genuinely fractional and must NOT have been converted.
    assert.ok(columnsOf("products").has("current_stock"));
    assert.ok(!columnsOf("products").has("current_stock_kobo"));

    db.close();
  });

  test("leaves no real() money column behind in the shipped schema", () => {
    // Guards the B2 DoD directly against a future column being added as a
    // float. Reads the schema the migrations actually produce.
    const db = openDb();
    db.exec(fs.readFileSync(path.resolve("src/db/migrations/0001_baseline.sql"), "utf8"));
    db.exec(fs.readFileSync(path.resolve("src/db/migrations/0002_money_kobo.sql"), "utf8"));

    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as any[])
      .map(t => t.name);
    // "threshold" is deliberately absent: products.reorder_threshold is a
    // stock QUANTITY (reorder below N units), and the one money threshold --
    // branches.discount_approval_threshold -- now ends in _kobo and is an
    // INTEGER, so it cannot match this check anyway.
    const moneyish = /amount|price|cost|revenue|balance|payment|salary|pay_rate|adr|revpar|total/i;
    const offenders: string[] = [];
    for (const table of tables) {
      for (const col of db.prepare(`PRAGMA table_info(${table})`).all() as any[]) {
        if (col.type?.toUpperCase() === "REAL" && moneyish.test(col.name)) {
          offenders.push(`${table}.${col.name}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `money columns still stored as REAL: ${offenders.join(", ")}`);
    db.close();
  });
});

describe("migration file loading", () => {
  test("rejects a badly named migration file rather than silently skipping it", () => {
    fs.writeFileSync(path.join(migrationsDir, "oops.sql"), "SELECT 1;", "utf8");
    assert.throws(() => loadMigrations(migrationsDir), /NNNN_name\.sql/);
  });

  test("rejects duplicate version numbers", () => {
    writeMigration(1, "one", `CREATE TABLE a (id TEXT);`);
    fs.writeFileSync(path.join(migrationsDir, "0001_two.sql"), `CREATE TABLE b (id TEXT);`, "utf8");
    assert.throws(() => loadMigrations(migrationsDir), /Duplicate migration version/);
  });

  test("the real migrations directory loads and is ordered", () => {
    const real = loadMigrations();
    assert.ok(real.length >= 1, "there should be at least the baseline migration");
    assert.equal(real[0].version, 1);
    assert.equal(real[0].name, "baseline");
    for (let i = 1; i < real.length; i++) {
      assert.ok(real[i].version > real[i - 1].version, "migrations must load in ascending version order");
    }
  });
});
