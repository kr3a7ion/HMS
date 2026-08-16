-- Migration 0012 -- payment gateways, transactions and settlement.
--
-- Backend Blueprint B23. Until now a payment was a row someone typed: an
-- amount, a method, and a name. Nothing connected it to a card actually being
-- charged, nothing detected the same charge being taken twice, and nothing
-- reconciled what the bank paid out against what the property recorded.
--
-- THE SINGLE MOST IMPORTANT PROPERTY IN THIS BATCH is that a RETRY NEVER
-- DOUBLE-CHARGES. A card payment that times out is the normal case on a
-- Nigerian hotel's uplink, not the exception: the clerk sees a spinner, the
-- guest sees a debit alert, and the clerk presses the button again. Without an
-- idempotency key that second press takes a second ₦85,000 off a real person's
-- card, and the property finds out when they complain.
--
-- OFFLINE IS NOT AN ERROR STATE. Card and transfer need the gateway, but cash
-- and a standalone POS terminal do not, and a checkout must never be blocked
-- because an uplink is down. A payment taken while offline records as
-- `pending_verification` and reconciles later -- the guest still leaves.

-- ─── payment_gateways ────────────────────────────────────────────────────
-- config_json holds API keys and is ENCRYPTED via lib/secrets.ts, same
-- discipline as the door-lock credentials: a gateway secret key can move real
-- money out of the property's account.
CREATE TABLE IF NOT EXISTS payment_gateways (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  provider          TEXT NOT NULL,   -- paystack|flutterwave|moniepoint|manual|fake
  display_name      TEXT NOT NULL,
  config_encrypted  TEXT,            -- encrypted JSON: keys, webhook secret
  is_active         INTEGER NOT NULL DEFAULT 1,
  supports_terminal INTEGER NOT NULL DEFAULT 0,
  supports_online   INTEGER NOT NULL DEFAULT 1,
  supports_refund   INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER,
  UNIQUE (branch_id, provider)
);

-- ─── payment_transactions ────────────────────────────────────────────────
-- The gateway-side record, distinct from `payments` (the folio-side ledger
-- row). They are deliberately separate tables: a transaction can be initiated,
-- fail, and be retried without ever producing a folio payment, and a folio
-- payment taken in cash has no transaction at all. Collapsing them would mean
-- either fictional ledger rows or lost gateway history.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                 TEXT PRIMARY KEY,
  branch_id          TEXT NOT NULL REFERENCES branches(id),
  -- Set only once the money is confirmed and the ledger row is written.
  payment_id         TEXT REFERENCES payments(id),
  reservation_id     TEXT REFERENCES reservations(id),
  gateway_id         TEXT REFERENCES payment_gateways(id),
  gateway_reference  TEXT,
  -- THE ANTI-DOUBLE-CHARGE GUARANTEE. Supplied by the caller and UNIQUE per
  -- branch: a retried initiation with the same key returns the ORIGINAL
  -- transaction instead of starting a second one.
  idempotency_key    TEXT NOT NULL,
  -- Who took the payment. A WEBHOOK has no actor -- it arrives from the
  -- gateway with no session -- so the folio row it produces is attributed to
  -- the clerk who started the transaction. The alternative was a fabricated
  -- "system" user, which would put a fiction in the cash reconciliation
  -- every real payment is checked against.
  initiated_by       TEXT REFERENCES users(id),
  amount_kobo        INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'NGN',
  channel            TEXT NOT NULL,   -- card|transfer|ussd|pos_terminal|cash
  status             TEXT NOT NULL DEFAULT 'initiated',
                     -- initiated|pending|pending_verification|successful|failed|reversed|abandoned
  initiated_at       INTEGER NOT NULL,
  completed_at       INTEGER,
  failure_reason     TEXT,
  -- Terminal / card metadata. masked_pan only ever holds the masked form the
  -- gateway returns; a full PAN is never stored, and storing one would put
  -- this property in PCI scope it has no way to satisfy.
  terminal_id        TEXT,
  rrn                TEXT,
  auth_code          TEXT,
  masked_pan         TEXT,
  card_type          TEXT,
  raw_response_json  TEXT,
  -- Settlement: when the bank actually pays the money over, minus its fee.
  settlement_status  TEXT NOT NULL DEFAULT 'unsettled',  -- unsettled|settled|disputed
  settled_at         INTEGER,
  settlement_reference TEXT,
  fee_kobo           INTEGER NOT NULL DEFAULT 0,
  -- True when taken while the gateway was unreachable, so reconnection knows
  -- to go and confirm it.
  taken_offline      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (branch_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(gateway_reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_settlement ON payment_transactions(settlement_status, settled_at);

-- ─── settlement_batches ──────────────────────────────────────────────────
-- What the bank says it paid, against what the property recorded.
-- `variance_kobo` is the entire point: a payout that does not match is the
-- only signal a property gets that a transaction was charged back, held, or
-- silently dropped.
CREATE TABLE IF NOT EXISTS settlement_batches (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  gateway_id        TEXT REFERENCES payment_gateways(id),
  batch_reference   TEXT NOT NULL,
  settlement_date   INTEGER NOT NULL,
  gross_kobo        INTEGER NOT NULL DEFAULT 0,
  fee_kobo          INTEGER NOT NULL DEFAULT 0,
  net_kobo          INTEGER NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  reconciled_at     INTEGER,
  reconciled_by     TEXT REFERENCES users(id),
  variance_kobo     INTEGER NOT NULL DEFAULT 0,
  variance_notes    TEXT,
  UNIQUE (branch_id, batch_reference)
);
CREATE INDEX IF NOT EXISTS idx_settlement_batches_date ON settlement_batches(branch_id, settlement_date);

-- ─── Processed webhooks, for replay safety ──────────────────────────────
-- A gateway retries a webhook until it gets a 200, and will happily deliver
-- the same event a dozen times. Recording the event id is what makes the
-- second delivery a no-op instead of a second folio payment.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id           TEXT PRIMARY KEY,
  branch_id    TEXT REFERENCES branches(id),
  provider     TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  event_type   TEXT,
  gateway_reference TEXT,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER,
  outcome      TEXT,        -- applied|duplicate|ignored|rejected
  detail       TEXT,
  UNIQUE (provider, event_id)
);

-- ─── New permissions (the rule from migration 0006) ─────────────────────
CREATE TEMP TABLE _permission_grants (role_id TEXT, permission TEXT);
INSERT INTO _permission_grants (role_id, permission) VALUES
  -- Taking a payment is front-desk and restaurant work.
  ('FD',  'payments:take'),
  ('RT',  'payments:take'),
  ('FIN', 'payments:take'),
  -- Reconciling a payout against recorded transactions is Finance's alone.
  ('FIN', 'payments:reconcile'),
  ('FIN', 'settings:gateways'),
  ('IT',  'settings:gateways');

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
