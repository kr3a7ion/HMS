-- Migration 0003 -- room-night inventory, the real double-booking guard.
--
-- Backend Blueprint B3. Until now "is this room free?" was answered by
-- scanning reservations for a date overlap and then inserting -- a classic
-- check-then-write race. Application logic cannot close that on its own;
-- only the database can, and it does it with a unique index.
--
-- One row per room per night. The UNIQUE (room_id, stay_date) constraint is
-- what actually prevents a double booking: two concurrent requests for the
-- same night cannot both insert, whatever the application code does, and
-- whatever order the two transactions interleave in. The overlap check that
-- remains in the route is now only there to produce a friendly error before
-- the constraint fires -- it is the courtesy, not the guarantee.
--
-- stay_date is midnight UTC of the night being occupied, stored as unix
-- seconds like every other timestamp here. A stay from the 1st to the 3rd
-- occupies the nights of the 1st and 2nd -- the checkout date is NOT a
-- night, which is why a same-day turnover is legal.

CREATE TABLE IF NOT EXISTS room_night_inventory (
  id             TEXT PRIMARY KEY,
  branch_id      TEXT NOT NULL REFERENCES branches(id),
  room_id        TEXT NOT NULL REFERENCES rooms(id),
  stay_date      INTEGER NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  created_at     INTEGER NOT NULL,
  UNIQUE (room_id, stay_date)
);

CREATE INDEX IF NOT EXISTS idx_rni_reservation ON room_night_inventory(reservation_id);
CREATE INDEX IF NOT EXISTS idx_rni_branch_date ON room_night_inventory(branch_id, stay_date);

-- Backfill from existing reservations that still hold a room. Cancelled and
-- no-show reservations are excluded: they do not occupy inventory, and
-- including them would make already-released rooms unbookable.
--
-- A recursive CTE walks each reservation's nights from check-in up to (but
-- not including) check-out. INSERT OR IGNORE rather than plain INSERT
-- because historical data predates the constraint and may already contain
-- genuine overlaps -- this migration must not fail on a mess it inherited.
-- Any such overlap simply keeps whichever reservation is walked first; the
-- constraint prevents new ones from here on.
WITH RECURSIVE nights(reservation_id, branch_id, room_id, stay_date, check_out) AS (
  SELECT
    r.id,
    r.branch_id,
    r.room_id,
    CAST(strftime('%s', date(r.check_in_date, 'unixepoch')) AS INTEGER),
    CAST(strftime('%s', date(r.check_out_date, 'unixepoch')) AS INTEGER)
  FROM reservations r
  WHERE r.room_id IS NOT NULL
    AND r.status NOT IN ('cancelled', 'no_show')
    AND r.check_out_date > r.check_in_date

  UNION ALL

  SELECT reservation_id, branch_id, room_id, stay_date + 86400, check_out
  FROM nights
  WHERE stay_date + 86400 < check_out
)
INSERT OR IGNORE INTO room_night_inventory (id, branch_id, room_id, stay_date, reservation_id, created_at)
SELECT
  lower(hex(randomblob(12))),
  branch_id,
  room_id,
  stay_date,
  reservation_id,
  CAST(strftime('%s', 'now') AS INTEGER)
FROM nights;
