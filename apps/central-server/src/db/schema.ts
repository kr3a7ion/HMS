// Central server schema -- Blueprint Part 0.7 (multi-tenancy) and Auth doc
// Parts 3-4. Deliberately NOT a full mirror of the branch-local schema:
// this server owns organization/billing/provisioning records and
// aggregated per-branch KPI snapshots, not a copy of every branch's
// operational data (reservations, folios, work orders, etc. stay local --
// see the sync scope note in ROADMAP.md Phase 3).
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// One record per client business (Blueprint 0.3).
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  planTier: text("plan_tier").notNull().default("starter"), // starter|growth|business
  billingStatus: text("billing_status").notNull().default("current"), // current|overdue|suspended
  // Module licensing (Blueprint 0.6 "Module licensing control") -- synced
  // down to a branch's local Settings > Enabled Modules on next pull.
  enabledModulesJson: text("enabled_modules_json").notNull().default('["restaurant","inventory","multiBranch","doorLock"]'),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// One record per branch, provisioned by the Platform Owner (Blueprint 0.4/0.5
// step 4). `syncKey` is issued at provisioning and configured into that
// branch's local server -- the credential a local server uses to push/pull,
// distinct from any staff member's login.
export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  syncKeyHash: text("sync_key_hash").notNull(),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  lastSyncStatus: text("last_sync_status").notNull().default("never"), // never|ok|error
  lastSyncError: text("last_sync_error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // Phase 4 distribution (Auth/Distribution doc Part 11). currentVersion
  // and lastUpdateCheckAt are reported BY the branch on every sync push --
  // this table never invents a version for a branch that hasn't told us
  // one. updateChannel/forceUpdateRequested/rollbackToVersion are set
  // FROM here (Admin Console) and picked up by the branch on its next
  // sync pull -- same asymmetric push-your-own/pull-others'-state pattern
  // the KPI sync already uses, not a new protocol.
  currentVersion: text("current_version"),
  lastUpdateCheckAt: integer("last_update_check_at", { mode: "timestamp" }),
  lastUpdateStatus: text("last_update_status"), // up_to_date|update_available|updating|failed
  updateChannel: text("update_channel").notNull().default("stable"), // stable|beta|<pinned version>
  forceUpdateRequestedAt: integer("force_update_requested_at", { mode: "timestamp" }),
  rollbackToVersion: text("rollback_to_version"),
});

// Organization Super Admin accounts (Auth doc Part 4) -- a separate table
// from any branch's local `users`, per Auth doc 4.3: "exists in two
// places... central copy is the source of truth." Deliberately not
// bidirectionally synced with local `users` rows in this pass -- see
// ROADMAP.md for what "Account Synchronization" (4.3) would take to build
// for real (password-change propagation in both directions).
export const orgUsers = sqliteTable("org_users", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Platform Owner account(s) (Auth doc Part 3) -- "One account" per the doc,
// modeled as a table (not a hardcoded singleton) so the seed/provisioning
// path stays consistent with everything else, and so a second admin could
// exist if the business ever needed one.
export const adminUsers = sqliteTable("admin_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // Auth doc 3.5: mandatory TOTP, no bypass. totpSecret is written as soon
  // as enrollment starts (POST /auth/admin/mfa/enroll/start) but MFA isn't
  // considered active -- and login can't complete -- until totpEnabledAt is
  // set, which only happens after the admin proves they can generate a
  // real code from it (POST /auth/admin/mfa/enroll/confirm). See auth/totp.ts.
  totpSecret: text("totp_secret"),
  totpEnabledAt: integer("totp_enabled_at", { mode: "timestamp" }),
});

// Append-only KPI snapshots pushed up by a branch's local server on each
// sync (POST /sync/push). History, not just "latest", so MB-02 Branch
// Comparison can show a real trend across syncs, not just a point-in-time
// number.
export const branchSnapshots = sqliteTable("branch_snapshots", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  occupancyRate: real("occupancy_rate").notNull(),
  revenueToday: real("revenue_today").notNull(),
  activeGuests: integer("active_guests").notNull(),
  openIssues: integer("open_issues").notNull(),
  roomsTotal: integer("rooms_total").notNull(),
  adr: real("adr").notNull().default(0),
  revpar: real("revpar").notNull().default(0),
  branchManagerName: text("branch_manager_name"),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull(),
});

// Platform-level audit trail (Auth doc 3.4/3.5) -- Platform Owner actions
// and sync events. Separate from any branch's own local audit_log.
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  actorType: text("actor_type").notNull(), // admin|org_user|branch_sync
  actorId: text("actor_id"),
  organizationId: text("organization_id"),
  branchId: text("branch_id"),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
