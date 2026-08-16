-- Migration 0004 -- append-only financial ledger, voids and reversals.
--
-- Backend Blueprint B4 / invariant 4. folio_charges and payments become
-- immutable: a posted line is never updated or deleted, and a correction is
-- a NEW negative row pointing back at the original. That is what makes a
-- folio auditable -- the history of what was charged and then unwound is
-- recoverable, rather than being quietly overwritten.
--
-- The triggers at the bottom are the backstop. Application discipline is
-- not enough: the whole point of an append-only ledger is that even a bug,
-- a migration, or someone at a SQL prompt cannot rewrite history.

-- ─── folio_charges ───────────────────────────────────────────────────────
ALTER TABLE folio_charges ADD COLUMN reversal_of_id TEXT REFERENCES folio_charges(id);
ALTER TABLE folio_charges ADD COLUMN is_reversal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE folio_charges ADD COLUMN voided_at INTEGER;
ALTER TABLE folio_charges ADD COLUMN voided_by TEXT REFERENCES users(id);
ALTER TABLE folio_charges ADD COLUMN void_reason_code TEXT;
ALTER TABLE folio_charges ADD COLUMN void_reason_note TEXT;
-- How much of the original has been reversed so far, in kobo. Kept as a
-- running total so a partial void can be applied repeatedly without
-- re-summing reversals, and so "is this fully voided?" is a single read.
ALTER TABLE folio_charges ADD COLUMN reversed_amount_kobo INTEGER NOT NULL DEFAULT 0;

-- business_date is stamped on every financial row (invariant 9). B5 replaces
-- the derivation with the branch's real business date (which rolls at a
-- configured hour, not midnight); until then it is the UTC calendar date of
-- posting, which is the same thing for every hour except the small window
-- between midnight and the roll hour.
--
-- DEFAULT 0 rather than a plausible-looking value on purpose: 0 renders as
-- 1970-01-01, so a row the application forgot to stamp is obviously wrong
-- rather than silently attributed to today.
ALTER TABLE folio_charges ADD COLUMN business_date INTEGER NOT NULL DEFAULT 0;
UPDATE folio_charges
   SET business_date = CAST(strftime('%s', date(posted_at, 'unixepoch')) AS INTEGER);

CREATE INDEX IF NOT EXISTS idx_folio_charges_business_date ON folio_charges(business_date);
CREATE INDEX IF NOT EXISTS idx_folio_charges_reversal_of ON folio_charges(reversal_of_id);

-- ─── payments ────────────────────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN reversal_of_id TEXT REFERENCES payments(id);
ALTER TABLE payments ADD COLUMN is_reversal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN voided_at INTEGER;
ALTER TABLE payments ADD COLUMN voided_by TEXT REFERENCES users(id);
ALTER TABLE payments ADD COLUMN void_reason_code TEXT;
ALTER TABLE payments ADD COLUMN void_reason_note TEXT;
ALTER TABLE payments ADD COLUMN reversed_amount_kobo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN business_date INTEGER NOT NULL DEFAULT 0;
UPDATE payments
   SET business_date = CAST(strftime('%s', date(received_at, 'unixepoch')) AS INTEGER);

CREATE INDEX IF NOT EXISTS idx_payments_business_date ON payments(business_date);
CREATE INDEX IF NOT EXISTS idx_payments_reversal_of ON payments(reversal_of_id);

-- ─── Append-only triggers ────────────────────────────────────────────────
--
-- What an UPDATE is still allowed to do: stamp void metadata onto a line
-- that has not been voided yet, and bump reversed_amount_kobo. That is the
-- only legitimate mutation, and it is additive.
--
-- What it can never do: change the money (`amount_kobo`), or touch a row
-- that is already voided. The second half is what prevents un-voiding --
-- once a line is struck, the only way to change the guest's balance again
-- is another visible ledger row.
DROP TRIGGER IF EXISTS folio_charges_no_update;
CREATE TRIGGER folio_charges_no_update
BEFORE UPDATE ON folio_charges
WHEN OLD.voided_at IS NOT NULL OR NEW.amount_kobo <> OLD.amount_kobo
BEGIN
  SELECT RAISE(ABORT, 'folio_charges is append-only: posted amounts cannot change and voided lines cannot be edited');
END;

DROP TRIGGER IF EXISTS folio_charges_no_delete;
CREATE TRIGGER folio_charges_no_delete
BEFORE DELETE ON folio_charges
BEGIN
  SELECT RAISE(ABORT, 'folio_charges is append-only: post a reversal instead of deleting');
END;

DROP TRIGGER IF EXISTS payments_no_update;
CREATE TRIGGER payments_no_update
BEFORE UPDATE ON payments
WHEN OLD.voided_at IS NOT NULL OR NEW.amount_kobo <> OLD.amount_kobo
BEGIN
  SELECT RAISE(ABORT, 'payments is append-only: posted amounts cannot change and voided lines cannot be edited');
END;

DROP TRIGGER IF EXISTS payments_no_delete;
CREATE TRIGGER payments_no_delete
BEFORE DELETE ON payments
BEGIN
  SELECT RAISE(ABORT, 'payments is append-only: post a reversal instead of deleting');
END;
