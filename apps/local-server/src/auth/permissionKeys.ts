// HR-03 Roles & Permissions (Blueprint 2.5 / HR-03) canonical permission
// vocabulary. Every key here corresponds 1:1 to what a real route actually
// gates via requirePermission() (see auth/middleware.ts and every
// routes/*.ts file) -- there's no key here that isn't checked somewhere,
// and no gate anywhere that isn't expressed as a key here.
//
// SYSTEM_ROLE_SEED reproduces, exactly, the access every one of the 12
// built-in roles (Blueprint 2.4) already had under the old hardcoded
// requireRole(...) role-string lists -- derived by reading every route
// file's existing gate and preserving its precise grantee set as a named
// permission. Bootstrapped into the `roles` table on first boot (see
// db/client.ts) and from then on fully editable from HR-03, same as any
// custom role -- editing a built-in role's permissions here is exactly
// what Blueprint 2.5/HR-03 means by "Edit permissions" being available for
// any role, not just custom ones.
export interface PermissionKeyDef { key: string; label: string; module: string }

export const PERMISSION_KEYS: PermissionKeyDef[] = [
  { key: "reservations:create", label: "Create / edit reservations", module: "Reservations" },
  { key: "reservations:checkinout", label: "Check guests in / out", module: "Reservations" },
  { key: "guests:create", label: "Create / edit guest profiles", module: "Reservations" },
  { key: "reports:occupancy", label: "Occupancy report", module: "Reservations" },
  { key: "reports:guests", label: "Guest analytics report", module: "Reservations" },

  { key: "folio:read", label: "View guest folios", module: "Billing" },
  { key: "folio:write", label: "Dispute / adjust folio charges", module: "Billing" },
  { key: "folio:postcharge", label: "Post charges to a folio", module: "Billing" },
  { key: "finance:read", label: "Daily financial summary", module: "Billing" },
  // Backend Blueprint B4. Deliberately NOT in the Front Desk set: voiding a
  // posted charge is the single most abusable action in the app, so it sits
  // with Finance/Management/Resident Officer. The blueprint writes these as
  // `folio.void` / `finance.reports`; this codebase has used `module:action`
  // since HR-03, so they keep that shape.
  { key: "folio:void", label: "Void a posted charge or payment", module: "Billing" },
  { key: "finance:reports", label: "Financial oversight reports (reversals, variance)", module: "Billing" },
  // B5. Reopening a closed trading day rewrites what a finished day reported,
  // so it sits above the day-to-day finance permissions -- FIN and the
  // wildcard roles only.
  { key: "finance:reopen_day", label: "Reopen a closed business day", module: "Billing" },
  { key: "reports:revenue", label: "Revenue report", module: "Billing" },
  { key: "reports:staff", label: "Staff performance report", module: "Billing" },

  { key: "housekeeping:manage", label: "Update room status / assign HK tasks", module: "Housekeeping" },
  { key: "housekeeping:inspect", label: "Record room inspections", module: "Housekeeping" },
  { key: "reports:inventory", label: "Inventory usage report", module: "Housekeeping" },

  { key: "maintenance:manage", label: "Update / assign work orders", module: "Maintenance" },

  { key: "restaurant:manage", label: "Manage menu, tables, and orders oversight", module: "Restaurant" },
  { key: "restaurant:operate", label: "Take and serve orders (floor operation)", module: "Restaurant" },

  { key: "frontoffice:lostfound", label: "Log / claim / dispose lost & found items", module: "Front Office" },
  { key: "handover:use", label: "Shift handover notes", module: "Front Office" },
  { key: "announcements:manage", label: "Post / archive staff announcements", module: "Front Office" },
  // CO-02. Blueprint 1031: "Roles: FD, RO, CS, MGT, ORG".
  { key: "guests:message", label: "Log / forward / escalate guest communications", module: "Front Office" },

  { key: "inventory:read", label: "View stock levels", module: "Inventory" },
  { key: "inventory:write", label: "Adjust stock / receive deliveries", module: "Inventory" },
  { key: "purchasing:suppliers", label: "Manage suppliers", module: "Inventory" },
  { key: "purchasing:orders", label: "Create / send / receive purchase orders", module: "Inventory" },

  { key: "hr:manage", label: "Manage staff, shifts, and scheduling", module: "HR & Staff" },
  { key: "hr:payroll", label: "Attendance, leave approval, and payroll", module: "HR & Staff" },

  { key: "doorlock:use", label: "Issue / revoke door lock credentials", module: "Door Lock" },
  { key: "doorlock:configure", label: "Configure door lock provider & room mapping", module: "Door Lock" },

  { key: "settings:branch", label: "Edit branch / property settings", module: "IT & Settings" },
  // B6. Separate from settings:branch on purpose: a tax rate is a financial
  // control, not an IT one. Getting it wrong misbills every guest and is a
  // FIRS compliance problem, so it belongs with Finance -- IT keeps it too
  // because IT is who configures a new property before Finance exists.
  { key: "settings:tax", label: "Configure tax codes & exemptions", module: "Finance" },

  // B7. Issuing is a front-desk action (the guest is at the desk at
  // check-out); unwinding an issued document is not. Voiding and crediting
  // are separate keys because they are different powers: a void says the
  // document should never have existed, a credit note says it did and is
  // being reduced.
  { key: "invoices:issue", label: "Issue invoices, proformas and receipts", module: "Finance" },
  { key: "invoices:void", label: "Void an issued invoice", module: "Finance" },
  { key: "invoices:credit_note", label: "Raise credit notes against invoices", module: "Finance" },
  { key: "settings:documents", label: "Configure document numbering", module: "Finance" },

  // B9. Cancelling and WAIVING the penalty that comes with it are separate
  // grants on purpose: without the split, every cancellation becomes free the
  // moment a guest complains loudly enough at the desk.
  { key: "reservations:cancel", label: "Cancel a reservation", module: "Front Office" },
  { key: "reservations:waive_penalty", label: "Waive a cancellation penalty", module: "Finance" },
  // Requesting and approving a refund are deliberately different people: a
  // refund converts a recorded payment into cash out of the drawer.
  { key: "finance:refund_request", label: "Request a refund", module: "Finance" },
  { key: "finance:refund_approve", label: "Approve or reject a refund", module: "Finance" },
  { key: "finance:refund_approve_high", label: "Approve a high-value refund (over the threshold)", module: "Finance" },
  { key: "deposits:manage", label: "Hold, apply, refund and forfeit deposits", module: "Finance" },
  { key: "settings:cancellation", label: "Configure cancellation policies", module: "Finance" },

  // B23. Taking a payment is counter work; reconciling a bank payout against
  // what the property recorded is not -- that is the control that catches a
  // chargeback or a dropped transaction.
  { key: "payments:take", label: "Take a payment", module: "Finance" },
  { key: "payments:reconcile", label: "Reconcile settlements against recorded transactions", module: "Finance" },
  { key: "settings:gateways", label: "Configure payment gateways", module: "Finance" },

  // B8. Reading a rate and setting one are different jobs: the front desk
  // quotes from the rate card all day, and revenue management owns what is
  // on it.
  { key: "rates:read", label: "View room types, rate plans and rates", module: "Revenue" },
  { key: "rates:manage", label: "Set rates, rate plans and room types", module: "Revenue" },
  { key: "inventory:calendar", label: "View the availability calendar", module: "Revenue" },
  { key: "admin:manage", label: "Manage staff accounts & system health", module: "IT & Settings" },
  { key: "admin:devices", label: "Manage authorized devices", module: "IT & Settings" },
  { key: "admin:operations", label: "Backups, sync, and platform audit log", module: "IT & Settings" },
  // HR-03 itself. Blueprint 1121: "Roles: IT, MGT, ORG" -- MGT/ORG already
  // have "*"; IT needs this named explicitly since none of its other grants
  // (doorlock/settings/admin ops) imply role management.
  { key: "roles:manage", label: "Create and edit roles & permissions", module: "HR & Staff" },
];

export const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS.map(p => p.key));

export interface SystemRoleSeed { name: string; permissions: string[] | "*" }

// ────────────────────────────────────────────────────────────────────────
// READ THIS BEFORE ADDING A PERMISSION TO A ROLE BELOW.
//
// This seed is applied ONLY when the roles table is empty -- a fresh
// install. After that the table is the live, operator-editable source of
// truth and boot never overwrites it (db/client.ts), because a manager who
// edits a built-in role must not have it reverted on restart.
//
// So editing this list alone changes nothing on an existing database. A new
// key ALSO needs an additive UPDATE in that batch's migration; migration
// 0006 has the pattern and the reasoning.
//
// This is not hypothetical. B4's `folio:void` and B5's `finance:reports` /
// `finance:reopen_day` were added here and nowhere else, so on every
// upgraded property they were unreachable by the roles meant to have them --
// found during B6's live verification, months after both batches were called
// complete. Migration 0006 repairs them.
// ────────────────────────────────────────────────────────────────────────

// Preserves the exact grantee set of every requireRole(...) call as it
// existed before this system was built. Cross-checked key by key against
// every routes/*.ts file's requireRole(...) argument list.
export const SYSTEM_ROLE_SEED: Record<string, SystemRoleSeed> = {
  PLT: { name: "Platform Owner", permissions: "*" },
  ORG: { name: "Organization Super Admin", permissions: "*" },
  MGT: { name: "Branch Manager", permissions: "*" },
  FD: {
    name: "Front Desk", permissions: [
      "reservations:create", "reservations:checkinout", "guests:create",
      "folio:read", "folio:postcharge", "doorlock:use", "handover:use",
      "guests:message",
      // B7: the guest is standing at the desk at check-out and needs an
      // invoice and a receipt. Voiding one is a Finance control.
      "invoices:issue",
      // B9: cancelling is desk work; waiving the penalty is not.
      "reservations:cancel", "finance:refund_request", "deposits:manage",
      "payments:take",
      // B8: the desk quotes from the rate card constantly; it does not set it.
      "rates:read", "inventory:calendar",
    ],
  },
  RSV: {
    name: "Reservations Staff", permissions: [
      "reservations:create", "guests:create", "reports:occupancy", "reports:guests", "handover:use",
      "invoices:issue",
      "reservations:cancel", "finance:refund_request",
      "rates:read", "inventory:calendar",
    ],
  },
  HK: {
    name: "Housekeeping", permissions: [
      "housekeeping:manage", "housekeeping:inspect", "frontoffice:lostfound",
      "inventory:read", "reports:inventory", "handover:use",
    ],
  },
  MX: {
    name: "Maintenance", permissions: [
      "maintenance:manage", "inventory:read", "purchasing:suppliers", "handover:use",
    ],
  },
  RT: {
    name: "Restaurant Staff", permissions: [
      "restaurant:manage", "restaurant:operate", "folio:postcharge",
      "inventory:read", "reports:inventory", "handover:use",
      "payments:take",
    ],
  },
  RO: {
    name: "Resident Officer", permissions: [
      "housekeeping:inspect", "frontoffice:lostfound", "handover:use",
      "guests:message",
      // B4: the Resident Officer is the overnight authority and is the one
      // on site when a posting error surfaces at 2am.
      "folio:void",
    ],
  },
  CS: {
    name: "Customer Service", permissions: [
      "guests:create", "frontoffice:lostfound", "reports:guests",
      "guests:message",
    ],
  },
  FIN: {
    name: "Finance / Accountant", permissions: [
      "folio:read", "folio:write", "folio:postcharge", "finance:read",
      "folio:void", "finance:reports", "finance:reopen_day", "settings:tax",
      "invoices:issue", "invoices:void", "invoices:credit_note", "settings:documents",
      // B9. Note FIN does NOT hold finance:refund_approve_high -- a
      // high-value refund escalates to MGT/ORG, who carry "*".
      "reservations:cancel", "reservations:waive_penalty",
      "finance:refund_request", "finance:refund_approve",
      "deposits:manage", "settings:cancellation",
      "payments:take", "payments:reconcile", "settings:gateways",
      "rates:read", "rates:manage", "inventory:calendar",
      "inventory:read", "inventory:write", "purchasing:suppliers", "purchasing:orders",
      "hr:payroll", "reports:occupancy", "reports:revenue", "reports:inventory", "reports:staff",
      "handover:use",
    ],
  },
  IT: {
    name: "IT Department", permissions: [
      "doorlock:use", "doorlock:configure", "settings:branch", "settings:tax",
      "admin:manage", "admin:devices", "admin:operations", "roles:manage",
      "settings:documents", "settings:cancellation", "settings:gateways", "rates:manage",
    ],
  },
};
