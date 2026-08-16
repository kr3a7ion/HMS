-- Migration 0008 -- room types, rate plans, and real availability.
--
-- Backend Blueprint B8. Two things that were previously improvised become
-- real: what a room costs, and whether one is free.
--
-- WHAT WAS WRONG WITH BOTH.
--
-- RATES were hand-typed. POST /reservations took `rateKobo` from the client
-- and stored whatever arrived, so the price of a room was whatever the last
-- person to touch the form said it was. There was no rate card, no seasonal
-- pricing, no way to answer "what does a Deluxe cost on the 14th?" without
-- asking someone, and no way to detect that a clerk had typed ₦4,500 instead
-- of ₦45,000.
--
-- AVAILABILITY was derived by scanning reservations for overlapping date
-- ranges. That answers "is THIS room free?" but not "how many Deluxe rooms
-- can I still sell on the 14th?", which is the question a booking engine
-- actually asks -- and the scan gets slower every month the property
-- operates. Availability now comes from a per-type per-night counter that
-- booking increments in the same transaction as the reservation.

-- ─── room_types ──────────────────────────────────────────────────────────
-- Rooms already carried a free-text `type` column ("Standard", "Deluxe").
-- That column stays -- it is what the housekeeping and front-desk screens
-- display -- but it is now backed by a real row that can carry a rate, an
-- occupancy limit, and amenities.
CREATE TABLE IF NOT EXISTS room_types (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  code              TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  max_occupancy     INTEGER NOT NULL DEFAULT 2,
  bed_configuration TEXT,
  size_sqm          INTEGER,
  amenities_json    TEXT NOT NULL DEFAULT '[]',
  -- The last-resort rate: used when no rate_calendar row and no derivable
  -- plan applies. Never silently zero -- a zero rate would book a free room.
  base_rate_kobo    INTEGER NOT NULL DEFAULT 0,
  display_order     INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  UNIQUE (branch_id, code)
);

ALTER TABLE rooms ADD COLUMN room_type_id TEXT REFERENCES room_types(id);
-- Booking a TYPE rather than a specific room is the normal case: the guest
-- wants a Deluxe, and which Deluxe is decided at check-in. room_id was
-- already nullable, so nothing needs to change there.
ALTER TABLE reservations ADD COLUMN room_type_id TEXT REFERENCES room_types(id);
ALTER TABLE reservations ADD COLUMN rate_plan_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rooms_type ON rooms(room_type_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room_type ON reservations(room_type_id);

-- ─── rate_plans ──────────────────────────────────────────────────────────
-- A DERIVED plan stores no rates of its own. "Corporate = BAR less 15%" is
-- one row, computed at read time from the base plan's calendar. Duplicating
-- the rows instead would mean a base-rate change silently leaving every
-- derived plan on yesterday's price -- the classic revenue-management bug,
-- and one nobody notices until a corporate client queries an invoice.
CREATE TABLE IF NOT EXISTS rate_plans (
  id                  TEXT PRIMARY KEY,
  branch_id           TEXT NOT NULL REFERENCES branches(id),
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  plan_type           TEXT NOT NULL DEFAULT 'base',   -- base|derived|corporate|ota|package
  derived_from_id     TEXT REFERENCES rate_plans(id),
  derivation_type     TEXT,                           -- percentage|fixed_offset
  derivation_value_bp INTEGER,                        -- basis points, or kobo for fixed_offset
  cancellation_policy_id TEXT,                        -- B9
  min_stay            INTEGER,
  max_stay            INTEGER,
  advance_days_min    INTEGER,
  advance_days_max    INTEGER,
  includes_breakfast  INTEGER NOT NULL DEFAULT 0,
  is_refundable       INTEGER NOT NULL DEFAULT 1,
  effective_from      INTEGER NOT NULL DEFAULT 0,
  effective_to        INTEGER,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  UNIQUE (branch_id, code)
);

-- ─── rate_calendar ───────────────────────────────────────────────────────
-- One row per plan per type per night, and only where a rate has actually
-- been set. Absence is meaningful: it means "fall through to the derivation
-- or the type's base rate", not "free".
CREATE TABLE IF NOT EXISTS rate_calendar (
  id                  TEXT PRIMARY KEY,
  branch_id           TEXT NOT NULL REFERENCES branches(id),
  rate_plan_id        TEXT NOT NULL REFERENCES rate_plans(id),
  room_type_id        TEXT NOT NULL REFERENCES room_types(id),
  stay_date           INTEGER NOT NULL,
  rate_kobo           INTEGER NOT NULL,
  min_stay            INTEGER,
  closed_to_arrival   INTEGER NOT NULL DEFAULT 0,
  closed_to_departure INTEGER NOT NULL DEFAULT 0,
  stop_sell           INTEGER NOT NULL DEFAULT 0,
  updated_at          INTEGER,
  UNIQUE (rate_plan_id, room_type_id, stay_date)
);
CREATE INDEX IF NOT EXISTS idx_rate_calendar_lookup ON rate_calendar(room_type_id, stay_date);

-- ─── inventory_calendar ──────────────────────────────────────────────────
-- THE ANSWER TO "IS ANYTHING FREE?". `sold` is incremented inside the same
-- transaction as the reservation insert, so the count and the bookings can
-- never disagree -- which is precisely what a nightly recount job would be
-- papering over.
--
-- overbooking_limit is deliberate, not an accident waiting to happen: hotels
-- oversell on purpose to cover no-shows. Selling past total_rooms is allowed
-- only up to this number, and the API says so in the response rather than
-- letting it happen quietly.
CREATE TABLE IF NOT EXISTS inventory_calendar (
  id                TEXT PRIMARY KEY,
  branch_id         TEXT NOT NULL REFERENCES branches(id),
  room_type_id      TEXT NOT NULL REFERENCES room_types(id),
  stay_date         INTEGER NOT NULL,
  total_rooms       INTEGER NOT NULL DEFAULT 0,
  sold              INTEGER NOT NULL DEFAULT 0,
  blocked           INTEGER NOT NULL DEFAULT 0,   -- held for a group (B12)
  out_of_order      INTEGER NOT NULL DEFAULT 0,
  overbooking_limit INTEGER NOT NULL DEFAULT 0,
  UNIQUE (room_type_id, stay_date)
);
CREATE INDEX IF NOT EXISTS idx_inventory_calendar_lookup ON inventory_calendar(branch_id, stay_date);

-- ════════════════════════════════════════════════════════════════════════
-- BACKFILL. The property is already operating; this has to produce a state
-- consistent with what it had before, not a clean slate.
-- ════════════════════════════════════════════════════════════════════════

-- 1. One room type per distinct rooms.type already in use. The code is the
--    uppercased name with spaces stripped, which is stable and readable.
INSERT INTO room_types (id, branch_id, code, name, max_occupancy, base_rate_kobo, display_order, is_active, created_at)
SELECT
  'roomtype-' || r.branch_id || '-' || UPPER(REPLACE(r.type, ' ', '_')),
  r.branch_id,
  UPPER(REPLACE(r.type, ' ', '_')),
  r.type,
  2,
  -- Seed the base rate from what this type has actually been sold at: the
  -- most recent reservation's rate. A property mid-operation has a real
  -- price for a Deluxe, and inventing 0 would make every fallback quote free.
  COALESCE((
    SELECT res.rate_kobo FROM reservations res
      JOIN rooms rm ON rm.id = res.room_id
     WHERE rm.type = r.type AND rm.branch_id = r.branch_id AND res.rate_kobo > 0
     ORDER BY res.created_at DESC LIMIT 1
  ), 0),
  0, 1,
  CAST(STRFTIME('%s', 'now') AS INTEGER)
FROM (SELECT DISTINCT branch_id, type FROM rooms) r
WHERE NOT EXISTS (
  SELECT 1 FROM room_types t
   WHERE t.branch_id = r.branch_id AND t.code = UPPER(REPLACE(r.type, ' ', '_'))
);

-- 2. Point every room at its type.
UPDATE rooms SET room_type_id =
  'roomtype-' || branch_id || '-' || UPPER(REPLACE(type, ' ', '_'))
WHERE room_type_id IS NULL;

-- 3. Existing reservations inherit the type of the room they hold.
UPDATE reservations SET room_type_id = (
  SELECT rm.room_type_id FROM rooms rm WHERE rm.id = reservations.room_id
)
WHERE room_type_id IS NULL AND room_id IS NOT NULL;

-- 4. A BAR (Best Available Rate) base plan per branch. Every property has
--    one whether or not it calls it that, and derived plans need something
--    to derive from.
INSERT INTO rate_plans (id, branch_id, code, name, plan_type, is_refundable, effective_from, is_active, created_at)
SELECT 'rateplan-BAR-' || b.id, b.id, 'BAR', 'Best Available Rate', 'base', 1, 0, 1,
       CAST(STRFTIME('%s', 'now') AS INTEGER)
FROM branches b
WHERE NOT EXISTS (SELECT 1 FROM rate_plans p WHERE p.branch_id = b.id AND p.code = 'BAR');

-- 5. Seed rate_calendar from the rates existing reservations were actually
--    sold at, one row per (type, night) they occupied. This is the only
--    honest source: it is what the property really charged. Nights with no
--    history get no row and fall through to the type's base rate.
INSERT OR IGNORE INTO rate_calendar (id, branch_id, rate_plan_id, room_type_id, stay_date, rate_kobo, updated_at)
SELECT
  'ratecal-' || rni.room_id || '-' || rni.stay_date,
  rni.branch_id,
  'rateplan-BAR-' || rni.branch_id,
  rm.room_type_id,
  rni.stay_date,
  res.rate_kobo,
  CAST(STRFTIME('%s', 'now') AS INTEGER)
FROM room_night_inventory rni
  JOIN rooms rm ON rm.id = rni.room_id
  JOIN reservations res ON res.id = rni.reservation_id
WHERE rm.room_type_id IS NOT NULL AND res.rate_kobo > 0;

-- 6. inventory_calendar for the next 400 days, from the real room counts.
--    400 rather than 365 so a booking made today for "this time next year"
--    still lands inside the horizon; the night audit extends it nightly.
WITH RECURSIVE days(n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM days WHERE n < 399
)
INSERT OR IGNORE INTO inventory_calendar
  (id, branch_id, room_type_id, stay_date, total_rooms, sold, blocked, out_of_order, overbooking_limit)
SELECT
  'inv-' || t.id || '-' || (CAST(STRFTIME('%s', DATE('now')) AS INTEGER) + d.n * 86400),
  t.branch_id,
  t.id,
  CAST(STRFTIME('%s', DATE('now')) AS INTEGER) + d.n * 86400,
  (SELECT COUNT(*) FROM rooms rm WHERE rm.room_type_id = t.id),
  0, 0,
  (SELECT COUNT(*) FROM rooms rm
    WHERE rm.room_type_id = t.id AND rm.status IN ('out_of_service', 'maintenance')),
  0
FROM room_types t CROSS JOIN days d;

-- 7. Reconcile `sold` with the bookings that already exist. Every night held
--    in room_night_inventory by a live reservation is a sold night, and the
--    counter must start out agreeing with them or availability is wrong from
--    the first request.
UPDATE inventory_calendar SET sold = (
  SELECT COUNT(*)
    FROM room_night_inventory rni
    JOIN rooms rm ON rm.id = rni.room_id
    JOIN reservations res ON res.id = rni.reservation_id
   WHERE rm.room_type_id = inventory_calendar.room_type_id
     AND rni.stay_date = inventory_calendar.stay_date
     AND res.status IN ('confirmed', 'pending', 'checked_in')
);

-- ─── New permissions (the rule from migration 0006) ─────────────────────
CREATE TEMP TABLE _permission_grants (role_id TEXT, permission TEXT);
INSERT INTO _permission_grants (role_id, permission) VALUES
  -- Rate and inventory setup is revenue management, not front-desk work.
  ('FIN', 'rates:manage'),
  ('IT',  'rates:manage'),
  -- Reservations staff need to see and quote rates; they cannot set them.
  ('RSV', 'rates:read'),
  ('FD',  'rates:read'),
  ('FIN', 'rates:read'),
  ('RSV', 'inventory:calendar'),
  ('FD',  'inventory:calendar'),
  ('FIN', 'inventory:calendar');

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
