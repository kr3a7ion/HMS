-- Central server bootstrap schema. Same "CREATE TABLE IF NOT EXISTS on
-- every boot" pattern as the local server -- see server/src/db/init.sql
-- for why this isn't a real migration tool yet.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'starter',
  billing_status TEXT NOT NULL DEFAULT 'current',
  enabled_modules_json TEXT NOT NULL DEFAULT '["restaurant","inventory","multiBranch","doorLock"]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  sync_key_hash TEXT NOT NULL,
  last_sync_at INTEGER,
  last_sync_status TEXT NOT NULL DEFAULT 'never',
  last_sync_error TEXT,
  created_at INTEGER NOT NULL,
  current_version TEXT,
  last_update_check_at INTEGER,
  last_update_status TEXT,
  update_channel TEXT NOT NULL DEFAULT 'stable',
  force_update_requested_at INTEGER,
  rollback_to_version TEXT
);
CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(organization_id);

CREATE TABLE IF NOT EXISTS org_users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_org_users_org ON org_users(organization_id);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  totp_secret TEXT,
  totp_enabled_at INTEGER
);

CREATE TABLE IF NOT EXISTS branch_snapshots (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  occupancy_rate REAL NOT NULL,
  revenue_today REAL NOT NULL,
  active_guests INTEGER NOT NULL,
  open_issues INTEGER NOT NULL,
  rooms_total INTEGER NOT NULL,
  adr REAL NOT NULL DEFAULT 0,
  revpar REAL NOT NULL DEFAULT 0,
  branch_manager_name TEXT,
  synced_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_branch_snapshots_branch ON branch_snapshots(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_snapshots_synced ON branch_snapshots(synced_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  organization_id TEXT,
  branch_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL
);

-- Same reasoning as the local server's init.sql: a genuine DB-level
-- append-only guarantee (fires regardless of code path), not just the
-- absence of an UPDATE/DELETE route against this table.
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
