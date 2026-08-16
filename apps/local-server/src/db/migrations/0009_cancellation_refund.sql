-- Migration 0009 -- cancellation policies, refunds and deposits.
--
-- Backend Blueprint B9. Three things that were previously either impossible or
-- dishonest become real.
--
-- WHAT WAS ACTUALLY MISSING, and it is not a small thing: B5's night audit and
-- B10's no-show endpoint both record a no-show with `penalty_charge_id = NULL`
-- and a note saying the amount "awaits the cancellation-policy engine". That
-- was the honest choice at the time -- inventing a penalty figure and charging
-- a real guest for it would have been worse -- but it means a property running
-- this software today absorbs every no-show for free. This migration is what
-- lets those two paths finally post the charge they have been deferring.
--
-- And cancellation had no endpoint at all: a stay could only be amended or
-- left to rot into a no-show. There was no way to cancel one, which means
-- there was no way to release its inventory either.

-- ─── cancellation_policies ───────────────────────────────────────────────
-- The penalty is expressed as a TYPE plus a value, not a free number, because
-- "first night" and "30% of the stay" are different rules that both have to
-- survive a rate change between booking and cancellation. Storing a computed
-- amount at booking time would freeze a figure that the policy says should
-- move.
--
-- No-show penalties are separate columns rather than a separate policy: a
-- property that waives a late cancellation almost never waives a no-show, and
-- forcing two policy rows to express that is how they end up inconsistent.
CREATE TABLE IF NOT EXISTS cancellation_policies (
  id                        TEXT PRIMARY KEY,
  branch_id                 TEXT NOT NULL REFERENCES branches(id),
  code                      TEXT NOT NULL,
  name                      TEXT NOT NULL,
  description               TEXT,
  -- Hours before arrival within which cancellation is free. 0 means never
  -- free; a large number means effectively always free.
  free_cancellation_hours   INTEGER NOT NULL DEFAULT 24,
  penalty_type              TEXT NOT NULL DEFAULT 'first_night',
                            -- none|first_night|percentage|fixed|full_stay
  penalty_value_bp          INTEGER,   -- basis points, for `percentage`
  penalty_fixed_kobo        INTEGER,   -- kobo, for `fixed`
  no_show_penalty_type      TEXT NOT NULL DEFAULT 'first_night',
  no_show_penalty_value_bp  INTEGER,
  no_show_penalty_fixed_kobo INTEGER,
  is_active                 INTEGER NOT NULL DEFAULT 1,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER,
  UNIQUE (branch_id, code)
);

-- ─── reservations: the cancellation record ───────────────────────────────
-- penalty_waived is deliberately its own flag rather than "penalty_charge_id
-- IS NULL": a waived penalty and a zero penalty are different events, and only
-- one of them needs a name attached to it.
ALTER TABLE reservations ADD COLUMN cancellation_policy_id TEXT REFERENCES cancellation_policies(id);
ALTER TABLE reservations ADD COLUMN cancelled_at INTEGER;
ALTER TABLE reservations ADD COLUMN cancelled_by TEXT REFERENCES users(id);
ALTER TABLE reservations ADD COLUMN cancellation_reason TEXT;
ALTER TABLE reservations ADD COLUMN penalty_charge_id TEXT REFERENCES folio_charges(id);
ALTER TABLE reservations ADD COLUMN penalty_waived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN penalty_waived_by TEXT REFERENCES users(id);
ALTER TABLE reservations ADD COLUMN penalty_waiver_reason TEXT;

-- ─── refunds ─────────────────────────────────────────────────────────────
-- A refund is a REQUEST that becomes a record, not a button that moves money.
-- The two-step (request → approve) exists because refunding is the single
-- easiest way to steal from a hotel: it turns a guest's payment into cash out
-- of the drawer, and the person at the desk is the one who takes it.
--
-- deductions_json is itemised on purpose. "We refunded ₦40,000 of ₦50,000" is
-- an argument; "penalty ₦8,000, minibar ₦2,000" is a receipt.
CREATE TABLE IF NOT EXISTS refunds (
  id                    TEXT PRIMARY KEY,
  branch_id             TEXT NOT NULL REFERENCES branches(id),
  refund_number         TEXT NOT NULL,
  sequence_number       INTEGER NOT NULL,
  business_date         INTEGER NOT NULL,
  payment_id            TEXT REFERENCES payments(id),
  reservation_id        TEXT REFERENCES reservations(id),
  guest_id              TEXT REFERENCES guests(id),
  requested_amount_kobo INTEGER NOT NULL,
  approved_amount_kobo  INTEGER,
  deductions_json       TEXT NOT NULL DEFAULT '[]',
  reason                TEXT NOT NULL,
  method                TEXT NOT NULL,          -- cash|card|transfer
  gateway_reference     TEXT,
  status                TEXT NOT NULL DEFAULT 'requested',
                        -- requested|approved|processing|completed|failed|rejected
  requested_by          TEXT REFERENCES users(id),
  requested_at          INTEGER NOT NULL,
  approved_by           TEXT REFERENCES users(id),
  approved_at           INTEGER,
  completed_at          INTEGER,
  rejection_reason      TEXT,
  -- The reversal row this refund posted to the ledger once completed. Null
  -- until then, which is what distinguishes "approved" from "money has left".
  payment_reversal_id   TEXT REFERENCES payments(id),
  UNIQUE (branch_id, refund_number)
);
CREATE INDEX IF NOT EXISTS idx_refunds_branch_status ON refunds(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_refunds_reservation ON refunds(reservation_id);

-- ─── deposits ────────────────────────────────────────────────────────────
-- A DEPOSIT IS A LIABILITY, NOT REVENUE, and that is the entire reason this
-- table exists rather than the money just landing on the folio as a payment.
-- Until the guest stays, the hotel is holding someone else's money: it must
-- not show up as income, and it must be refundable in full without unwinding
-- a sale that never happened.
--
-- The three outcomes are tracked separately because they are accounted
-- differently: APPLIED becomes a folio payment (the liability converts to
-- settlement), REFUNDED goes back out (liability discharged), FORFEITED
-- becomes revenue (liability converts to income). A single "released" flag
-- would collapse three different journal entries into one.
CREATE TABLE IF NOT EXISTS deposits (
  id                     TEXT PRIMARY KEY,
  branch_id              TEXT NOT NULL REFERENCES branches(id),
  reservation_id         TEXT REFERENCES reservations(id),
  guest_id               TEXT REFERENCES guests(id),
  deposit_type           TEXT NOT NULL DEFAULT 'reservation',
                         -- reservation|security|incidental
  amount_kobo            INTEGER NOT NULL,
  business_date          INTEGER NOT NULL,
  held_at                INTEGER NOT NULL,
  held_by                TEXT REFERENCES users(id),
  payment_id             TEXT REFERENCES payments(id),
  method                 TEXT NOT NULL DEFAULT 'cash',
  status                 TEXT NOT NULL DEFAULT 'held',
                         -- held|applied|refunded|forfeited|partially_refunded
  applied_amount_kobo    INTEGER NOT NULL DEFAULT 0,
  refunded_amount_kobo   INTEGER NOT NULL DEFAULT 0,
  forfeited_amount_kobo  INTEGER NOT NULL DEFAULT 0,
  released_at            INTEGER,
  released_by            TEXT REFERENCES users(id),
  release_notes          TEXT
);
CREATE INDEX IF NOT EXISTS idx_deposits_branch_status ON deposits(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_deposits_reservation ON deposits(reservation_id);

-- ─── Seed one policy per branch ──────────────────────────────────────────
-- 24 hours free, then the first night. This is the most common Nigerian
-- hotel policy and a defensible default, but it is a DEFAULT: it is editable
-- at /settings/cancellation-policies, and a property that wants something
-- else changes it there rather than having it hard-coded anywhere.
INSERT INTO cancellation_policies (
  id, branch_id, code, name, description,
  free_cancellation_hours, penalty_type, penalty_value_bp, penalty_fixed_kobo,
  no_show_penalty_type, no_show_penalty_value_bp, no_show_penalty_fixed_kobo,
  is_active, created_at
)
SELECT
  'cxlpolicy-default-' || b.id, b.id, 'STANDARD', 'Standard 24-hour',
  'Free cancellation up to 24 hours before arrival; after that, one night is charged. A no-show is charged one night.',
  24, 'first_night', NULL, NULL,
  'first_night', NULL, NULL,
  1, CAST(STRFTIME('%s', 'now') AS INTEGER)
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM cancellation_policies p WHERE p.branch_id = b.id AND p.code = 'STANDARD'
);

-- Existing reservations adopt their branch's default policy, so a stay booked
-- before this migration can still be cancelled with a defined consequence
-- rather than falling through to "no policy, no penalty".
UPDATE reservations SET cancellation_policy_id = 'cxlpolicy-default-' || branch_id
WHERE cancellation_policy_id IS NULL;

-- ─── New permissions (the rule from migration 0006) ─────────────────────
CREATE TEMP TABLE _permission_grants (role_id TEXT, permission TEXT);
INSERT INTO _permission_grants (role_id, permission) VALUES
  -- Cancelling is front-desk work; waiving the penalty that comes with it is
  -- not. Splitting them is the whole control: otherwise every cancellation is
  -- free the moment a guest complains loudly enough.
  ('FD',  'reservations:cancel'),
  ('RSV', 'reservations:cancel'),
  ('FIN', 'reservations:cancel'),
  ('FIN', 'reservations:waive_penalty'),
  -- Refunds: requesting and approving are deliberately different people.
  ('FD',  'finance:refund_request'),
  ('RSV', 'finance:refund_request'),
  ('FIN', 'finance:refund_request'),
  ('FIN', 'finance:refund_approve'),
  ('FIN', 'deposits:manage'),
  ('FD',  'deposits:manage'),
  ('FIN', 'settings:cancellation'),
  ('IT',  'settings:cancellation');

UPDATE roles
   SET permissions_json = (
     SELECT json_group_array(value) FROM (
       SELECT value FROM json_each(roles.permissions_json)
       UNION
       SELECT g.permission FROM _permission_grants g WHERE g.role_id = roles.id
     )
   )
 WHERE is_system_role = 1
   AND json_valid(permissions_json)
   AND json_type(permissions_json) = 'array'
   AND EXISTS (
     SELECT 1 FROM _permission_grants g
      WHERE g.role_id = roles.id
        AND g.permission NOT IN (SELECT value FROM json_each(roles.permissions_json))
   );

DROP TABLE _permission_grants;
