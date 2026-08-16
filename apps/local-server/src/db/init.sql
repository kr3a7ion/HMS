-- HISTORICAL ONLY -- THIS FILE NO LONGER RUNS.
--
-- Superseded by the migration system (Backend Blueprint B1). Its content was
-- frozen verbatim as src/db/migrations/0001_baseline.sql, which is what
-- actually creates the schema now. db/client.ts no longer reads this file,
-- and the `columnDefaults` self-healer that used to patch missing columns on
-- every boot has been deleted along with it.
--
-- Kept in the tree as the provenance of 0001 and nothing else. DO NOT EDIT
-- IT EXPECTING AN EFFECT: schema changes go in a new numbered migration
-- under src/db/migrations/. Editing 0001_baseline.sql itself is worse --
-- its checksum is verified on every boot and a mismatch refuses to start.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  address TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  check_in_time TEXT NOT NULL DEFAULT '14:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00',
  currency TEXT NOT NULL DEFAULT 'NGN',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  tax_name TEXT NOT NULL DEFAULT 'VAT',
  tax_rate REAL NOT NULL DEFAULT 7.5,
  tax_inclusive INTEGER NOT NULL DEFAULT 0,
  rate_rounding INTEGER NOT NULL DEFAULT 0,
  discount_approval_threshold REAL NOT NULL DEFAULT 0,
  enabled_modules_json TEXT NOT NULL DEFAULT '["restaurant","inventory","multiBranch","doorLock"]'
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  created_at INTEGER NOT NULL,
  employee_id TEXT,
  department TEXT,
  phone TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  start_date INTEGER,
  pay_rate REAL,
  contract_type TEXT
);

-- HR-03 Roles & Permissions. id is the literal role code for the 12
-- built-in roles (PLT ORG MGT FD RSV HK MX RT RO CS FIN IT), so a fresh
-- users.role value is always a valid roles.id with no migration needed.
-- Bootstrapped by server/src/db/client.ts if empty (fresh installs), same
-- self-healing pattern as everything else in that file.
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_system_role INTEGER NOT NULL DEFAULT 0,
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  refresh_token_hash TEXT,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_active_at INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  is_offline_mode INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  number TEXT NOT NULL,
  type TEXT NOT NULL,
  floor TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  housekeeping_status TEXT NOT NULL DEFAULT 'clean',
  assigned_attendant_id TEXT REFERENCES users(id),
  priority INTEGER NOT NULL DEFAULT 0,
  dnd INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rooms_branch ON rooms(branch_id);

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reported',
  description TEXT NOT NULL,
  assigned_technician_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_work_orders_branch ON work_orders(branch_id);

CREATE TABLE IF NOT EXISTS work_order_events (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id),
  event_type TEXT NOT NULL,
  note TEXT,
  performed_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_order_events_wo ON work_order_events(work_order_id);

CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  id_type TEXT,
  id_number TEXT,
  vip INTEGER NOT NULL DEFAULT 0,
  blacklisted INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at INTEGER NOT NULL,
  nationality TEXT
);
CREATE INDEX IF NOT EXISTS idx_guests_branch ON guests(branch_id);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  guest_id TEXT NOT NULL REFERENCES guests(id),
  room_id TEXT REFERENCES rooms(id),
  check_in_date INTEGER NOT NULL,
  check_out_date INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  rate REAL NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER NOT NULL DEFAULT 0,
  special_requests TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  disputed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reservations_branch ON reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_reservations_room ON reservations(room_id);
CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(guest_id);

CREATE TABLE IF NOT EXISTS folio_charges (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  posted_by TEXT NOT NULL REFERENCES users(id),
  posted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_folio_charges_reservation ON folio_charges(reservation_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  received_by TEXT NOT NULL REFERENCES users(id),
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_reservation ON payments(reservation_id);

CREATE TABLE IF NOT EXISTS menu_categories (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_menu_categories_branch ON menu_categories(branch_id);

CREATE TABLE IF NOT EXISTS menu_items (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  category_id TEXT NOT NULL REFERENCES menu_categories(id),
  name TEXT NOT NULL,
  price REAL NOT NULL,
  available INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_menu_items_branch ON menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  label TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'available'
);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch ON restaurant_tables(branch_id);

CREATE TABLE IF NOT EXISTS restaurant_orders (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  table_id TEXT REFERENCES restaurant_tables(id),
  room_reservation_id TEXT REFERENCES reservations(id),
  status TEXT NOT NULL DEFAULT 'open',
  server_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  payment_method TEXT,
  paid_amount REAL
);
CREATE INDEX IF NOT EXISTS idx_restaurant_orders_branch ON restaurant_orders(branch_id);

CREATE TABLE IF NOT EXISTS restaurant_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES restaurant_orders(id),
  menu_item_id TEXT NOT NULL REFERENCES menu_items(id),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_restaurant_order_items_order ON restaurant_order_items(order_id);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  item_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  current_stock REAL NOT NULL DEFAULT 0,
  par_level REAL NOT NULL,
  reorder_threshold REAL NOT NULL,
  unit_cost REAL NOT NULL,
  location TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  reference TEXT,
  logged_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_branch ON stock_transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_product ON stock_transactions(product_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  category TEXT,
  payment_terms TEXT,
  last_order_date INTEGER
);
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  po_number TEXT NOT NULL,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  received_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_branch ON purchase_orders(branch_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity REAL NOT NULL,
  unit_cost REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  type TEXT NOT NULL,
  name TEXT,
  user_a_id TEXT REFERENCES users(id),
  user_b_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_channels_branch ON chat_channels(branch_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  emergency INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id);

-- CO-02 Guest Messaging -- see schema.ts's guestMessageThreads/guestMessages
-- comment for why this is a real staff-facing communication log, not an
-- actual WhatsApp/SMS sending gateway (no third-party credentials exist
-- in this environment, same class of gap as TTLock/Docker).
CREATE TABLE IF NOT EXISTS guest_message_threads (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  guest_id TEXT NOT NULL REFERENCES guests(id),
  status TEXT NOT NULL DEFAULT 'open',
  forwarded_to_department TEXT,
  escalated_at INTEGER,
  resolved_at INTEGER,
  resolved_by TEXT REFERENCES users(id),
  last_message_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_message_threads_branch ON guest_message_threads(branch_id);
CREATE INDEX IF NOT EXISTS idx_guest_message_threads_guest ON guest_message_threads(guest_id);

CREATE TABLE IF NOT EXISTS guest_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES guest_message_threads(id),
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  logged_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_messages_thread ON guest_messages(thread_id);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_audience TEXT NOT NULL DEFAULT 'all',
  expires_at INTEGER,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_branch ON announcements(branch_id);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  read_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_ann ON announcement_reads(announcement_id);

CREATE TABLE IF NOT EXISTS shift_handovers (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  shift_name TEXT NOT NULL,
  outgoing_staff_id TEXT NOT NULL REFERENCES users(id),
  outstanding_tasks TEXT,
  vip_guests TEXT,
  maintenance_issues TEXT,
  guest_complaints TEXT,
  pending_payments TEXT,
  general_notes TEXT,
  created_at INTEGER NOT NULL,
  acknowledged_by TEXT REFERENCES users(id),
  acknowledged_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_shift_handovers_branch ON shift_handovers(branch_id);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  inspector_id TEXT NOT NULL REFERENCES users(id),
  result TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inspections_branch ON inspections(branch_id);
CREATE INDEX IF NOT EXISTS idx_inspections_room ON inspections(room_id);

CREATE TABLE IF NOT EXISTS lost_found_items (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  description TEXT NOT NULL,
  location_found TEXT,
  logged_by TEXT NOT NULL REFERENCES users(id),
  claimed_by TEXT,
  status TEXT NOT NULL DEFAULT 'held',
  disposed_reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lost_found_branch ON lost_found_items(branch_id);

CREATE TABLE IF NOT EXISTS staff_notes (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_notes_user ON staff_notes(user_id);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  notes TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at INTEGER NOT NULL,
  decided_by TEXT REFERENCES users(id),
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_branch ON leave_requests(branch_id);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  shift_type TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user_date ON shifts(user_id, date);

CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'local',
  status TEXT NOT NULL DEFAULT 'completed',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  restored_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_branch ON backup_snapshots(branch_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  language TEXT NOT NULL DEFAULT 'en',
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format TEXT NOT NULL DEFAULT '24h',
  notification_prefs_json TEXT NOT NULL DEFAULT '{"reservations":true,"housekeeping":true,"maintenance":true,"finance":true,"doorLock":true,"chat":true,"shiftHandover":true}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  last_push_at INTEGER,
  last_push_status TEXT NOT NULL DEFAULT 'never',
  last_push_error TEXT,
  last_pull_at INTEGER,
  last_pull_status TEXT NOT NULL DEFAULT 'never',
  last_pull_error TEXT,
  central_organization_name TEXT,
  central_enabled_modules_json TEXT,
  update_channel TEXT,
  force_update_requested INTEGER NOT NULL DEFAULT 0,
  rollback_to_version TEXT,
  last_update_check_at INTEGER,
  last_update_status TEXT,
  last_update_error TEXT
);

CREATE TABLE IF NOT EXISTS branch_sync_cache (
  branch_id TEXT PRIMARY KEY,
  branch_name TEXT NOT NULL,
  occupancy_rate REAL,
  revenue_today REAL,
  active_guests INTEGER,
  open_issues INTEGER,
  rooms_total INTEGER,
  adr REAL,
  revpar REAL,
  branch_manager_name TEXT,
  last_sync_at INTEGER,
  last_sync_status TEXT,
  snapshot_at INTEGER,
  cached_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  branch_id TEXT REFERENCES branches(id),
  action TEXT NOT NULL,
  module TEXT,
  record_id TEXT,
  ip_address TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

-- Phase 4: Door Lock & Access Control (Blueprint Part 6)
CREATE TABLE IF NOT EXISTS door_lock_config (
  branch_id TEXT PRIMARY KEY REFERENCES branches(id),
  provider TEXT NOT NULL DEFAULT 'ttlock',
  client_id TEXT,
  client_secret TEXT,
  username TEXT,
  password TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at INTEGER,
  auto_revoke_on_checkout INTEGER NOT NULL DEFAULT 1,
  queue_when_offline INTEGER NOT NULL DEFAULT 1,
  notify_mgt_on_offline_revoke INTEGER NOT NULL DEFAULT 1,
  max_cards_per_check_in INTEGER NOT NULL DEFAULT 3,
  queue_expiry_buffer_hours INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS room_lock_mappings (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id),
  ttlock_lock_id TEXT NOT NULL,
  lock_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_credentials (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  reservation_id TEXT NOT NULL REFERENCES reservations(id),
  guest_id TEXT NOT NULL REFERENCES guests(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  credential_type TEXT NOT NULL,
  credential_reference TEXT,
  ttlock_card_id TEXT,
  ttlock_keyboard_pwd_id TEXT,
  valid_from INTEGER NOT NULL,
  valid_to INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_sync',
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  parent_credential_id TEXT,
  issued_by TEXT NOT NULL REFERENCES users(id),
  issued_at INTEGER NOT NULL,
  revoked_by TEXT REFERENCES users(id),
  revoked_at INTEGER,
  revoke_reason TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  ttlock_api_response TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS lock_sync_queue (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  command_type TEXT NOT NULL,
  credential_id TEXT NOT NULL REFERENCES access_credentials(id),
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_retry_at INTEGER,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_log TEXT
);

CREATE TABLE IF NOT EXISTS key_card_events (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES access_credentials(id),
  event_type TEXT NOT NULL,
  performed_by TEXT REFERENCES users(id),
  performed_at INTEGER NOT NULL,
  details TEXT,
  ip_address TEXT
);

-- Blueprint 6.3 / Auth doc 9.4: audit_log and key_card_events must be
-- append-only at the DB level, not just "nothing in the app happens to
-- issue UPDATE/DELETE against them." SQLite has no per-connection role
-- system to GRANT/REVOKE against (a real Postgres deployment would use
-- that instead -- see ROADMAP.md), but triggers that RAISE(ABORT, ...) on
-- UPDATE/DELETE are a genuine DB-level guarantee: they fire regardless of
-- which code path (or a future bug, or a stray manual query) attempts the
-- write, not just the routes this codebase currently has.
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS key_card_events_no_update BEFORE UPDATE ON key_card_events
BEGIN SELECT RAISE(ABORT, 'key_card_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS key_card_events_no_delete BEFORE DELETE ON key_card_events
BEGIN SELECT RAISE(ABORT, 'key_card_events is append-only'); END;
