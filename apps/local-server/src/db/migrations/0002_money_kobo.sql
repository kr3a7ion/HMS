-- Migration 0002 -- money becomes integer minor units (kobo).
--
-- Backend Blueprint B2 / invariant 2. Every money column moves from real()
-- to an integer _kobo column; branches.tax_rate becomes basis points
-- (tax_rate_bp) because it is a rate, not an amount.
--
-- SHAPE. For each column: ADD the new integer column with a default (SQLite
-- requires one to add a NOT NULL column to a populated table), backfill it,
-- then DROP the old one. Verified safe for this schema: no index, view, or
-- constraint references any of these columns, and SQLite 3.35+ supports
-- DROP COLUMN. The whole file runs inside one transaction (see migrate.ts),
-- so a failure anywhere leaves the old columns untouched.
--
-- ROUNDING. CAST(ROUND(x * 100) AS INTEGER) -- SQLite's ROUND is half away
-- from zero, matching money.ts's mulRate policy. A stored value with more
-- than 2 decimals (only reachable if something wrote a computed float
-- directly) rounds to the nearest kobo here; that is the correct one-time
-- resolution, and after this migration such a value cannot be represented
-- at all.
--
-- COLUMNS DELIBERATELY LEFT AS real(): physical quantities, which are
-- genuinely fractional -- products.current_stock / par_level /
-- reorder_threshold, stock_transactions.quantity,
-- purchase_order_items.quantity (2.5 kg of flour is a real number, not a
-- rounding error), and branch_sync_cache.occupancy_rate, which is a
-- percentage. Invariant 2 is about money, not about banning real().

-- ─── branches ────────────────────────────────────────────────────────────
ALTER TABLE branches ADD COLUMN discount_approval_threshold_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE branches SET discount_approval_threshold_kobo = CAST(ROUND(discount_approval_threshold * 100) AS INTEGER);
ALTER TABLE branches DROP COLUMN discount_approval_threshold;

-- A rate, not an amount: 7.5% -> 750 basis points.
ALTER TABLE branches ADD COLUMN tax_rate_bp INTEGER NOT NULL DEFAULT 750;
UPDATE branches SET tax_rate_bp = CAST(ROUND(tax_rate * 100) AS INTEGER);
ALTER TABLE branches DROP COLUMN tax_rate;

-- ─── users ───────────────────────────────────────────────────────────────
-- Nullable: not every staff record has a pay rate on file.
ALTER TABLE users ADD COLUMN pay_rate_kobo INTEGER;
UPDATE users SET pay_rate_kobo = CAST(ROUND(pay_rate * 100) AS INTEGER) WHERE pay_rate IS NOT NULL;
ALTER TABLE users DROP COLUMN pay_rate;

-- ─── reservations ────────────────────────────────────────────────────────
ALTER TABLE reservations ADD COLUMN rate_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE reservations SET rate_kobo = CAST(ROUND(rate * 100) AS INTEGER);
ALTER TABLE reservations DROP COLUMN rate;

-- ─── folio_charges ───────────────────────────────────────────────────────
ALTER TABLE folio_charges ADD COLUMN unit_price_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE folio_charges SET unit_price_kobo = CAST(ROUND(unit_price * 100) AS INTEGER);
ALTER TABLE folio_charges DROP COLUMN unit_price;

ALTER TABLE folio_charges ADD COLUMN amount_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE folio_charges SET amount_kobo = CAST(ROUND(amount * 100) AS INTEGER);
ALTER TABLE folio_charges DROP COLUMN amount;

-- ─── payments ────────────────────────────────────────────────────────────
ALTER TABLE payments ADD COLUMN amount_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE payments SET amount_kobo = CAST(ROUND(amount * 100) AS INTEGER);
ALTER TABLE payments DROP COLUMN amount;

-- ─── menu_items ──────────────────────────────────────────────────────────
ALTER TABLE menu_items ADD COLUMN price_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE menu_items SET price_kobo = CAST(ROUND(price * 100) AS INTEGER);
ALTER TABLE menu_items DROP COLUMN price;

-- ─── restaurant_orders ───────────────────────────────────────────────────
ALTER TABLE restaurant_orders ADD COLUMN paid_amount_kobo INTEGER;
UPDATE restaurant_orders SET paid_amount_kobo = CAST(ROUND(paid_amount * 100) AS INTEGER) WHERE paid_amount IS NOT NULL;
ALTER TABLE restaurant_orders DROP COLUMN paid_amount;

-- ─── restaurant_order_items ──────────────────────────────────────────────
ALTER TABLE restaurant_order_items ADD COLUMN unit_price_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE restaurant_order_items SET unit_price_kobo = CAST(ROUND(unit_price * 100) AS INTEGER);
ALTER TABLE restaurant_order_items DROP COLUMN unit_price;

-- ─── products ────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN unit_cost_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE products SET unit_cost_kobo = CAST(ROUND(unit_cost * 100) AS INTEGER);
ALTER TABLE products DROP COLUMN unit_cost;

-- ─── purchase_order_items ────────────────────────────────────────────────
ALTER TABLE purchase_order_items ADD COLUMN unit_cost_kobo INTEGER NOT NULL DEFAULT 0;
UPDATE purchase_order_items SET unit_cost_kobo = CAST(ROUND(unit_cost * 100) AS INTEGER);
ALTER TABLE purchase_order_items DROP COLUMN unit_cost;

-- ─── branch_sync_cache ───────────────────────────────────────────────────
-- Money mirrored from central. Central's own schema still speaks naira
-- floats until B20, so services/sync.ts converts at that boundary via
-- money.ts's toKobo/fromKobo -- the float stops at the wire, not in storage.
ALTER TABLE branch_sync_cache ADD COLUMN revenue_today_kobo INTEGER;
UPDATE branch_sync_cache SET revenue_today_kobo = CAST(ROUND(revenue_today * 100) AS INTEGER) WHERE revenue_today IS NOT NULL;
ALTER TABLE branch_sync_cache DROP COLUMN revenue_today;

ALTER TABLE branch_sync_cache ADD COLUMN adr_kobo INTEGER;
UPDATE branch_sync_cache SET adr_kobo = CAST(ROUND(adr * 100) AS INTEGER) WHERE adr IS NOT NULL;
ALTER TABLE branch_sync_cache DROP COLUMN adr;

ALTER TABLE branch_sync_cache ADD COLUMN revpar_kobo INTEGER;
UPDATE branch_sync_cache SET revpar_kobo = CAST(ROUND(revpar * 100) AS INTEGER) WHERE revpar IS NOT NULL;
ALTER TABLE branch_sync_cache DROP COLUMN revpar;
