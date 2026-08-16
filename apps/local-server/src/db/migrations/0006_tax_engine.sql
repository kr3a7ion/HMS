-- Migration 0006 -- the tax engine.
--
-- Backend Blueprint B6. Tax stops being a number on a settings screen and
-- becomes explicit ledger lines.
--
-- WHAT WAS ACTUALLY WRONG. branches already carried tax_name / tax_rate_bp /
-- tax_inclusive, the Settings > Hotel Configuration screen edited them, and
-- NOTHING EVER READ THEM. A property could set "VAT, 7.5%, Exclusive", save
-- it, see it persist -- and no guest was ever charged a kobo of VAT. The
-- setting looked real and did nothing, which is worse than not offering it,
-- because a Nigerian hotel that does not charge VAT is not merely leaving
-- money on the table, it is non-compliant with FIRS.
--
-- So this migration carries each branch's existing configuration forward
-- into a real tax_codes row (see the bottom of this file). From here that
-- setting is charged.
--
-- WHY SEPARATE ROWS, NOT A COLUMN. A tax folded into the base amount cannot
-- be reported, cannot be exempted, and cannot be reversed independently. The
-- guest needs the breakdown on the folio, the auditor needs it per
-- jurisdiction, and FIRS e-invoicing (B7) needs it per line. So a taxed
-- charge is a parent row plus one child row per tax, and the parent's amount
-- stays the net base.

-- ─── tax_codes ───────────────────────────────────────────────────────────
-- effective_from / effective_to make a rate change a new row rather than an
-- edit: when VAT moves from 7.5% to 10%, a charge posted last month must
-- still compute at last month's rate, or reprinting an old invoice produces
-- a different number than the one the guest paid.
CREATE TABLE IF NOT EXISTS tax_codes (
  id                 TEXT PRIMARY KEY,
  branch_id          TEXT NOT NULL REFERENCES branches(id),
  code               TEXT NOT NULL,
  name               TEXT NOT NULL,
  jurisdiction       TEXT NOT NULL,          -- federal | state | local
  tax_type           TEXT NOT NULL,          -- vat | consumption | service_charge | other
  rate_bp            INTEGER NOT NULL,       -- basis points; 7.5% = 750
  is_inclusive       INTEGER NOT NULL DEFAULT 0,
  -- JSON array of tax_code ids whose computed amounts join this one's base.
  -- Nigeria's service charge is itself VAT-able, which is exactly this.
  compounds_on_json  TEXT NOT NULL DEFAULT '[]',
  -- JSON array of charge categories ("Room", "Restaurant", ...). An empty
  -- array means every category -- the common case for VAT.
  applies_to_json    TEXT NOT NULL DEFAULT '[]',
  computation_order  INTEGER NOT NULL DEFAULT 100,
  effective_from     INTEGER NOT NULL,
  effective_to       INTEGER,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tax_codes_branch ON tax_codes(branch_id, is_active);

-- ─── tax_exemptions ──────────────────────────────────────────────────────
-- Diplomatic guests, some corporate accounts, and long-stay rates are
-- genuinely exempt from specific codes -- never from all of them at once,
-- which is why an exemption names the code it suppresses.
CREATE TABLE IF NOT EXISTS tax_exemptions (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  tax_code_id       TEXT NOT NULL REFERENCES tax_codes(id),
  exemption_type    TEXT NOT NULL,   -- guest_type | corporate_account | long_stay | diplomatic
  criteria_json     TEXT NOT NULL DEFAULT '{}',
  requires_evidence INTEGER NOT NULL DEFAULT 1,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tax_exemptions_branch ON tax_exemptions(branch_id, is_active);

-- ─── folio_charges: line parentage ───────────────────────────────────────
-- charge_kind defaults to 'base' so every row already in the ledger reads
-- correctly: those charges genuinely had no tax applied to them, and
-- back-dating tax onto historic lines would invent money that was never
-- billed.
ALTER TABLE folio_charges ADD COLUMN parent_charge_id TEXT REFERENCES folio_charges(id);
ALTER TABLE folio_charges ADD COLUMN charge_kind TEXT NOT NULL DEFAULT 'base';  -- base | tax | service_charge
ALTER TABLE folio_charges ADD COLUMN tax_code_id TEXT REFERENCES tax_codes(id);

CREATE INDEX IF NOT EXISTS idx_folio_charges_parent ON folio_charges(parent_charge_id);
CREATE INDEX IF NOT EXISTS idx_folio_charges_kind ON folio_charges(charge_kind);

-- ─── Carry each branch's existing tax setting into a real code ───────────
-- One row per branch, from the settings it already had. This is a straight
-- port, not a new policy: whatever the property configured is what it now
-- charges.
--
-- Deliberately NOT seeded here: state consumption tax and service charge.
-- The blueprint lists both in its Nigerian default set, but consumption tax
-- varies by state and a service charge is a property's own commercial
-- policy. Adding either on the operator's behalf would start billing guests
-- for something nobody configured. They are added through
-- POST /settings/tax-codes, deliberately.
INSERT INTO tax_codes (
  id, branch_id, code, name, jurisdiction, tax_type, rate_bp, is_inclusive,
  compounds_on_json, applies_to_json, computation_order,
  effective_from, effective_to, is_active, created_at
)
SELECT
  'taxcode-legacy-' || b.id,
  b.id,
  UPPER(REPLACE(COALESCE(NULLIF(b.tax_name, ''), 'VAT'), ' ', '_')),
  COALESCE(NULLIF(b.tax_name, ''), 'VAT'),
  'federal',
  'vat',
  b.tax_rate_bp,
  b.tax_inclusive,
  '[]',
  '[]',      -- every charge category
  100,
  0,         -- effective from the epoch: it was already the property's rate
  NULL,
  CASE WHEN b.tax_rate_bp > 0 THEN 1 ELSE 0 END,
  CAST(strftime('%s', 'now') AS INTEGER)
FROM branches b
WHERE NOT EXISTS (SELECT 1 FROM tax_codes t WHERE t.id = 'taxcode-legacy-' || b.id);

-- ─── Grant new permissions to the roles that need them ──────────────────
--
-- WITHOUT THIS A NEW PERMISSION SHIPS DARK. Role permissions are seeded from
-- SYSTEM_ROLE_SEED only when the roles table is EMPTY -- after that the rows
-- are the live, operator-editable source of truth and boot never overwrites
-- them (db/client.ts). That is the right behaviour: a manager who edits a
-- built-in role must not have it silently reverted on restart. The
-- consequence is that adding a key in permissionKeys.ts reaches NEW
-- databases only.
--
-- FOUND IN LIVE VERIFICATION, AND IT IS NOT ONLY B6's PROBLEM. Checking the
-- dev database against the seed showed that B4 and B5 hit this too and
-- nobody noticed: `folio:void` (B4) never reached Finance or the Resident
-- Officer, and `finance:reports` / `finance:reopen_day` (B5) never reached
-- Finance. On any property upgraded rather than freshly installed, voiding a
-- charge and reopening a day -- both "complete" -- were reachable only by
-- the two roles holding "*". Those grants are repaired here alongside B6's.
--
-- Strictly ADDITIVE, and safe against deliberate operator edits: a key is
-- appended only where it is absent, and nothing is ever removed. Roles
-- holding "*" store a JSON string rather than an array and are skipped by
-- the json_type test -- they already have everything.
--
-- Side effect worth knowing: this changes those roles' permissions_hash, so
-- affected users with a live session are signed out once on upgrade (Auth
-- doc Part 6.3). That is the designed response to a permission change.
--
-- THE RULE FOR EVERY BATCH AFTER THIS ONE: a new permission key in
-- permissionKeys.ts needs a matching additive UPDATE in that batch's
-- migration, or it only works on machines that have never run the software.
CREATE TEMP TABLE _permission_grants (role_id TEXT, permission TEXT);
INSERT INTO _permission_grants (role_id, permission) VALUES
  ('FIN', 'settings:tax'),          -- B6, this batch
  ('IT',  'settings:tax'),
  ('FIN', 'folio:void'),            -- B4, never delivered to an upgraded DB
  ('RO',  'folio:void'),
  ('FIN', 'finance:reports'),       -- B5, likewise
  ('FIN', 'finance:reopen_day');

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
