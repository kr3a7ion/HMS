// Drizzle schema for the Phase 1 slice only: auth + Front Desk
// (Reservation Grid -> New Reservation -> Check-In -> Folio -> Check-Out).
// Full schema per Blueprint Part 6.3 (access_credentials, lock_sync_queue,
// key_card_events) and every other module lands in Phase 2+ as each module
// is wired to real data. Don't add tables here ahead of the module that
// needs them — see guidelines/Guidelines.md.
import { sqliteTable, text, integer, real, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  // B6 NOTE: these three are no longer the authority on tax -- tax_codes is.
  // They are kept because the Settings > Hotel Configuration screen edits
  // them, and settings.ts now writes them THROUGH to this branch's legacy
  // VAT code so the two can never disagree. Multi-jurisdiction setups
  // (consumption tax, service charge) live only in tax_codes; this pair can
  // only ever express the single federal VAT.
  taxName: text("tax_name").notNull().default("VAT"),
  // Basis points, not a percentage: 7.5% is 750. See lib/money.ts (B2).
  taxRateBp: integer("tax_rate_bp").notNull().default(750),
  taxInclusive: integer("tax_inclusive", { mode: "boolean" }).notNull().default(false),
  rateRounding: integer("rate_rounding").notNull().default(0), // round rates to nearest N naira; 0 = off
  discountApprovalThresholdKobo: integer("discount_approval_threshold_kobo").notNull().default(0),
  // JSON array of module keys ("restaurant"|"inventory"|"multiBranch"|"doorLock").
  // Drives sidebar visibility for those four optional modules -- see the NAV
  // filtering in App.tsx. Core modules (Reservations, Front Desk, HK, MX)
  // aren't toggleable, matching the Blueprint's "required" modules.
  enabledModulesJson: text("enabled_modules_json").notNull().default('["restaurant","inventory","multiBranch","doorLock"]'),
  // Backend Blueprint B5 / invariant 9. The trading day, which is NOT the
  // calendar day: it only advances when the night audit rolls it. Every
  // financial row is stamped with this, so a charge posted at 01:30 belongs
  // to the previous trading day.
  currentBusinessDate: integer("current_business_date", { mode: "timestamp" }).notNull(),
  businessDateRollHour: integer("business_date_roll_hour").notNull().default(3),
  lastAuditRunId: text("last_audit_run_id"),
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
  payRateKobo: integer("pay_rate_kobo"), // monthly base in kobo -- HR-06 Payroll Summary
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

// Backend Blueprint B8 — what a room IS, as opposed to what it is called.
//
// rooms.type was free text ("Standard", "Deluxe"). That column stays because
// the housekeeping and front-desk screens display it, but a type is now a row
// that can carry a rate, an occupancy limit and amenities -- which is what
// makes "what does a Deluxe cost on the 14th?" answerable without asking
// someone.
export const roomTypes = sqliteTable("room_types", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  maxOccupancy: integer("max_occupancy").notNull().default(2),
  bedConfiguration: text("bed_configuration"),
  sizeSqm: integer("size_sqm"),
  amenitiesJson: text("amenities_json").notNull().default("[]"),
  /** Last-resort rate when no calendar row and no derivation applies. */
  baseRateKobo: integer("base_rate_kobo").notNull().default(0),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  branchCode: uniqueIndex("room_types_branch_id_code_unique").on(t.branchId, t.code),
}));

// A DERIVED plan stores no rates. "Corporate = BAR less 15%" is one row,
// computed at read time. Duplicating rows instead would leave every derived
// plan on yesterday's price the moment the base rate moved -- the classic
// revenue-management bug, and one nobody notices until a corporate client
// queries an invoice.
export const ratePlans = sqliteTable("rate_plans", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  planType: text("plan_type").notNull().default("base"), // base|derived|corporate|ota|package
  derivedFromId: text("derived_from_id"),
  derivationType: text("derivation_type"),               // percentage|fixed_offset
  /** Basis points for `percentage`; kobo for `fixed_offset`. Signed. */
  derivationValueBp: integer("derivation_value_bp"),
  cancellationPolicyId: text("cancellation_policy_id"),  // B9
  minStay: integer("min_stay"),
  maxStay: integer("max_stay"),
  advanceDaysMin: integer("advance_days_min"),
  advanceDaysMax: integer("advance_days_max"),
  includesBreakfast: integer("includes_breakfast", { mode: "boolean" }).notNull().default(false),
  isRefundable: integer("is_refundable", { mode: "boolean" }).notNull().default(true),
  effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull(),
  effectiveTo: integer("effective_to", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  branchCode: uniqueIndex("rate_plans_branch_id_code_unique").on(t.branchId, t.code),
}));

// One row per plan per type per night, and ONLY where a rate was actually
// set. Absence means "fall through to the derivation or the type's base
// rate" -- it never means free.
export const rateCalendar = sqliteTable("rate_calendar", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  ratePlanId: text("rate_plan_id").notNull().references(() => ratePlans.id),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
  stayDate: integer("stay_date", { mode: "timestamp" }).notNull(),
  rateKobo: integer("rate_kobo").notNull(),
  minStay: integer("min_stay"),
  closedToArrival: integer("closed_to_arrival", { mode: "boolean" }).notNull().default(false),
  closedToDeparture: integer("closed_to_departure", { mode: "boolean" }).notNull().default(false),
  stopSell: integer("stop_sell", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (t) => ({
  planTypeDate: uniqueIndex("rate_calendar_plan_type_date_unique").on(t.ratePlanId, t.roomTypeId, t.stayDate),
}));

// THE ANSWER TO "IS ANYTHING FREE?". `sold` is incremented in the same
// transaction as the reservation insert, so the count and the bookings cannot
// disagree -- which is exactly what a nightly recount job would be papering
// over. Availability is never computed by scanning reservations.
export const inventoryCalendar = sqliteTable("inventory_calendar", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  roomTypeId: text("room_type_id").notNull().references(() => roomTypes.id),
  stayDate: integer("stay_date", { mode: "timestamp" }).notNull(),
  totalRooms: integer("total_rooms").notNull().default(0),
  sold: integer("sold").notNull().default(0),
  blocked: integer("blocked").notNull().default(0),
  outOfOrder: integer("out_of_order").notNull().default(0),
  /** Controlled oversell allowance. Selling past total_rooms needs this. */
  overbookingLimit: integer("overbooking_limit").notNull().default(0),
}, (t) => ({
  typeDate: uniqueIndex("inventory_calendar_room_type_id_stay_date_unique").on(t.roomTypeId, t.stayDate),
}));

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  number: text("number").notNull(),
  type: text("type").notNull(),
  /** Backend Blueprint B8. Backfilled from `type` by migration 0008. */
  roomTypeId: text("room_type_id").references(() => roomTypes.id),
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
  // Backend Blueprint B8. Booking a TYPE is the normal case -- the guest
  // wants a Deluxe, and which Deluxe is decided at check-in. roomId stays
  // nullable until that assignment.
  roomTypeId: text("room_type_id").references(() => roomTypes.id),
  ratePlanId: text("rate_plan_id"),
  checkInDate: integer("check_in_date", { mode: "timestamp" }).notNull(),
  checkOutDate: integer("check_out_date", { mode: "timestamp" }).notNull(),
  status: text("status").notNull().default("confirmed"), // confirmed|pending|checked_in|checked_out|cancelled|no_show
  rateKobo: integer("rate_kobo").notNull(),
  adults: integer("adults").notNull().default(1),
  children: integer("children").notNull().default(0),
  specialRequests: text("special_requests"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // FI-01 folio status: a reservation is "disputed" when Finance flags its
  // folio for review -- independent of checked_in/checked_out, which
  // already covers "open" (in-house) vs "closed" (settled at checkout).
  disputed: integer("disputed", { mode: "boolean" }).notNull().default(false),
  // Backend Blueprint B9 — the cancellation record. `penaltyWaived` is its
  // own flag rather than "penaltyChargeId IS NULL": a waived penalty and a
  // zero penalty are different events, and only one needs a name attached.
  cancellationPolicyId: text("cancellation_policy_id"),
  cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  cancelledBy: text("cancelled_by").references(() => users.id),
  cancellationReason: text("cancellation_reason"),
  penaltyChargeId: text("penalty_charge_id"),
  penaltyWaived: integer("penalty_waived", { mode: "boolean" }).notNull().default(false),
  penaltyWaivedBy: text("penalty_waived_by").references(() => users.id),
  penaltyWaiverReason: text("penalty_waiver_reason"),
});

// Backend Blueprint B3. One row per room per night. The UNIQUE
// (room_id, stay_date) index is the real double-booking guard -- the
// overlap check in routes/reservations.ts only exists to produce a friendlier
// error a moment earlier. stayDate is midnight UTC of the night occupied;
// check-out day is not a night, so same-day turnovers are legal.
export const roomNightInventory = sqliteTable("room_night_inventory", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  roomId: text("room_id").notNull().references(() => rooms.id),
  stayDate: integer("stay_date", { mode: "timestamp" }).notNull(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  roomNight: uniqueIndex("room_night_inventory_room_id_stay_date_unique").on(t.roomId, t.stayDate),
}));

export const folioCharges = sqliteTable("folio_charges", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  postedBy: text("posted_by").notNull().references(() => users.id),
  postedAt: integer("posted_at", { mode: "timestamp" }).notNull(),
  // Backend Blueprint B4 / invariant 4 -- append-only ledger. A posted line
  // is never updated or deleted; a correction is a new negative row with
  // is_reversal = 1 and reversal_of_id pointing at the original. SQLite
  // triggers (migration 0004) enforce this even against a direct SQL edit.
  reversalOfId: text("reversal_of_id"),
  isReversal: integer("is_reversal", { mode: "boolean" }).notNull().default(false),
  // Running total of how much of this line has been reversed. voidedAt is
  // set only once it is reversed in FULL -- a partial void leaves the line
  // live so the remainder still stands, and so further partial voids are
  // still possible (the trigger locks a row the moment voidedAt is set).
  reversedAmountKobo: integer("reversed_amount_kobo").notNull().default(0),
  voidedAt: integer("voided_at", { mode: "timestamp" }),
  voidedBy: text("voided_by").references(() => users.id),
  voidReasonCode: text("void_reason_code"),
  voidReasonNote: text("void_reason_note"),
  // Invariant 9. B5 replaces this with the branch's real rolling business
  // date; until then it is the UTC calendar date of posting.
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  // Backend Blueprint B6 -- line parentage. A taxed charge is a `base` row
  // plus one `tax`/`service_charge` child per applicable code, each pointing
  // back at the parent. Tax is never folded into the base amount: the guest
  // needs the breakdown on the folio and the auditor needs it per
  // jurisdiction, and neither is recoverable from a single blended number.
  parentChargeId: text("parent_charge_id"),
  chargeKind: text("charge_kind").notNull().default("base"), // base|tax|service_charge
  taxCodeId: text("tax_code_id"),
});

// Backend Blueprint B6. Effective-dating is the point of the table: when VAT
// moves from 7.5% to 10%, that is a NEW row, not an edit. Editing in place
// would make reprinting last month's invoice produce a different number than
// the guest actually paid.
export const taxCodes = sqliteTable("tax_codes", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  jurisdiction: text("jurisdiction").notNull(),   // federal|state|local
  taxType: text("tax_type").notNull(),            // vat|consumption|service_charge|other
  rateBp: integer("rate_bp").notNull(),
  isInclusive: integer("is_inclusive", { mode: "boolean" }).notNull().default(false),
  /** JSON array of tax_code ids whose amounts join this one's base. */
  compoundsOnJson: text("compounds_on_json").notNull().default("[]"),
  /** JSON array of charge categories; empty means every category. */
  appliesToJson: text("applies_to_json").notNull().default("[]"),
  computationOrder: integer("computation_order").notNull().default(100),
  effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull(),
  effectiveTo: integer("effective_to", { mode: "timestamp" }),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// An exemption names the ONE code it suppresses. A blanket "this guest pays
// no tax" is almost always wrong -- a diplomatic exemption covers VAT but
// not a service charge, and a long-stay exemption covers consumption tax but
// not VAT.
export const taxExemptions = sqliteTable("tax_exemptions", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  taxCodeId: text("tax_code_id").notNull().references(() => taxCodes.id),
  exemptionType: text("exemption_type").notNull(), // guest_type|corporate_account|long_stay|diplomatic
  criteriaJson: text("criteria_json").notNull().default("{}"),
  requiresEvidence: integer("requires_evidence", { mode: "boolean" }).notNull().default(true),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Backend Blueprint B7 — gapless per-branch document numbering.
//
// next_number is bumped in the SAME transaction as the document that
// consumes it, which is the entire mechanism: if the document does not
// commit, the number is not spent. See services/documents/sequence.ts.
export const documentSequences = sqliteTable("document_sequences", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  documentType: text("document_type").notNull(), // invoice|receipt|credit_note|complaint|trip|proforma
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padWidth: integer("pad_width").notNull().default(5),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (t) => ({
  branchType: uniqueIndex("document_sequences_branch_id_document_type_unique").on(t.branchId, t.documentType),
}));

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  invoiceNumber: text("invoice_number").notNull(),
  /** The raw integer behind the formatted number, so gaps are checkable. */
  sequenceNumber: integer("sequence_number").notNull(),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  invoiceType: text("invoice_type").notNull(), // guest|corporate|group|proforma
  reservationId: text("reservation_id").references(() => reservations.id),
  guestId: text("guest_id").references(() => guests.id),
  /** No FK: groups are B12 and corporate accounts B13. */
  groupId: text("group_id"),
  corporateAccountId: text("corporate_account_id"),
  billToName: text("bill_to_name").notNull(),
  billToAddress: text("bill_to_address"),
  billToTin: text("bill_to_tin"),
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  issuedBy: text("issued_by").references(() => users.id),
  dueAt: integer("due_at", { mode: "timestamp" }),
  subtotalKobo: integer("subtotal_kobo").notNull().default(0),
  taxTotalKobo: integer("tax_total_kobo").notNull().default(0),
  totalKobo: integer("total_kobo").notNull().default(0),
  paidKobo: integer("paid_kobo").notNull().default(0),
  balanceKobo: integer("balance_kobo").notNull().default(0),
  status: text("status").notNull().default("issued"),
  voidedAt: integer("voided_at", { mode: "timestamp" }),
  voidedBy: text("voided_by").references(() => users.id),
  voidReason: text("void_reason"),
  /** The FIRS e-invoicing seam. Null means "never submitted" -- honest. */
  firsEinvoiceStatus: text("firs_einvoice_status"),
  firsSubmissionRef: text("firs_submission_ref"),
  pdfRef: text("pdf_ref"),
}, (t) => ({
  branchNumber: uniqueIndex("invoices_branch_id_invoice_number_unique").on(t.branchId, t.invoiceNumber),
}));

// A SNAPSHOT of the folio charge at issuance, never a live view. A reversal
// posted next week must not change an invoice the guest already holds -- that
// is what a credit note is for.
export const invoiceLines = sqliteTable("invoice_lines", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  folioChargeId: text("folio_charge_id").references(() => folioCharges.id),
  description: text("description").notNull(),
  chargeKind: text("charge_kind").notNull().default("base"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  taxCodeId: text("tax_code_id").references(() => taxCodes.id),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  receiptNumber: text("receipt_number").notNull(),
  sequenceNumber: integer("sequence_number").notNull(),
  paymentId: text("payment_id").notNull().references(() => payments.id),
  invoiceId: text("invoice_id").references(() => invoices.id),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  issuedBy: text("issued_by").references(() => users.id),
  amountKobo: integer("amount_kobo").notNull(),
  method: text("method").notNull(),
  reference: text("reference"),
}, (t) => ({
  branchNumber: uniqueIndex("receipts_branch_id_receipt_number_unique").on(t.branchId, t.receiptNumber),
  onePerPayment: uniqueIndex("receipts_payment_id_unique").on(t.paymentId),
}));

export const creditNotes = sqliteTable("credit_notes", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  creditNoteNumber: text("credit_note_number").notNull(),
  sequenceNumber: integer("sequence_number").notNull(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  reason: text("reason").notNull(),
  amountKobo: integer("amount_kobo").notNull(),
  issuedAt: integer("issued_at", { mode: "timestamp" }).notNull(),
  issuedBy: text("issued_by").references(() => users.id),
  approvedBy: text("approved_by").references(() => users.id),
}, (t) => ({
  branchNumber: uniqueIndex("credit_notes_branch_id_credit_note_number_unique").on(t.branchId, t.creditNoteNumber),
}));

// Backend Blueprint B9. The penalty is a TYPE plus a value, never a computed
// amount frozen at booking: "first night" and "30% of the stay" both have to
// survive a rate change between booking and cancellation.
export const cancellationPolicies = sqliteTable("cancellation_policies", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  /** Hours before arrival within which cancelling is free. */
  freeCancellationHours: integer("free_cancellation_hours").notNull().default(24),
  penaltyType: text("penalty_type").notNull().default("first_night"),
  penaltyValueBp: integer("penalty_value_bp"),
  penaltyFixedKobo: integer("penalty_fixed_kobo"),
  noShowPenaltyType: text("no_show_penalty_type").notNull().default("first_night"),
  noShowPenaltyValueBp: integer("no_show_penalty_value_bp"),
  noShowPenaltyFixedKobo: integer("no_show_penalty_fixed_kobo"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (t) => ({
  branchCode: uniqueIndex("cancellation_policies_branch_id_code_unique").on(t.branchId, t.code),
}));

// A refund is a REQUEST that becomes a record, not a button that moves money.
// Refunding is the easiest way to steal from a hotel -- it turns a guest's
// payment into cash out of the drawer -- so request and approval are separate
// acts, and the deductions are itemised rather than netted.
export const refunds = sqliteTable("refunds", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  refundNumber: text("refund_number").notNull(),
  sequenceNumber: integer("sequence_number").notNull(),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  paymentId: text("payment_id").references(() => payments.id),
  reservationId: text("reservation_id").references(() => reservations.id),
  guestId: text("guest_id").references(() => guests.id),
  requestedAmountKobo: integer("requested_amount_kobo").notNull(),
  approvedAmountKobo: integer("approved_amount_kobo"),
  deductionsJson: text("deductions_json").notNull().default("[]"),
  reason: text("reason").notNull(),
  method: text("method").notNull(),
  gatewayReference: text("gateway_reference"),
  status: text("status").notNull().default("requested"),
  requestedBy: text("requested_by").references(() => users.id),
  requestedAt: integer("requested_at", { mode: "timestamp" }).notNull(),
  approvedBy: text("approved_by").references(() => users.id),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  rejectionReason: text("rejection_reason"),
  /** The ledger reversal. Null until money has actually left. */
  paymentReversalId: text("payment_reversal_id"),
}, (t) => ({
  branchNumber: uniqueIndex("refunds_branch_id_refund_number_unique").on(t.branchId, t.refundNumber),
}));

// A DEPOSIT IS A LIABILITY, NOT REVENUE. Until the guest stays, the hotel is
// holding someone else's money: it must not read as income, and it must be
// refundable in full without unwinding a sale that never happened.
//
// The three outcomes are tracked separately because they are three different
// journal entries: APPLIED converts the liability to settlement, REFUNDED
// discharges it, FORFEITED converts it to revenue.
export const deposits = sqliteTable("deposits", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  reservationId: text("reservation_id").references(() => reservations.id),
  guestId: text("guest_id").references(() => guests.id),
  depositType: text("deposit_type").notNull().default("reservation"),
  amountKobo: integer("amount_kobo").notNull(),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  heldAt: integer("held_at", { mode: "timestamp" }).notNull(),
  heldBy: text("held_by").references(() => users.id),
  paymentId: text("payment_id").references(() => payments.id),
  method: text("method").notNull().default("cash"),
  status: text("status").notNull().default("held"),
  appliedAmountKobo: integer("applied_amount_kobo").notNull().default(0),
  refundedAmountKobo: integer("refunded_amount_kobo").notNull().default(0),
  forfeitedAmountKobo: integer("forfeited_amount_kobo").notNull().default(0),
  releasedAt: integer("released_at", { mode: "timestamp" }),
  releasedBy: text("released_by").references(() => users.id),
  releaseNotes: text("release_notes"),
});

// Backend Blueprint B18. One row per update attempt, written BEFORE the swap:
// an update that bricks the container must still leave a record of what was
// tried and how far it got.
// Backend Blueprint B19.5. A local ring buffer, also pushed to central.
// Kept locally as well because the moment central most wants this data is
// when the uplink is down -- a metric that only exists once transmitted is
// missing exactly when it matters.
export const healthHeartbeats = sqliteTable("health_heartbeats", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").references(() => branches.id),
  recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull(),
  diskFreeBytes: integer("disk_free_bytes"),
  diskTotalBytes: integer("disk_total_bytes"),
  dbSizeBytes: integer("db_size_bytes"),
  walSizeBytes: integer("wal_size_bytes"),
  memoryUsedBytes: integer("memory_used_bytes"),
  cpuPercent: real("cpu_percent"),
  uptimeSeconds: integer("uptime_seconds"),
  errorCount1h: integer("error_count_1h").notNull().default(0),
  pendingSyncCount: integer("pending_sync_count").notNull().default(0),
  pendingLockQueueCount: integer("pending_lock_queue_count").notNull().default(0),
  schemaVersion: integer("schema_version"),
  appDigest: text("app_digest"),
  /** Drift matters: business date, token expiry and the ledger all depend
   *  on this machine agreeing with reality about the time. */
  clockOffsetSeconds: real("clock_offset_seconds"),
  pushedAt: integer("pushed_at", { mode: "timestamp" }),
});

// ─── Backend Blueprint B23 — payments gateway ────────────────────────────
export const paymentGateways = sqliteTable("payment_gateways", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  provider: text("provider").notNull(),   // paystack|flutterwave|moniepoint|manual|fake
  displayName: text("display_name").notNull(),
  /** Encrypted JSON via lib/secrets.ts — API keys move real money. */
  configEncrypted: text("config_encrypted"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  supportsTerminal: integer("supports_terminal", { mode: "boolean" }).notNull().default(false),
  supportsOnline: integer("supports_online", { mode: "boolean" }).notNull().default(true),
  supportsRefund: integer("supports_refund", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
}, (t) => ({
  branchProvider: uniqueIndex("payment_gateways_branch_id_provider_unique").on(t.branchId, t.provider),
}));

// The gateway-side record, deliberately SEPARATE from `payments` (the folio
// ledger row): a transaction can be initiated, fail and be retried without
// ever producing a ledger row, and a cash payment has no transaction at all.
export const paymentTransactions = sqliteTable("payment_transactions", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  paymentId: text("payment_id"),
  reservationId: text("reservation_id").references(() => reservations.id),
  gatewayId: text("gateway_id").references(() => paymentGateways.id),
  gatewayReference: text("gateway_reference"),
  /** THE anti-double-charge guarantee. UNIQUE per branch. */
  idempotencyKey: text("idempotency_key").notNull(),
  /** The clerk who took it. A webhook has no actor, so its folio row is
   *  attributed here rather than to an invented system user. */
  initiatedBy: text("initiated_by").references(() => users.id),
  amountKobo: integer("amount_kobo").notNull(),
  currency: text("currency").notNull().default("NGN"),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("initiated"),
  initiatedAt: integer("initiated_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  failureReason: text("failure_reason"),
  terminalId: text("terminal_id"),
  rrn: text("rrn"),
  authCode: text("auth_code"),
  /** Only ever the masked form. A full PAN would put this property in PCI
   *  scope it has no way to satisfy. */
  maskedPan: text("masked_pan"),
  cardType: text("card_type"),
  rawResponseJson: text("raw_response_json"),
  settlementStatus: text("settlement_status").notNull().default("unsettled"),
  settledAt: integer("settled_at", { mode: "timestamp" }),
  settlementReference: text("settlement_reference"),
  feeKobo: integer("fee_kobo").notNull().default(0),
  takenOffline: integer("taken_offline", { mode: "boolean" }).notNull().default(false),
}, (t) => ({
  branchKey: uniqueIndex("payment_transactions_branch_id_idempotency_key_unique").on(t.branchId, t.idempotencyKey),
}));

// What the bank says it paid, against what the property recorded. The
// variance is the only signal a property gets that a transaction was charged
// back, held, or silently dropped.
export const settlementBatches = sqliteTable("settlement_batches", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  gatewayId: text("gateway_id").references(() => paymentGateways.id),
  batchReference: text("batch_reference").notNull(),
  settlementDate: integer("settlement_date", { mode: "timestamp" }).notNull(),
  grossKobo: integer("gross_kobo").notNull().default(0),
  feeKobo: integer("fee_kobo").notNull().default(0),
  netKobo: integer("net_kobo").notNull().default(0),
  transactionCount: integer("transaction_count").notNull().default(0),
  reconciledAt: integer("reconciled_at", { mode: "timestamp" }),
  reconciledBy: text("reconciled_by").references(() => users.id),
  varianceKobo: integer("variance_kobo").notNull().default(0),
  varianceNotes: text("variance_notes"),
}, (t) => ({
  branchRef: uniqueIndex("settlement_batches_branch_id_batch_reference_unique").on(t.branchId, t.batchReference),
}));

// A gateway retries a webhook until it gets a 200 and will happily deliver
// the same event a dozen times. This row is what makes the second delivery a
// no-op instead of a second folio payment.
export const paymentWebhookEvents = sqliteTable("payment_webhook_events", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").references(() => branches.id),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type"),
  gatewayReference: text("gateway_reference"),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
  processedAt: integer("processed_at", { mode: "timestamp" }),
  outcome: text("outcome"),
  detail: text("detail"),
}, (t) => ({
  providerEvent: uniqueIndex("payment_webhook_events_provider_event_id_unique").on(t.provider, t.eventId),
}));

export const updateAttempts = sqliteTable("update_attempts", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").references(() => branches.id),
  requestedRef: text("requested_ref").notNull(),
  resolvedDigest: text("resolved_digest"),
  previousDigest: text("previous_digest"),
  ring: text("ring"),
  schemaVersion: integer("schema_version"),
  releaseSchemaVersion: integer("release_schema_version"),
  /** refused|swapping|health_check|succeeded|rolled_back|failed */
  status: text("status").notNull(),
  refusalReason: text("refusal_reason"),
  signatureStatus: text("signature_status").notNull().default("unverified"),
  signatureKeyId: text("signature_key_id"),
  healthResult: text("health_result"),
  healthDetail: text("health_detail"),
  rolledBackTo: text("rolled_back_to"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  error: text("error"),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  amountKobo: integer("amount_kobo").notNull(),
  method: text("method").notNull(), // cash|card|transfer
  receivedBy: text("received_by").notNull().references(() => users.id),
  receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
  // Backend Blueprint B4 / invariant 4 -- append-only ledger. A posted line
  // is never updated or deleted; a correction is a new negative row with
  // is_reversal = 1 and reversal_of_id pointing at the original. SQLite
  // triggers (migration 0004) enforce this even against a direct SQL edit.
  reversalOfId: text("reversal_of_id"),
  isReversal: integer("is_reversal", { mode: "boolean" }).notNull().default(false),
  // Running total of how much of this line has been reversed. voidedAt is
  // set only once it is reversed in FULL -- a partial void leaves the line
  // live so the remainder still stands, and so further partial voids are
  // still possible (the trigger locks a row the moment voidedAt is set).
  reversedAmountKobo: integer("reversed_amount_kobo").notNull().default(0),
  voidedAt: integer("voided_at", { mode: "timestamp" }),
  voidedBy: text("voided_by").references(() => users.id),
  voidReasonCode: text("void_reason_code"),
  voidReasonNote: text("void_reason_note"),
  // Invariant 9. B5 replaces this with the branch's real rolling business
  // date; until then it is the UTC calendar date of posting.
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
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
  priceKobo: integer("price_kobo").notNull(),
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
  paidAmountKobo: integer("paid_amount_kobo"),
});

export const restaurantOrderItems = sqliteTable("restaurant_order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => restaurantOrders.id),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(), // denormalized at order time
  quantity: integer("quantity").notNull().default(1),
  unitPriceKobo: integer("unit_price_kobo").notNull(),
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
  unitCostKobo: integer("unit_cost_kobo").notNull(),
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
  unitCostKobo: integer("unit_cost_kobo").notNull(),
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

// CO-02 Guest Messaging. Real, but scoped honestly: there's no actual
// WhatsApp/SMS gateway account in this codebase (same class of gap as
// TTLock/Docker -- needs real third-party credentials this environment
// doesn't have), and no guest-facing portal exists anywhere in this system
// for an "internal portal" message to actually be delivered to. So this is
// a real staff-facing guest-communication LOG and coordination tool, not an
// outbound message-sending gateway: staff record what was actually said to
// (or heard from) a guest -- over a phone call, their own WhatsApp, in
// person, whatever really happened -- so the whole team has one shared,
// threaded, real record instead of no record at all. `channel` is metadata
// about how that real-world conversation happened, not a delivery promise.
// One thread per guest (not per-reservation) -- a repeat guest's history
// carries across stays, matching real front-desk value ("this guest has
// asked about late checkout before").
export const guestMessageThreads = sqliteTable("guest_message_threads", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  guestId: text("guest_id").notNull().references(() => guests.id),
  status: text("status").notNull().default("open"), // open|forwarded|escalated|resolved
  forwardedToDepartment: text("forwarded_to_department"),
  escalatedAt: integer("escalated_at", { mode: "timestamp" }),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolvedBy: text("resolved_by").references(() => users.id),
  lastMessageAt: integer("last_message_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const guestMessages = sqliteTable("guest_messages", {
  id: text("id").primaryKey(),
  threadId: text("thread_id").notNull().references(() => guestMessageThreads.id),
  channel: text("channel").notNull(), // whatsapp|sms|internal -- real-world channel, see table comment above
  direction: text("direction").notNull(), // to_guest|from_guest
  body: text("body").notNull(),
  loggedBy: text("logged_by").notNull().references(() => users.id),
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
  // B19: nullable, because a SCHEDULED backup has no operator behind it.
  createdBy: text("created_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  restoredAt: integer("restored_at", { mode: "timestamp" }),
  // Backend Blueprint B19.1-19.4. These turn a hopeful file into a snapshot
  // that is known to be restorable.
  encryptionAlgorithm: text("encryption_algorithm"),
  /** Over the PLAINTEXT snapshot, so it verifies the database not the envelope. */
  checksumSha256: text("checksum_sha256"),
  offsiteStatus: text("offsite_status").notNull().default("not_configured"),
  offsiteSyncedAt: integer("offsite_synced_at", { mode: "timestamp" }),
  retentionExpiresAt: integer("retention_expires_at", { mode: "timestamp" }),
  backupKind: text("backup_kind").notNull().default("manual"), // scheduled|manual|pre_migration
  restoreTestAt: integer("restore_test_at", { mode: "timestamp" }),
  restoreTestResult: text("restore_test_result"),   // passed|failed
  restoreTestDetail: text("restore_test_detail"),
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
  // Backend Blueprint B18. `updateRing` defaults to the SAFEST ring, not the
  // most convenient: a branch whose ring failed to sync should receive fewer
  // updates, not more.
  updateRing: text("update_ring").notNull().default("general"),
  currentImageDigest: text("current_image_digest"),
  previousImageDigest: text("previous_image_digest"),
  lastSignatureStatus: text("last_signature_status"),
  lastHealthCheckAt: integer("last_health_check_at", { mode: "timestamp" }),
  lastHealthResult: text("last_health_result"),
  registryUsername: text("registry_username"),
  /** Encrypted via lib/secrets.ts, never plaintext (B18.7). */
  registryPasswordEncrypted: text("registry_password_encrypted"),
  // Backend Blueprint B19.7. WAL plus a month of snapshots on the small SSD
  // of a back-office PC is a realistic way to run out of disk, and SQLite's
  // response to a full disk is to fail the transaction -- which a clerk sees
  // as a check-in that will not save.
  diskWarnBytes: integer("disk_warn_bytes").notNull().default(2 * 1024 ** 3),
  diskBlockBytes: integer("disk_block_bytes").notNull().default(512 * 1024 ** 2),
  backupRetentionDays: integer("backup_retention_days").notNull().default(30),
  offsiteTarget: text("offsite_target"),
  lastRestoreTestAt: integer("last_restore_test_at", { mode: "timestamp" }),
  lastRestoreTestResult: text("last_restore_test_result"),
});

// Cached result of the last successful pull -- every branch in this
// organization as centrally known, so Multi-Branch screens work from a
// local snapshot even while offline (Auth doc 4.1), not a live call to
// the central server on every page load.
export const branchSyncCache = sqliteTable("branch_sync_cache", {
  branchId: text("branch_id").primaryKey(),
  branchName: text("branch_name").notNull(),
  occupancyRate: real("occupancy_rate"),
  revenueTodayKobo: integer("revenue_today_kobo"),
  activeGuests: integer("active_guests"),
  openIssues: integer("open_issues"),
  roomsTotal: integer("rooms_total"),
  adrKobo: integer("adr_kobo"),
  revparKobo: integer("revpar_kobo"),
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

// ─── Night audit (Backend Blueprint B5) ─────────────────────────────────

// One row per audit attempt. steps_json is what makes a run resumable:
// each step records its own completion, so a re-run after a failure skips
// what already succeeded rather than double-posting.
export const nightAuditRuns = sqliteTable("night_audit_runs", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  status: text("status").notNull(), // running|completed|failed|rolled_back
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  operatorUserId: text("operator_user_id").references(() => users.id), // null = scheduler
  stepsJson: text("steps_json").notNull().default("[]"),
  totalsJson: text("totals_json"),
  exceptionsJson: text("exceptions_json").notNull().default("[]"),
  error: text("error"),
});

// The frozen day. Every report reads from here rather than recomputing over
// live rows -- that is what makes last month's report reproducible.
// Immutable: reopening a day supersedes the row rather than editing it.
export const dailyRevenue = sqliteTable("daily_revenue", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  roomsOccupied: integer("rooms_occupied").notNull().default(0),
  roomsAvailable: integer("rooms_available").notNull().default(0),
  roomsOoo: integer("rooms_ooo").notNull().default(0),
  roomRevenueKobo: integer("room_revenue_kobo").notNull().default(0),
  fnbRevenueKobo: integer("fnb_revenue_kobo").notNull().default(0),
  otherRevenueKobo: integer("other_revenue_kobo").notNull().default(0),
  totalRevenueKobo: integer("total_revenue_kobo").notNull().default(0),
  taxCollectedKobo: integer("tax_collected_kobo").notNull().default(0),
  adrKobo: integer("adr_kobo").notNull().default(0),
  revparKobo: integer("revpar_kobo").notNull().default(0),
  occupancyBp: integer("occupancy_bp").notNull().default(0), // 75.5% = 7550
  arrivals: integer("arrivals").notNull().default(0),
  departures: integer("departures").notNull().default(0),
  noShows: integer("no_shows").notNull().default(0),
  walkIns: integer("walk_ins").notNull().default(0),
  discountsKobo: integer("discounts_kobo").notNull().default(0),
  compsKobo: integer("comps_kobo").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  nightAuditRunId: text("night_audit_run_id").references(() => nightAuditRuns.id),
  supersededByRunId: text("superseded_by_run_id").references(() => nightAuditRuns.id),
});

// penaltyChargeId is nullable: the amount comes from the cancellation
// policy engine (B9). Until then a no-show is recorded -- which is what
// matters for occupancy and guest history -- without inventing a penalty.
export const noShowPostings = sqliteTable("no_show_postings", {
  id: text("id").primaryKey(),
  reservationId: text("reservation_id").notNull().references(() => reservations.id),
  businessDate: integer("business_date", { mode: "timestamp" }).notNull(),
  penaltyChargeId: text("penalty_charge_id").references(() => folioCharges.id),
  postedAt: integer("posted_at", { mode: "timestamp" }).notNull(),
  postedBy: text("posted_by").references(() => users.id),
});
