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

  { key: "inventory:read", label: "View stock levels", module: "Inventory" },
  { key: "inventory:write", label: "Adjust stock / receive deliveries", module: "Inventory" },
  { key: "purchasing:suppliers", label: "Manage suppliers", module: "Inventory" },
  { key: "purchasing:orders", label: "Create / send / receive purchase orders", module: "Inventory" },

  { key: "hr:manage", label: "Manage staff, shifts, and scheduling", module: "HR & Staff" },
  { key: "hr:payroll", label: "Attendance, leave approval, and payroll", module: "HR & Staff" },

  { key: "doorlock:use", label: "Issue / revoke door lock credentials", module: "Door Lock" },
  { key: "doorlock:configure", label: "Configure door lock provider & room mapping", module: "Door Lock" },

  { key: "settings:branch", label: "Edit branch / property settings", module: "IT & Settings" },
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
    ],
  },
  RSV: {
    name: "Reservations Staff", permissions: [
      "reservations:create", "guests:create", "reports:occupancy", "reports:guests", "handover:use",
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
    ],
  },
  RO: {
    name: "Resident Officer", permissions: [
      "housekeeping:inspect", "frontoffice:lostfound", "handover:use",
    ],
  },
  CS: {
    name: "Customer Service", permissions: [
      "guests:create", "frontoffice:lostfound", "reports:guests",
    ],
  },
  FIN: {
    name: "Finance / Accountant", permissions: [
      "folio:read", "folio:write", "folio:postcharge", "finance:read",
      "inventory:read", "inventory:write", "purchasing:suppliers", "purchasing:orders",
      "hr:payroll", "reports:occupancy", "reports:revenue", "reports:inventory", "reports:staff",
      "handover:use",
    ],
  },
  IT: {
    name: "IT Department", permissions: [
      "doorlock:use", "doorlock:configure", "settings:branch",
      "admin:manage", "admin:devices", "admin:operations", "roles:manage",
    ],
  },
};
