-- Migration 0010 -- signed update channel and rollback history.
--
-- Backend Blueprint B18. The Production blueprint calls the unsigned
-- auto-update channel "the highest severity in the repo", and it is right:
-- the updater pulls a MUTABLE Docker tag and swaps the running container.
-- Anyone who can push to that tag -- a compromised registry account, a
-- typo-squatted repository name, anyone on the network path without TLS --
-- executes arbitrary code as root on every property, simultaneously, with no
-- human in the loop and no record of what changed.
--
-- Three things fix it, and all three are decisions this table records:
--   1. the image is SIGNED and verified against a key pinned in the binary;
--   2. the tag is resolved to a DIGEST and pulled by digest, so what was
--      verified is what runs;
--   3. a swap that fails its health check ROLLS BACK by itself.

-- ─── update_attempts ─────────────────────────────────────────────────────
-- One row per attempt, written BEFORE the swap and updated as it proceeds.
-- Written first on purpose: an update that bricks the container must still
-- leave a record of what was tried and how far it got, or the operator is
-- left diffing container logs to find out why the property is down.
CREATE TABLE IF NOT EXISTS update_attempts (
  id                  TEXT PRIMARY KEY,
  branch_id           TEXT REFERENCES branches(id),
  -- What was requested, and what it actually resolved to.
  requested_ref       TEXT NOT NULL,          -- the tag or channel asked for
  resolved_digest     TEXT,                   -- sha256:... the tag pointed at
  previous_digest     TEXT,                   -- what was running before
  ring                TEXT,                   -- canary|early|general
  schema_version      INTEGER,                -- the DB version at attempt time
  release_schema_version INTEGER,             -- the version the image expects
  -- Where it got to. `refused` means policy said no and NOTHING was swapped,
  -- which is a success for the guard even though it is a failed update.
  status              TEXT NOT NULL,
                      -- refused|swapping|health_check|succeeded|rolled_back|failed
  refusal_reason      TEXT,                   -- machine-readable code
  signature_status    TEXT NOT NULL DEFAULT 'unverified',
                      -- verified|unsigned|unknown_key|invalid|unverified
  signature_key_id    TEXT,                   -- which pinned key matched
  health_result       TEXT,                   -- passed|failed|not_run
  health_detail       TEXT,
  rolled_back_to      TEXT,                   -- digest restored, if any
  started_at          INTEGER NOT NULL,
  finished_at         INTEGER,
  error               TEXT
);
CREATE INDEX IF NOT EXISTS idx_update_attempts_started ON update_attempts(started_at);

-- ─── The branch's deployment identity ────────────────────────────────────
-- ring: central assigns it (B18.4). A canary property takes releases first so
-- a bad one is found on one site rather than all of them; `general` only ever
-- sees a release once it has been marked available for general.
--
-- Defaults to 'general' -- the SAFEST ring, not the most convenient. A branch
-- whose ring failed to sync should receive fewer updates, not more.
ALTER TABLE sync_state ADD COLUMN update_ring TEXT NOT NULL DEFAULT 'general';
-- The digest actually running, so a rollback has somewhere to go and central
-- can see what each property is on (B18.6).
ALTER TABLE sync_state ADD COLUMN current_image_digest TEXT;
ALTER TABLE sync_state ADD COLUMN previous_image_digest TEXT;
ALTER TABLE sync_state ADD COLUMN last_signature_status TEXT;
ALTER TABLE sync_state ADD COLUMN last_health_check_at INTEGER;
ALTER TABLE sync_state ADD COLUMN last_health_result TEXT;
-- B18.7: the registry credential moves under lib/secrets.ts, so it is stored
-- encrypted like the door-lock credentials rather than sitting in an
-- environment variable that ends up in a process listing and a shell history.
ALTER TABLE sync_state ADD COLUMN registry_username TEXT;
ALTER TABLE sync_state ADD COLUMN registry_password_encrypted TEXT;
