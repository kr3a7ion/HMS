-- Migration 0005 -- business date and night audit.
--
-- Backend Blueprint B5 / invariant 9. Until now "today" meant wall-clock
-- date, which is wrong for a hotel: the trading day does not end at
-- midnight, it ends when the night audit says it does (typically ~03:00,
-- after the late bar closes and before the early breakfast shift). Every
-- financial row is stamped with that business date, so a charge posted at
-- 01:30 belongs to the previous trading day -- which is what makes a day's
-- revenue total reproducible.

-- ─── branches: the business date lives per property ──────────────────────
-- Backfilled to today's UTC date; from here it only ever advances when the
-- night audit rolls it.
ALTER TABLE branches ADD COLUMN current_business_date INTEGER NOT NULL DEFAULT 0;
UPDATE branches SET current_business_date = CAST(strftime('%s', date('now')) AS INTEGER);

-- Local hour the trading day rolls at. 3am is the usual choice.
ALTER TABLE branches ADD COLUMN business_date_roll_hour INTEGER NOT NULL DEFAULT 3;
ALTER TABLE branches ADD COLUMN last_audit_run_id TEXT;

-- ─── night_audit_runs: one row per attempt, resumable ────────────────────
-- steps_json is what makes a run resumable: each step records its own
-- completion, so a re-run after a failure skips what already succeeded
-- rather than double-posting.
CREATE TABLE IF NOT EXISTS night_audit_runs (
  id               TEXT PRIMARY KEY,
  branch_id        TEXT NOT NULL REFERENCES branches(id),
  business_date    INTEGER NOT NULL,
  status           TEXT NOT NULL,          -- running|completed|failed|rolled_back
  started_at       INTEGER NOT NULL,
  completed_at     INTEGER,
  operator_user_id TEXT REFERENCES users(id),   -- null when run by the scheduler
  steps_json       TEXT NOT NULL DEFAULT '[]',
  totals_json      TEXT,
  exceptions_json  TEXT NOT NULL DEFAULT '[]',
  error            TEXT
);
CREATE INDEX IF NOT EXISTS idx_night_audit_runs_branch_date ON night_audit_runs(branch_id, business_date);

-- ─── daily_revenue: the frozen day ───────────────────────────────────────
-- Immutable once written. Every report reads from here rather than
-- recomputing over live transactional rows -- that is what makes running
-- last month's report today give the same numbers it gave last month.
--
-- `superseded_by_run_id` is how a reopened day is handled: the original row
-- is kept and marked, never deleted, same append-only discipline as B4.
CREATE TABLE IF NOT EXISTS daily_revenue (
  id                    TEXT PRIMARY KEY,
  branch_id             TEXT NOT NULL REFERENCES branches(id),
  business_date         INTEGER NOT NULL,
  rooms_occupied        INTEGER NOT NULL DEFAULT 0,
  rooms_available       INTEGER NOT NULL DEFAULT 0,
  rooms_ooo             INTEGER NOT NULL DEFAULT 0,
  room_revenue_kobo     INTEGER NOT NULL DEFAULT 0,
  fnb_revenue_kobo      INTEGER NOT NULL DEFAULT 0,
  other_revenue_kobo    INTEGER NOT NULL DEFAULT 0,
  total_revenue_kobo    INTEGER NOT NULL DEFAULT 0,
  tax_collected_kobo    INTEGER NOT NULL DEFAULT 0,
  adr_kobo              INTEGER NOT NULL DEFAULT 0,
  revpar_kobo           INTEGER NOT NULL DEFAULT 0,
  occupancy_bp          INTEGER NOT NULL DEFAULT 0,   -- basis points: 75.5% = 7550
  arrivals              INTEGER NOT NULL DEFAULT 0,
  departures            INTEGER NOT NULL DEFAULT 0,
  no_shows              INTEGER NOT NULL DEFAULT 0,
  walk_ins              INTEGER NOT NULL DEFAULT 0,
  discounts_kobo        INTEGER NOT NULL DEFAULT 0,
  comps_kobo            INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  night_audit_run_id    TEXT REFERENCES night_audit_runs(id),
  superseded_by_run_id  TEXT REFERENCES night_audit_runs(id),
  UNIQUE (branch_id, business_date, superseded_by_run_id)
);
CREATE INDEX IF NOT EXISTS idx_daily_revenue_branch_date ON daily_revenue(branch_id, business_date);

-- ─── no_show_postings ────────────────────────────────────────────────────
-- penalty_charge_id is nullable: the penalty amount comes from the
-- cancellation policy engine, which is B9. Until then a no-show is recorded
-- (which is the part that matters for occupancy and for the guest's
-- history) with no penalty attached, rather than inventing a number.
CREATE TABLE IF NOT EXISTS no_show_postings (
  id                TEXT PRIMARY KEY,
  reservation_id    TEXT NOT NULL REFERENCES reservations(id),
  business_date     INTEGER NOT NULL,
  penalty_charge_id TEXT REFERENCES folio_charges(id),
  posted_at         INTEGER NOT NULL,
  posted_by         TEXT REFERENCES users(id),
  UNIQUE (reservation_id, business_date)
);

-- daily_revenue is frozen: correcting a day means reopening it, which
-- supersedes the row rather than editing it. Same reasoning as B4's ledger
-- triggers -- a report you can quietly rewrite is not a record.
DROP TRIGGER IF EXISTS daily_revenue_no_update;
CREATE TRIGGER daily_revenue_no_update
BEFORE UPDATE ON daily_revenue
WHEN OLD.superseded_by_run_id IS NOT NULL
  OR NEW.total_revenue_kobo <> OLD.total_revenue_kobo
  OR NEW.business_date <> OLD.business_date
BEGIN
  SELECT RAISE(ABORT, 'daily_revenue is frozen: reopen the day to supersede it, do not edit');
END;

DROP TRIGGER IF EXISTS daily_revenue_no_delete;
CREATE TRIGGER daily_revenue_no_delete
BEFORE DELETE ON daily_revenue
BEGIN
  SELECT RAISE(ABORT, 'daily_revenue is frozen: reopen the day to supersede it, do not delete');
END;
