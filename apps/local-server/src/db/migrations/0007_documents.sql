-- Migration 0007 -- document numbering and invoicing.
--
-- Backend Blueprint B7. Two things land here: gapless per-branch document
-- sequences, and real invoices issued from a folio.
--
-- WHY GAPLESS MATTERS ENOUGH TO BUILD A TABLE FOR IT. An invoice number is
-- the thing an auditor reconciles against. "Where is INV-000047?" has to have
-- an answer, and the only answers that are acceptable are "here it is" and
-- "it was voided, here is the void record". "It was never used because a
-- transaction rolled back" is not an acceptable answer, which is why the
-- number is allocated INSIDE the same transaction as the record that uses it
-- -- if the invoice does not commit, neither does the number.
--
-- The alternative everyone reaches for first -- MAX(number) + 1 at insert
-- time -- has a race that produces duplicates, and a void that produces a
-- gap. This table plus a UNIQUE index is what makes both impossible.

-- ─── document_sequences ──────────────────────────────────────────────────
-- One row per (branch, document type). next_number is the next number to
-- hand out, so it starts at 1 and is bumped in the same transaction as the
-- document that consumes it.
--
-- The prefix carries the branch code so numbers are unique across the whole
-- estate without any central coordination -- which matters because a branch
-- issues invoices while offline and cannot ask anyone what the next number
-- should be.
CREATE TABLE IF NOT EXISTS document_sequences (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL REFERENCES branches(id),
  document_type  TEXT NOT NULL,   -- invoice|receipt|credit_note|complaint|trip|proforma
  prefix         TEXT NOT NULL,
  next_number    INTEGER NOT NULL DEFAULT 1,
  -- Zero-padding width: 5 gives INV-00001. Purely presentational; the
  -- ordering guarantee comes from the integer.
  pad_width      INTEGER NOT NULL DEFAULT 5,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER,
  UNIQUE (branch_id, document_type)
);

-- ─── invoices ────────────────────────────────────────────────────────────
-- group_id and corporate_account_id are plain columns with no foreign key:
-- the tables they will point at are B12 (groups) and B13 (corporate
-- accounts). Declaring an FK to a table that does not exist yet would fail
-- the migration; leaving the columns out would mean altering an issued-
-- document table later, which is worse.
CREATE TABLE IF NOT EXISTS invoices (
  id                   TEXT PRIMARY KEY,
  branch_id            TEXT NOT NULL REFERENCES branches(id),
  invoice_number       TEXT NOT NULL,
  sequence_number      INTEGER NOT NULL,      -- the raw integer, for gap checks
  business_date        INTEGER NOT NULL,      -- invariant 9
  invoice_type         TEXT NOT NULL,         -- guest|corporate|group|proforma
  reservation_id       TEXT REFERENCES reservations(id),
  guest_id             TEXT REFERENCES guests(id),
  group_id             TEXT,
  corporate_account_id TEXT,
  bill_to_name         TEXT NOT NULL,
  bill_to_address      TEXT,
  -- Taxpayer Identification Number. Required on a Nigerian VAT invoice for
  -- a corporate buyer to reclaim; nullable because a walk-in guest has none.
  bill_to_tin          TEXT,
  issued_at            INTEGER NOT NULL,
  issued_by            TEXT REFERENCES users(id),
  due_at               INTEGER,
  subtotal_kobo        INTEGER NOT NULL DEFAULT 0,
  tax_total_kobo       INTEGER NOT NULL DEFAULT 0,
  total_kobo           INTEGER NOT NULL DEFAULT 0,
  paid_kobo            INTEGER NOT NULL DEFAULT 0,
  balance_kobo         INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'issued',
                       -- draft|issued|paid|partially_paid|overdue|void|credit_noted
  voided_at            INTEGER,
  voided_by            TEXT REFERENCES users(id),
  void_reason          TEXT,
  -- The FIRS e-invoicing seam B6 promised. Nothing submits yet -- that needs
  -- a live FIRS integration and credentials, which is not something to fake.
  -- The columns exist so issuance does not have to be altered later, and
  -- their null state is honest: "never submitted".
  firs_einvoice_status TEXT,
  firs_submission_ref  TEXT,
  pdf_ref              TEXT,
  -- A voided number is never reused, and this is what enforces it: the row
  -- keeps its number forever, and no second row can take it.
  UNIQUE (branch_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_status ON invoices(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_business_date ON invoices(business_date);
CREATE INDEX IF NOT EXISTS idx_invoices_reservation ON invoices(reservation_id);

-- ─── invoice_lines ───────────────────────────────────────────────────────
-- A SNAPSHOT, not a view. The line copies the folio charge's description,
-- quantity and amount at the moment of issuance and never changes after.
--
-- That is the whole point: if lines were read live from folio_charges, a
-- reversal posted next week would silently change an invoice the guest has
-- already been given and possibly paid. An issued document must say what it
-- said when it was issued; a later correction produces a CREDIT NOTE.
CREATE TABLE IF NOT EXISTS invoice_lines (
  id              TEXT PRIMARY KEY,
  invoice_id      TEXT NOT NULL REFERENCES invoices(id),
  folio_charge_id TEXT REFERENCES folio_charges(id),
  description     TEXT NOT NULL,
  charge_kind     TEXT NOT NULL DEFAULT 'base',   -- base|tax|service_charge
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price_kobo INTEGER NOT NULL,
  amount_kobo     INTEGER NOT NULL,
  tax_code_id     TEXT REFERENCES tax_codes(id),
  sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
-- One line per folio charge per invoice: the guard against billing the same
-- charge twice on the same document.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_lines_charge_unique
  ON invoice_lines(invoice_id, folio_charge_id) WHERE folio_charge_id IS NOT NULL;

-- ─── receipts ────────────────────────────────────────────────────────────
-- One receipt per payment, enforced by the unique index: handing a guest two
-- receipts for one payment is how a payment gets counted twice.
CREATE TABLE IF NOT EXISTS receipts (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL REFERENCES branches(id),
  receipt_number TEXT NOT NULL,
  sequence_number INTEGER NOT NULL,
  payment_id     TEXT NOT NULL REFERENCES payments(id),
  invoice_id     TEXT REFERENCES invoices(id),
  business_date  INTEGER NOT NULL,
  issued_at      INTEGER NOT NULL,
  issued_by      TEXT REFERENCES users(id),
  amount_kobo    INTEGER NOT NULL,
  method         TEXT NOT NULL,
  reference      TEXT,
  UNIQUE (branch_id, receipt_number),
  UNIQUE (payment_id)
);
CREATE INDEX IF NOT EXISTS idx_receipts_branch ON receipts(branch_id);

-- ─── credit_notes ────────────────────────────────────────────────────────
-- The only way to change what an issued invoice is owed. approved_by is
-- separate from issued_by so a two-person control is expressible; it is
-- nullable because a small correction by the person who spotted it is a
-- legitimate workflow and forcing a second name would just get one invented.
CREATE TABLE IF NOT EXISTS credit_notes (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  credit_note_number TEXT NOT NULL,
  sequence_number   INTEGER NOT NULL,
  invoice_id        TEXT NOT NULL REFERENCES invoices(id),
  business_date     INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  amount_kobo       INTEGER NOT NULL,
  issued_at         INTEGER NOT NULL,
  issued_by         TEXT REFERENCES users(id),
  approved_by       TEXT REFERENCES users(id),
  UNIQUE (branch_id, credit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON credit_notes(invoice_id);

-- ─── Seed a sequence per branch per document type ───────────────────────
-- Prefix pattern: <BRANCH>-<TYPE>-<YEAR>-, e.g. "ABU-INV-2026-". The branch
-- code is the first three letters of the branch name, uppercased -- good
-- enough to be recognisable on a printed document and editable at
-- /settings/document-sequences, which is where a property with a real
-- numbering convention will set its own.
INSERT INTO document_sequences (id, branch_id, document_type, prefix, next_number, pad_width, created_at)
SELECT
  'docseq-' || t.document_type || '-' || b.id,
  b.id,
  t.document_type,
  UPPER(SUBSTR(REPLACE(b.name, ' ', ''), 1, 3)) || '-' || t.code || '-'
    || STRFTIME('%Y', 'now') || '-',
  1,
  5,
  CAST(STRFTIME('%s', 'now') AS INTEGER)
FROM branches b
CROSS JOIN (
  SELECT 'invoice' AS document_type, 'INV' AS code
  UNION ALL SELECT 'receipt', 'RCP'
  UNION ALL SELECT 'credit_note', 'CRN'
  UNION ALL SELECT 'proforma', 'PRO'
) t
WHERE NOT EXISTS (
  SELECT 1 FROM document_sequences d
   WHERE d.branch_id = b.id AND d.document_type = t.document_type
);

-- ─── New permissions (see migration 0006's note, and permissionKeys.ts) ──
-- A permission added to SYSTEM_ROLE_SEED reaches new databases only. These
-- are the B7 keys, granted additively to the roles that need them.
CREATE TEMP TABLE _permission_grants (role_id TEXT, permission TEXT);
INSERT INTO _permission_grants (role_id, permission) VALUES
  ('FIN', 'invoices:issue'),
  ('FIN', 'invoices:void'),
  ('FIN', 'invoices:credit_note'),
  ('FIN', 'settings:documents'),
  -- Front desk issues a guest's invoice and receipt at check-out. It cannot
  -- void one or raise a credit note: unwinding an issued document is a
  -- finance control, and the guest is standing right there.
  ('FD',  'invoices:issue'),
  ('RSV', 'invoices:issue'),
  ('IT',  'settings:documents');

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
