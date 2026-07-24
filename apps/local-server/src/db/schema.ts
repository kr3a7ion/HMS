// Drizzle schema for the Phase 1 slice only: auth + Front Desk
// (Reservation Grid -> New Reservation -> Check-In -> Folio -> Check-Out).
// Full schema per Blueprint Part 6.3 (access_credentials, lock_sync_queue,
// key_card_events) and every other module lands in Phase 2+ as each module
// is wired to real data. Don't add tables here ahead of the module that
// needs them — see guidelines/Guidelines.md.
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // ST-01 Property Configuration. MB-01/02/03's cross-branch aggregation
  // and ST-02 Synchronization stay mock -- both need the central server,
  // which is Phase 3. ST-01 is single-branch config, no such dependency.
  address: text("address"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  checkInTime: text("check_in_time").notNull().default("14:00"),
  checkOutTime: text("check_out_time").notNull().default("11:00"),
  currency: text("currency").notNull().default("NGN"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  taxName: text("tax_name").notNull().default("VAT"),
  taxRate: real("tax_rate").notNull().default(7.5),
  taxInclusive: integer("tax_inclusive", { mode: "boolean" }).notNull().default(false),
  rateRounding: integer("rate_rounding").notNull().default(0), // round rates to nearest N naira; 0 = off
  discountApprovalThreshold: real("discount_approval_threshold").notNull().default(0),
  // JSON array of module keys ("restaurant"|"inventory"|"multiBranch"|"doorLock").
  // Drives sidebar visibility for those four optional modules -- see the NAV
  // filtering in App.tsx. Core modules (Reservations, Front Desk, HK, MX)
  // aren't toggleable, matching the Blueprint's "required" modules.
  enabledModulesJson: text("enabled_modules_json").notNull().default('["restaurant","inventory","multiBranch","doorLock"]'),
});

// Role codes match Blueprint Part 2.4 exactly: PLT ORG MGT FD RSV HK MX RT RO CS FIN IT
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  status: text("status").notNull().default("active"), // active | suspended | deactivated
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // HR-01/02 profile fields. Added to the existing `users` row rather than a
  // separate staff-profile table -- a staff member and a login account are
  // the same entity here, there's no case in this codebase where one exists
  // without the other.
  employeeId: text("employee_id"),
  department: text("department"),
  phone: text("phone"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  startDate: integer("start_date", { mode: "timestamp" }),
  payRate: real("pay_rate"), // monthly base, NGN -- HR-06 Payroll Summary
  contractType: text("contract_type"), // "Full-time" | "Part-time" | "Contract" -- free text, HR sets it
});

// HR-03 Roles & Permissions (Blueprint Part 2.5 / HR-03: "Role list left;
// permission matrix for selected role right"). Replaces the static map that
// used to live in auth/permissions.ts -- that file's own header comment
// always described this as the intended seam: "when it lands, this static
// map gets replaced by a DB lookup, and the hash computation itself stays
// the same." id is the literal role code for the 12 built-in roles (PLT
// ORG MGT FD RSV HK MX RT RO CS FIN IT — Blueprint 2.4), so `users.role`
// needs no migration: every existing account's role string already is a
// valid roles.id. Custom roles get a generated id instead.
// permissionsJson is the real, editable grant list checked by
// requirePermission() in auth/middleware.ts (route-level enforcement, not
// just cosmetic) — "*" means unrestricted, used only by the three built-in
// roles the Blueprint treats as full-access (Platform Owner/Org Super
// Admin/Branch Manager).
export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isSystemRole: integer("is_system_role", { mode: "boolean" }).notNull().default(false),
  permissionsJson: text("permissions_json").notNull().default("[]"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Auth doc Part 6.5 — active_sessions table, checked on every request.
export const activeSessions = sqliteTable("active_sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  refreshTokenHash: text("refresh_token_hash"),
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  lastActiveAt: integer("last_active_at", { mode: "timestamp" }),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  isOfflineMode: integer("is_offline_mode", { mode: "boolean" }).notNull().default(false),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  revokeReason: text("revoke_reason"),
});

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  number: text("number").notNull(),
  type: text("type").notNull(),
  floor: text("floor"),
  status: text("status").notNull().default("available"), // available|reserved|occupied|cleaning|maintenance|out_of_service
  // Housekeeping (HK-01) fields -- deliberately a separate axis from
  // `status` above: `status` is the front-desk/booking view (is this room
  // sellable right now), `housekeepingStatus` is the cleaning workflow.
  // Check-in requires both `status: available` AND
  // `housekeepingStatus: clean|inspected` (Blueprint FD-01 step 3).
  housekeepingStatus: text("housekeeping_status").notNull().default("clean"), // dirty|in_progress|clean|inspected
  assignedAttendantId: text("assigned_attendant_id").references(() => users.id),
  priority: integer("priority", { mode: "boolean" }).notNull().default(false),
  dnd: integer("dnd", { mode: "boolean" }).notNull().default(false),
});

export const guests = sqliteTable("guests", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  vip: integer("vip", { mode: "boolean" }).notNull().default(false),
  blacklisted: integer("blacklisted", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  nationality: text("nationality"), // RP-04 Guest Analytics nationality breakdown
});

export const reservations = sqliteTable("reservations", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  guestId: text("guest_id").notNull().references(() => guests.id),
  roomId: text("room_id").references(() => rooms.id),
  checkInDate: integer("check_in_date", { mode: "timestamp" }).notNull(),
  checkOutDate: integer("check_out_date", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("confirmed"), // confirmed|pending|checked_in|checked_out|cancelled|no_show
  rate: real("rate").notNull(),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  specialRequests: text("special_requests"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // FI-01 folio status: a reservation is "disputed" when Finance flags its
  // folio for review -- independent of checked_in/checked_out, which
  // already covers "open" (in-house) vs "closed" (settled at checkout).
  disputed: integer("disputed", { mode: "boolean" }).notNull().default(false),
});

export const folioCharges = sqliteTable("folio_charges", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
  postedBy: text("posted_by").notNull().references(() => users.id),
  postedAt: integer("posted_at", { mode: "timestamp" }).notNull(),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  amount: real("amount").notNull(),
  method: text("method").notNull(), // cash|card|transfer
  receivedBy: text("received_by").notNull().references(() => users.id),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
});

// MX-01/02/03 Work Orders.
export const workOrders = sqliteTable("work_orders", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  location: text("location").notNull(),
  category: text("category").notNull(), // Electrical|HVAC|Plumbing|Furniture|Equipment|General
  priority: text("priority").notNull(), // low|medium|high
  status: text("status").notNull().default("reported"), // reported|assigned|in_progress|completed
  description: text("description").notNull(),
  assignedTechnicianId: text("assigned_technician_id").references(() => users.id),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
});

// Append-only activity timeline for a work order -- created/assigned/status
// changes/notes, same pattern as key_card_events in the Blueprint.
export const workOrderEvents = sqliteTable("work_order_events", {
  id: text("id").primaryKey(),
  workOrderId: text("work_order_id").notNull().references(() => workOrders.id),
  eventType: text("event_type").notNull(), // created|assigned|status_changed|note|closed
  note: text("note"),
  performedBy: text("performed_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// RT-04 Menu Management.
export const menuCategories = sqliteTable("menu_categories", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  categoryId: text("category_id").notNull().references(() => menuCategories.id),
  name: text("name").notNull(),
  price: real("price").notNull(),
  available: integer("available", { mode: "boolean" }).notNull().default(true), // false == "86'd"
});

// RT-03 Table Management. Named restaurant_tables, not "tables" -- avoids
// both the SQL keyword and confusion with the hotel's `rooms`.
export const restaurantTables = sqliteTable("restaurant_tables", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  label: text("label").notNull(),
  seats: integer("seats").notNull().default(2),
  status: text("status").notNull().default("available"), // available|occupied|reserved|dirty
});

// RT-01 POS Terminal, RT-02 Kitchen Display, RT-06 Room Service. One order
// model for both: dine-in has tableId set, room service has
// roomReservationId set -- exactly one of the two, enforced in the route
// handler rather than a DB constraint (SQLite CHECK across nullable FKs is
// more trouble than it's worth here).
export const restaurantOrders = sqliteTable("restaurant_orders", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  tableId: text("table_id").references(() => restaurantTables.id),
  roomReservationId: text("room_reservation_id").references(() => reservations.id),
  status: text("status").notNull().default("open"), // open|sent_to_kitchen|served|closed
  serverId: text("server_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  paymentMethod: text("payment_method"), // set only when closed direct (not posted to room)
  paidAmount: real("paid_amount"),
});

export const restaurantOrderItems = sqliteTable("restaurant_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => restaurantOrders.id),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(), // denormalized at order time
  quantity: integer("quantity").notNull().default(1),
  unitPrice: real("unit_price").notNull(),
  status: text("status").notNull().default("pending"), // pending|ready|served
});

// IV-02 Products/Items -- also backs HK-06 Linen & Supplies as a
// category-filtered view (category "Linen"), rather than a second,
// duplicate stock table. See ROADMAP.md for why HK-06 waited for this
// module instead of getting its own table back in the Housekeeping pass.
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  itemCode: text("item_code").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(), // Linen|Toiletries|F&B|Kitchen|Cleaning|...
  unit: text("unit").notNull(), // pcs|kg|L|sets|...
  currentStock: real("current_stock").notNull().default(0),
  parLevel: real("par_level").notNull(),
  reorderThreshold: real("reorder_threshold").notNull(),
  unitCost: real("unit_cost").notNull(),
  location: text("location"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// IV-04 Stock Transactions -- append-only movement log. Every change to
// products.currentStock happens through inserting one of these, whether
// triggered manually (IV-02 "Adjust") or automatically (a received PO).
export const stockTransactions = sqliteTable("stock_transactions", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  productId: text("product_id").notNull().references(() => products.id),
  type: text("type").notNull(), // in|out|adjustment
  quantity: real("quantity").notNull(), // signed delta actually applied
  reference: text("reference"),
  loggedBy: text("logged_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// IV-03 Suppliers.
export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
  contact: text("contact"),
  phone: text("phone"),
  category: text("category"),
  paymentTerms: text("payment_terms"),
  lastOrderDate: integer("last_order_date", { mode: "timestamp" }),
});

// IV-05 Purchase Orders.
export const purchaseOrders = sqliteTable("purchase_orders", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  poNumber: text("po_number").notNull(),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id),
  status: text("status").notNull().default("draft"), // draft|sent|received|cancelled
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  receivedAt: integer("received_at", { mode: "timestamp" }),
});

export const purchaseOrderItems = sqliteTable("purchase_order_items", {
  id: text("id").primaryKey(),
  purchaseOrderId: text("purchase_order_id").notNull().references(() => purchaseOrders.id),
  productId: text("product_id").notNull().references(() => products.id),
  quantity: real("quantity").notNull(),
  unitCost: real("unit_cost").notNull(),
});

// CO-01 Internal Chat. Department channels are fixed/seeded, open to every
// branch user (no per-channel membership modeling — small-team LAN chat).
// DMs are two-party channels found-or-created on first message.
export const chatChannels = sqliteTable("chat_channels", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  type: text("type").notNull(), // department|dm
  name: text("name"), // department channel display name; null for dm
  userAId: text("user_a_id").references(() => users.id), // dm only
  userBId: text("user_b_id").references(() => users.id), // dm only
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  channelId: text("channel_id").notNull().references(() => chatChannels.id),
  senderId: text("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  emergency: integer("emergency", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// CO-03 Announcements.
export const announcements = sqliteTable("announcements", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  targetAudience: text("target_audience").notNull().default("all"), // all|<role code>
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const announcementReads = sqliteTable("announcement_reads", {
  id: text("id").primaryKey(),
  announcementId: text("announcement_id").notNull().references(() => announcements.id),
  userId: text("user_id").notNull().references(() => users.id),
  readAt: integer("read_at", { mode: "timestamp" }).notNull(),
});

// CO-04 Shift Handover.
export const shiftHandovers = sqliteTable("shift_handovers", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  shiftName: text("shift_name").notNull(), // Morning|Evening|Night
  outgoingStaffId: text("outgoing_staff_id").notNull().references(() => users.id),
  outstandingTasks: text("outstanding_tasks"),
  vipGuests: text("vip_guests"),
  maintenanceIssues: text("maintenance_issues"),
  guestComplaints: text("guest_complaints"),
  pendingPayments: text("pending_payments"),
  generalNotes: text("general_notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  acknowledgedBy: text("acknowledged_by").references(() => users.id),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
});

// HK-04 Inspection Log.
export const inspections = sqliteTable("inspections", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  roomId: text("room_id").notNull().references(() => rooms.id),
  inspectorId: text("inspector_id").notNull().references(() => users.id),
  result: text("result").notNull(), // pass|fail
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// HK-05 Lost & Found.
export const lostFoundItems = sqliteTable("lost_found_items", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  description: text("description").notNull(),
  locationFound: text("location_found"),
  loggedBy: text("logged_by").notNull().references(() => users.id),
  claimedBy: text("claimed_by"),
  status: text("status").notNull().default("held"), // held|claimed|disposed
  disposedReason: text("disposed_reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// HR-02 Management Notes (one tab of the Staff Profile).
export const staffNotes = sqliteTable("staff_notes", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  userId: text("user_id").notNull().references(() => users.id),
  note: text("note").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// HR-04 Attendance. One row per staff member per day -- route handler
// upserts on (userId, date) rather than a DB unique constraint, same
// approach as the rest of this schema pre-Phase-3.
export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  userId: text("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  status: text("status").notNull(), // present|absent|late|leave
  notes: text("notes"),
  recordedBy: text("recorded_by").notNull().references(() => users.id),
  recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull(),
});

// HR-04 leave requests -- distinct from a day's attendance status: this is
// the pending/approved/rejected workflow that, once approved, is what
// produces a "leave" attendance row for the covered dates.
export const leaveRequests = sqliteTable("leave_requests", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  userId: text("user_id").notNull().references(() => users.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending|approved|rejected
  requestedAt: integer("requested_at", { mode: "timestamp" }).notNull(),
  decidedBy: text("decided_by").references(() => users.id),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
});

// HR-05 Shift Scheduler. One row per staff member per day; "Off" is a real
// row, not the absence of one, so a published week has a complete grid.
export const shifts = sqliteTable("shifts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  userId: text("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD
  shiftType: text("shift_type").notNull(), // Morning|Evening|Night|Off
  published: integer("published", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// IT-04 Backup & Restore. "Local" only -- no cloud storage credentials
// exist in this environment, see ROADMAP.md. Restoring stages a pending
// snapshot instead of live-swapping the open SQLite file; client.ts applies
// it on the next boot (a running process can't safely replace its own open
// DB file mid-request).
export const backupSnapshots = sqliteTable("backup_snapshots", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  fileName: text("file_name").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  type: text("type").notNull().default("local"), // local (cloud deferred)
  status: text("status").notNull().default("completed"), // completed|restore_pending|restored
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  restoredAt: integer("restored_at", { mode: "timestamp" }),
});

// ST-03 My Preferences. One row per user, upserted on first save. Theme and
// dashboard widget layout are deliberately not persisted here -- the app
// has no theming system (every screen uses hardcoded inline colors, not
// CSS variables) and no data-driven/reorderable dashboard widget system to
// apply either to. Storing preferences nothing reads would be exactly the
// kind of fake-looking real data this project has avoided everywhere else.
export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id),
  language: text("language").notNull().default("en"),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  timeFormat: text("time_format").notNull().default("24h"), // 24h|12h
  notificationPrefsJson: text("notification_prefs_json").notNull().default('{"reservations":true,"housekeeping":true,"maintenance":true,"finance":true,"doorLock":true,"chat":true,"shiftHandover":true}'),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// Phase 3 sync. Singleton row (id fixed to "singleton") tracking this
// branch's own push/pull history against the central server -- backs
// ST-02 Synchronization. `centralEnabledModulesJson` is what the central
// server's module licensing (Blueprint 0.7) last said this org is allowed;
// GET /settings/branch intersects it with the local ST-01 toggle so a
// downgraded license actually hides a module even if the local toggle
// still says "on" -- see routes/settings.ts.
export const syncState = sqliteTable("sync_state", {
  id: text("id").primaryKey().default("singleton"),
  lastPushAt: integer("last_push_at", { mode: "timestamp" }),
  lastPushStatus: text("last_push_status").notNull().default("never"), // never|ok|error
  lastPushError: text("last_push_error"),
  lastPullAt: integer("last_pull_at", { mode: "timestamp" }),
  lastPullStatus: text("last_pull_status").notNull().default("never"),
  lastPullError: text("last_pull_error"),
  centralOrganizationName: text("central_organization_name"),
  centralEnabledModulesJson: text("central_enabled_modules_json"),
  // Distribution (Auth/Distribution doc Part 11), mirrored from what the
  // last successful pull returned in its `deployment` object -- see
  // central-server/src/routes/sync.ts.
  updateChannel: text("update_channel"),
  forceUpdateRequested: integer("force_update_requested", { mode: "boolean" }).notNull().default(false),
  rollbackToVersion: text("rollback_to_version"),
  lastUpdateCheckAt: integer("last_update_check_at", { mode: "timestamp" }),
  lastUpdateStatus: text("last_update_status"),
  lastUpdateError: text("last_update_error"),
});

// Cached result of the last successful pull -- every branch in this
// organization as centrally known, so Multi-Branch screens work from a
// local snapshot even while offline (Auth doc 4.1), not a live call to
// the central server on every page load.
export const branchSyncCache = sqliteTable("branch_sync_cache", {
  branchId: text("branch_id").primaryKey(),
  branchName: text("branch_name").notNull(),
  occupancyRate: real("occupancy_rate"),
  revenueToday: real("revenue_today"),
  activeGuests: integer("active_guests"),
  openIssues: integer("open_issues"),
  roomsTotal: integer("rooms_total"),
  adr: real("adr"),
  revpar: real("revpar"),
  branchManagerName: text("branch_manager_name"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  lastSyncStatus: text("last_sync_status"),
  snapshotAt: integer("snapshot_at", { mode: "timestamp" }),
  cachedAt: integer("cached_at", { mode: "timestamp" }).notNull(),
});

// Append-only per Auth doc 9.4. Nothing in this codebase issues UPDATE/DELETE
// against this table — enforced at the DB-role level once Phase 3 stands up
// a real deployment target, not just by omission as it is today.
export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  branchId: text("branch_id").references(() => branches.id),
  action: text("action").notNull(),
  module: text("module"),
  recordId: text("record_id"),
  ipAddress: text("ip_address"),
  details: text("details"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ─── Phase 4: Door Lock & Access Control (Blueprint Part 6) ────────────────
// Master enable/disable reuses branches.enabledModulesJson's "doorLock" flag
// (ST-01) rather than a second toggle here -- see Blueprint 6.11 vs App.tsx's
// NAV filtering, they're the same switch. clientSecret/password are stored
// as given (this is a prototype, not a KMS-backed deployment) but, same
// discipline as PIN codes below, never echoed back in a GET response -- see
// serializeDoorLockConfig() in routes/doorLock.ts.
export const doorLockConfig = sqliteTable("door_lock_config", {
  branchId: text("branch_id").primaryKey().references(() => branches.id),
  provider: text("provider").notNull().default("ttlock"), // only real adapter; UI still shows the picker per Blueprint 6.11
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  username: text("username"),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp" }),
  autoRevokeOnCheckout: integer("auto_revoke_on_checkout", { mode: "boolean" }).notNull().default(true),
  queueWhenOffline: integer("queue_when_offline", { mode: "boolean" }).notNull().default(true),
  notifyMgtOnOfflineRevoke: integer("notify_mgt_on_offline_revoke", { mode: "boolean" }).notNull().default(true),
  maxCardsPerCheckIn: integer("max_cards_per_check_in").notNull().default(3),
  queueExpiryBufferHours: integer("queue_expiry_buffer_hours").notNull().default(1),
});

export const roomLockMappings = sqliteTable("room_lock_mappings", {
  roomId: text("room_id").primaryKey().references(() => rooms.id),
  ttlockLockId: text("ttlock_lock_id").notNull(),
  lockName: text("lock_name").notNull(),
});

// Blueprint 6.3. credentialReference is the only human-visible identifier
// for a PIN ever again after issuance ("74**12") -- the plaintext PIN
// itself is never stored, matching 6.4's "cannot be retrieved after this
// screen" rule. Card numbers ARE stored (cardNumber isn't secret the way a
// PIN is -- it's read off the physical card, same as a hotel key today).
export const accessCredentials = sqliteTable("access_credentials", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  branchId: text("branch_id").notNull().references(() => branches.id),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  guestId: text("guest_id").notNull().references(() => guests.id),
  roomId: text("room_id").notNull().references(() => rooms.id),
  credentialType: text("credential_type").notNull(), // card | pin | physical_key
  credentialReference: text("credential_reference"), // card serial, or masked PIN hint e.g. 74**12
  ttlockCardId: text("ttlock_card_id"),
  ttlockKeyboardPwdId: text("ttlock_keyboard_pwd_id"),
  validFrom: integer("valid_from", { mode: "timestamp" }).notNull(),
  validTo: integer("valid_to", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("pending_sync"), // active | revoked | expired | pending_sync | failed
  isDuplicate: integer("is_duplicate", { mode: "boolean" }).notNull().default(false),
  parentCredentialId: text("parent_credential_id"),
  issuedBy: text("issued_by").notNull().references(() => users.id),
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  revokedBy: text("revoked_by").references(() => users.id),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  revokeReason: text("revoke_reason"), // checkout | lost | expired | manual | emergency
  syncStatus: text("sync_status").notNull().default("pending"), // synced | pending | failed
  ttlockApiResponse: text("ttlock_api_response"), // raw JSON, for debugging -- see 6.3
  notes: text("notes"),
});

// Blueprint 6.3. expiresAt lets the retry loop give up once the guest's
// stay is over rather than retrying an activation nobody needs anymore.
export const lockSyncQueue = sqliteTable("lock_sync_queue", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  commandType: text("command_type").notNull(), // activate_card | activate_pin | revoke_card | revoke_pin
  credentialId: text("credential_id").notNull().references(() => accessCredentials.id),
  payload: text("payload").notNull(), // JSON, full command args to retry
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  lastRetryAt: integer("last_retry_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | success | expired | failed_permanent
  errorLog: text("error_log"),
});

// Append-only per Blueprint 6.6 ("No delete capability") -- same discipline
// as audit_log above.
export const keyCardEvents = sqliteTable("key_card_events", {
  id: text("id").primaryKey(),
  credentialId: text("credential_id").notNull().references(() => accessCredentials.id),
  eventType: text("event_type").notNull(), // issued | duplicate_issued | replacement_issued | revoked | encode_failed | api_failed | queued_offline | sync_success | sync_failed | emergency_revoked
  performedBy: text("performed_by").references(() => users.id), // null = system
  performedAt: integer("performed_at", { mode: "timestamp" }).notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
});
