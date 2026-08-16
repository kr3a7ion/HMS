// UI Adoption F11 — ONE source of truth for navigation.
//
// Doc 3 §3: the app had two. A `Screen` string union drove a 90-branch switch
// and a hand-written sidebar tree, while `react-router` served 16 real URLs,
// with a `*` catch-all falling back into the switch. Adding a screen meant
// touching the union, the switch, the NAV tree and SCREEN_ROLE_MAP -- four
// places, and nothing failed if you missed one. A screen could be reachable
// by URL but absent from the sidebar, or listed for a role the server
// refuses. `nav()` took a screen id and a display label, so the label was
// stated at every call site and drifted from the sidebar's copy.
//
// Everything now hangs off ROUTES below: the <Routes> block, the sidebar,
// role filtering, module gating, and the page title. A screen that is not
// here does not exist.
//
// ROLE FILTERING IS UX, NOT SECURITY. Every server route carries its own
// requirePermission(); hiding a sidebar entry only spares staff a 403 they
// could not act on. See components/RoleGate.tsx for the action-level twin.
import type { ReactElement } from "react";
import {
  LayoutDashboard, CalendarDays, KeyRound, BedDouble, Wrench,
  UtensilsCrossed, MessageSquare, DollarSign, Package, Users,
  Building2, BarChart3, Shield,
} from "lucide-react";
import type { Role, AddToast } from "./data";
import type { ModuleKey } from "./lib/api";

import { DashboardMgmt } from "./screens/dashboard/DashboardMgmt";
import { DashboardRole } from "./screens/dashboard/DashboardRole";
import { ReservationGrid } from "./screens/reservations/ReservationGrid";
import { NewReservation } from "./screens/reservations/NewReservation";
import { ReservationSearch } from "./screens/reservations/ReservationSearch";
import { ReservationDetail } from "./screens/reservations/ReservationDetail";
import { GroupBookings } from "./screens/reservations/GroupBookings";
import { Waitlist } from "./screens/reservations/Waitlist";
import { RateManagement } from "./screens/reservations/RateManagement";
import { CancellationRefund } from "./screens/reservations/CancellationRefund";
import { CheckInWizard } from "./screens/front-desk/CheckInWizard";
import { CheckOut } from "./screens/front-desk/CheckOut";
import { InHouseGuests } from "./screens/front-desk/InHouseGuests";
import { GuestProfiles } from "./screens/front-desk/GuestProfiles";
import { GuestProfileDetail } from "./screens/front-desk/GuestProfileDetail";
import { ArrivalsScreen } from "./screens/front-desk/ArrivalsScreen";
import { DeparturesScreen } from "./screens/front-desk/DeparturesScreen";
import { FolioScreen } from "./screens/front-desk/FolioScreen";
import { WalkInReg } from "./screens/front-desk/WalkInReg";
import { RoomAssignmentBoard } from "./screens/front-desk/RoomAssignmentBoard";
import { KeyCardMgmt } from "./screens/front-desk/KeyCardMgmt";
import { RoomAccessMgmt } from "./screens/front-desk/RoomAccessMgmt";
import { KeyCardLog } from "./screens/front-desk/KeyCardLog";
import { PINManagement } from "./screens/front-desk/PINManagement";
import { HKBoard } from "./screens/housekeeping/HKBoard";
import { HKMyTasks } from "./screens/housekeeping/HKMyTasks";
import { InspectionLog } from "./screens/housekeeping/InspectionLog";
import { LinenSupplies } from "./screens/housekeeping/LinenSupplies";
import { HousekeepingSchedule } from "./screens/housekeeping/HousekeepingSchedule";
import { LostFound } from "./screens/housekeeping/LostFound";
import { DNDLog } from "./screens/housekeeping/DNDLog";
import { WorkOrders } from "./screens/maintenance/WorkOrders";
import { WorkOrderDetail } from "./screens/maintenance/WorkOrderDetail";
import { AssetRegister } from "./screens/maintenance/AssetRegister";
import { PreventiveSchedule } from "./screens/maintenance/PreventiveSchedule";
import { VendorContacts } from "./screens/maintenance/VendorContacts";
import { POSTerminal } from "./screens/restaurant/POSTerminal";
import { KitchenDisplay } from "./screens/restaurant/KitchenDisplay";
import { TableManagement } from "./screens/restaurant/TableManagement";
import { MenuManagement } from "./screens/restaurant/MenuManagement";
import { DiningReservations } from "./screens/restaurant/DiningReservations";
import { RoomServiceOrders } from "./screens/restaurant/RoomServiceOrders";
import { GuestRoomCharges } from "./screens/restaurant/GuestRoomCharges";
import { InternalChat } from "./screens/communications/InternalChat";
import { GuestMessaging } from "./screens/communications/GuestMessaging";
import { Announcements } from "./screens/communications/Announcements";
import { ShiftHandover } from "./screens/communications/ShiftHandover";
import { InvoiceReceipts } from "./screens/finance/InvoiceReceipts";
import { AccountsPayable } from "./screens/finance/AccountsPayable";
import { DailySummary } from "./screens/finance/DailySummary";
import { RevenueReports } from "./screens/finance/RevenueReports";
import { FinanceFolioManagement } from "./screens/finance/FinanceFolioManagement";
import { StockDashboard } from "./screens/inventory/StockDashboard";
import { ProductsScreen } from "./screens/inventory/ProductsScreen";
import { SuppliersScreen } from "./screens/inventory/SuppliersScreen";
import { StockTransactions } from "./screens/inventory/StockTransactions";
import { PurchaseOrders } from "./screens/inventory/PurchaseOrders";
import { StaffDirectory } from "./screens/hr/StaffDirectory";
import { StaffProfileDetail } from "./screens/hr/StaffProfileDetail";
import { RolesPermissions } from "./screens/hr/RolesPermissions";
import { AttendanceScreen } from "./screens/hr/AttendanceScreen";
import { ShiftScheduler } from "./screens/hr/ShiftScheduler";
import { PayrollSummary } from "./screens/hr/PayrollSummary";
import { OccupancyReports } from "./screens/reports/OccupancyReports";
import { DepartmentReports } from "./screens/reports/DepartmentReports";
import { GuestAnalytics } from "./screens/reports/GuestAnalytics";
import { InventoryReports } from "./screens/reports/InventoryReports";
import { StaffReports } from "./screens/reports/StaffReports";
import { SystemHealth } from "./screens/it-admin/SystemHealth";
import { UserManagement } from "./screens/it-admin/UserManagement";
import { DeviceManagement } from "./screens/it-admin/DeviceManagement";
import { BackupRestore } from "./screens/it-admin/BackupRestore";
import { AuditLog } from "./screens/it-admin/AuditLog";
import { HotelConfig } from "./screens/settings/HotelConfig";
import { DoorLockSettings } from "./screens/settings/DoorLockSettings";
import { MyPreferences } from "./screens/settings/MyPreferences";
import { SyncSettings } from "./screens/settings/SyncSettings";
import { BranchOverview } from "./screens/multi-branch/BranchOverview";
import { BranchComparison } from "./screens/multi-branch/BranchComparison";
import { CentralSyncStatus } from "./screens/multi-branch/CentralSyncStatus";

/** Everything a screen may need, supplied by the shell. */
export interface ScreenCtx {
  add: AddToast;
  role: Role;
}

export interface RouteDef {
  path: string;
  /** Sidebar text AND page title — stated once, so they cannot disagree. */
  label: string;
  roles: Role[];
  /** Hidden entirely when the module is disabled (ST-01 Enabled Modules). */
  module?: ModuleKey;
  /** Detail/child routes: routable, but never a sidebar entry. */
  hidden?: boolean;
  element: (ctx: ScreenCtx) => ReactElement;
}

const ALL: Role[] = ["MGT", "ORG", "FD", "HK", "MX", "FIN", "RT", "RSV", "IT"];

// Role lists are carried over verbatim from the former SCREEN_ROLE_MAP.
// Each department sees what it needs day to day; MGT/ORG see nearly
// everything for oversight but are kept out of hands-on terminals (POS,
// KDS, the housekeeper's task view) they would never operate themselves.
//
// RO (Resident Officer) and CS (Customer Service) exist in the Blueprint's
// matrix and are enforced server-side, but no login role in this app can be
// RO/CS yet -- no seed account, not assignable via HR/IT invite -- so they
// are omitted here rather than listed and unreachable.
export const ROUTES: RouteDef[] = [
  // ─── Dashboard ─────────────────────────────────────────────────────────
  { path: "/dashboard", label: "Dashboard", roles: ["MGT", "ORG"], element: c => <DashboardMgmt add={c.add} /> },
  { path: "/my-dashboard", label: "My Dashboard", roles: ALL, element: c => <DashboardRole role={c.role} /> },

  // ─── Reservations ──────────────────────────────────────────────────────
  { path: "/reservations/grid", label: "Reservation Grid", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <ReservationGrid add={c.add} /> },
  { path: "/reservations/new", label: "New Reservation", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <NewReservation add={c.add} /> },
  { path: "/reservations/groups", label: "Group Bookings", roles: ["RSV", "MGT", "ORG"], element: c => <GroupBookings add={c.add} /> },
  { path: "/reservations/waitlist", label: "Waitlist", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <Waitlist add={c.add} /> },
  { path: "/reservations/rates", label: "Rate Management", roles: ["RSV", "FIN", "MGT", "ORG"], element: c => <RateManagement add={c.add} /> },
  { path: "/reservations/search", label: "Reservation Search", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <ReservationSearch add={c.add} /> },
  { path: "/reservations/cancellations", label: "Cancellation & Refund", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <CancellationRefund add={c.add} /> },
  { path: "/reservations/:id", label: "Reservation", roles: ["FD", "RSV", "MGT", "ORG"], hidden: true, element: c => <ReservationDetail add={c.add} /> },

  // ─── Front Desk ────────────────────────────────────────────────────────
  { path: "/front-desk/check-in", label: "Check-In", roles: ["FD", "MGT", "ORG"], element: c => <CheckInWizard add={c.add} /> },
  { path: "/front-desk/check-out", label: "Check-Out", roles: ["FD", "MGT", "ORG"], element: c => <CheckOut add={c.add} /> },
  { path: "/front-desk/check-out/:reservationId", label: "Check-Out", roles: ["FD", "MGT", "ORG"], hidden: true, element: c => <CheckOut add={c.add} /> },
  { path: "/front-desk/in-house", label: "In-House Guests", roles: ["FD", "MGT", "ORG"], element: c => <InHouseGuests add={c.add} /> },
  { path: "/front-desk/arrivals", label: "Arrivals List", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <ArrivalsScreen add={c.add} /> },
  { path: "/front-desk/departures", label: "Departures List", roles: ["FD", "MGT", "ORG"], element: c => <DeparturesScreen add={c.add} /> },
  { path: "/front-desk/guests", label: "Guest Profiles", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <GuestProfiles add={c.add} /> },
  { path: "/front-desk/guests/:id", label: "Guest Profile", roles: ["FD", "RSV", "MGT", "ORG"], hidden: true, element: c => <GuestProfileDetail add={c.add} /> },
  { path: "/front-desk/room-assignment", label: "Room Assignment", roles: ["FD", "RSV", "MGT", "ORG"], element: c => <RoomAssignmentBoard add={c.add} /> },
  { path: "/front-desk/walk-in", label: "Walk-In Registration", roles: ["FD", "MGT", "ORG"], element: c => <WalkInReg add={c.add} /> },
  { path: "/front-desk/folio", label: "Folio Management", roles: ["FD", "FIN", "MGT", "ORG"], element: c => <FolioScreen add={c.add} /> },
  { path: "/front-desk/folio/:reservationId", label: "Folio", roles: ["FD", "FIN", "MGT", "ORG"], hidden: true, element: c => <FolioScreen add={c.add} /> },
  // Door Lock is not its own nav section — it is spread across these four
  // Front Desk entries plus one in Settings — so a "one section = one
  // module" filter cannot gate it. Tagging each route does.
  { path: "/front-desk/key-cards", label: "Key Card Management", roles: ["FD", "IT", "MGT", "ORG"], module: "doorLock", element: c => <KeyCardMgmt add={c.add} /> },
  { path: "/front-desk/room-access", label: "Room Access Mgmt", roles: ["FD", "MGT", "ORG"], module: "doorLock", element: c => <RoomAccessMgmt add={c.add} /> },
  { path: "/front-desk/key-card-log", label: "Key Card Log", roles: ["FD", "IT", "MGT", "ORG"], module: "doorLock", element: () => <KeyCardLog /> },
  { path: "/front-desk/pins", label: "PIN Management", roles: ["FD", "MGT", "ORG"], module: "doorLock", element: c => <PINManagement add={c.add} /> },

  // ─── Housekeeping ──────────────────────────────────────────────────────
  { path: "/housekeeping/board", label: "Housekeeping Board", roles: ["FD", "HK", "MGT", "ORG"], element: c => <HKBoard add={c.add} /> },
  { path: "/housekeeping/my-tasks", label: "My Tasks", roles: ["HK"], element: c => <HKMyTasks add={c.add} /> },
  { path: "/housekeeping/schedule", label: "Schedule", roles: ["HK", "MGT", "ORG"], element: c => <HousekeepingSchedule add={c.add} /> },
  { path: "/housekeeping/inspections", label: "Inspection Log", roles: ["HK", "MGT", "ORG"], element: c => <InspectionLog add={c.add} /> },
  { path: "/housekeeping/lost-found", label: "Lost & Found", roles: ["HK", "MGT", "ORG"], element: c => <LostFound add={c.add} /> },
  { path: "/housekeeping/linen", label: "Linen & Supplies", roles: ["HK", "FIN", "MGT", "ORG"], element: c => <LinenSupplies add={c.add} /> },
  { path: "/housekeeping/dnd", label: "Do Not Disturb Log", roles: ["FD", "HK", "MGT", "ORG"], element: c => <DNDLog add={c.add} /> },

  // ─── Maintenance ───────────────────────────────────────────────────────
  { path: "/maintenance/work-orders", label: "Work Orders", roles: ["FD", "HK", "MX", "MGT", "ORG"], element: c => <WorkOrders add={c.add} /> },
  { path: "/maintenance/work-orders/:id", label: "Work Order", roles: ["FD", "HK", "MX", "MGT", "ORG"], hidden: true, element: c => <WorkOrderDetail add={c.add} /> },
  { path: "/maintenance/assets", label: "Asset Register", roles: ["MX", "IT", "MGT", "ORG"], element: c => <AssetRegister add={c.add} /> },
  { path: "/maintenance/preventive", label: "Preventive Schedule", roles: ["MX", "MGT", "ORG"], element: c => <PreventiveSchedule add={c.add} /> },
  { path: "/maintenance/vendors", label: "Vendor Contacts", roles: ["MX", "FIN", "MGT", "ORG"], element: c => <VendorContacts add={c.add} /> },

  // ─── Restaurant / POS ──────────────────────────────────────────────────
  { path: "/restaurant/pos", label: "POS Terminal", roles: ["RT"], module: "restaurant", element: c => <POSTerminal add={c.add} /> },
  { path: "/restaurant/kitchen", label: "Kitchen Display", roles: ["RT"], module: "restaurant", element: () => <KitchenDisplay /> },
  { path: "/restaurant/tables", label: "Table Management", roles: ["RT", "MGT", "ORG"], module: "restaurant", element: c => <TableManagement add={c.add} /> },
  { path: "/restaurant/menu", label: "Menu Management", roles: ["RT", "MGT", "ORG"], module: "restaurant", element: c => <MenuManagement add={c.add} /> },
  { path: "/restaurant/dining-reservations", label: "Dining Reservations", roles: ["RT", "MGT", "ORG"], module: "restaurant", element: c => <DiningReservations add={c.add} /> },
  { path: "/restaurant/room-service", label: "Room Service Orders", roles: ["FD", "RT", "MGT", "ORG"], module: "restaurant", element: c => <RoomServiceOrders add={c.add} /> },
  { path: "/restaurant/room-charges", label: "Guest Room Charges", roles: ["FD", "RT", "FIN", "MGT", "ORG"], module: "restaurant", element: () => <GuestRoomCharges /> },

  // ─── Communications ────────────────────────────────────────────────────
  { path: "/communications/chat", label: "Internal Chat", roles: ALL, element: c => <InternalChat add={c.add} /> },
  { path: "/communications/guest-messaging", label: "Guest Messaging", roles: ["FD", "MGT", "ORG"], element: c => <GuestMessaging add={c.add} /> },
  { path: "/communications/announcements", label: "Announcements", roles: ["MGT", "ORG"], element: c => <Announcements add={c.add} /> },
  { path: "/communications/shift-handover", label: "Shift Handover", roles: ["FD", "RSV", "HK", "MX", "RT", "MGT", "ORG"], element: c => <ShiftHandover add={c.add} /> },

  // ─── Finance & Billing ─────────────────────────────────────────────────
  { path: "/finance/folios", label: "Folio Management", roles: ["FD", "FIN", "MGT", "ORG"], element: c => <FinanceFolioManagement add={c.add} /> },
  { path: "/finance/invoices", label: "Invoice & Receipts", roles: ["FD", "RT", "FIN", "MGT", "ORG"], element: c => <InvoiceReceipts add={c.add} /> },
  { path: "/finance/daily-summary", label: "Daily Summary", roles: ["FIN", "MGT", "ORG"], element: c => <DailySummary add={c.add} /> },
  { path: "/finance/payables", label: "Accounts Payable", roles: ["FIN", "MGT", "ORG"], element: c => <AccountsPayable add={c.add} /> },
  // RevenueReports is deliberately reachable from BOTH Finance and Reports.
  // The old nav had it under both ("revenue-reports" and "rp-revenue" both
  // hit the same component); dropping either entry would remove a nav path
  // staff already use.
  { path: "/finance/revenue", label: "Revenue Reports", roles: ["FIN", "MGT", "ORG"], element: () => <RevenueReports /> },

  // ─── Inventory ─────────────────────────────────────────────────────────
  { path: "/inventory", label: "Stock Dashboard", roles: ["HK", "MX", "RT", "FIN", "MGT", "ORG"], module: "inventory", element: c => <StockDashboard add={c.add} /> },
  { path: "/inventory/products", label: "Products", roles: ["FIN", "MGT", "ORG"], module: "inventory", element: c => <ProductsScreen add={c.add} /> },
  { path: "/inventory/suppliers", label: "Suppliers", roles: ["MX", "FIN", "MGT", "ORG"], module: "inventory", element: c => <SuppliersScreen add={c.add} /> },
  { path: "/inventory/transactions", label: "Stock Transactions", roles: ["HK", "MX", "RT", "FIN", "MGT", "ORG"], module: "inventory", element: c => <StockTransactions add={c.add} /> },
  { path: "/inventory/purchase-orders", label: "Purchase Orders", roles: ["FIN", "MGT", "ORG"], module: "inventory", element: c => <PurchaseOrders add={c.add} /> },

  // ─── HR & Staff ────────────────────────────────────────────────────────
  { path: "/hr/staff", label: "Staff Directory", roles: ["MGT", "ORG"], element: c => <StaffDirectory add={c.add} /> },
  { path: "/hr/staff/:id", label: "Staff Profile", roles: ["MGT", "ORG"], hidden: true, element: c => <StaffProfileDetail add={c.add} /> },
  { path: "/hr/roles", label: "Roles & Permissions", roles: ["IT", "MGT", "ORG"], element: c => <RolesPermissions add={c.add} /> },
  { path: "/hr/attendance", label: "Attendance", roles: ["FIN", "MGT", "ORG"], element: c => <AttendanceScreen add={c.add} /> },
  { path: "/hr/shifts", label: "Shift Scheduler", roles: ["MGT", "ORG"], element: c => <ShiftScheduler add={c.add} /> },
  { path: "/hr/payroll", label: "Payroll Summary", roles: ["FIN", "MGT", "ORG"], element: c => <PayrollSummary add={c.add} /> },

  // ─── Multi-Branch ──────────────────────────────────────────────────────
  { path: "/branches", label: "Branch Overview", roles: ["ORG"], module: "multiBranch", element: c => <BranchOverview add={c.add} /> },
  { path: "/branches/comparison", label: "Branch Comparison", roles: ["ORG"], module: "multiBranch", element: c => <BranchComparison add={c.add} /> },
  { path: "/branches/sync", label: "Central Sync Status", roles: ["IT", "ORG"], module: "multiBranch", element: c => <CentralSyncStatus add={c.add} /> },

  // ─── Reports ───────────────────────────────────────────────────────────
  { path: "/reports/occupancy", label: "Occupancy Reports", roles: ["RSV", "FIN", "MGT", "ORG"], element: () => <OccupancyReports /> },
  { path: "/reports/revenue", label: "Revenue Reports", roles: ["FIN", "MGT", "ORG"], element: () => <RevenueReports /> },
  { path: "/reports/department", label: "Department Reports", roles: ALL, element: c => <DepartmentReports role={c.role} /> },
  { path: "/reports/guests", label: "Guest Analytics", roles: ["RSV", "MGT", "ORG"], element: () => <GuestAnalytics /> },
  { path: "/reports/inventory", label: "Inventory Reports", roles: ["HK", "RT", "FIN", "MGT", "ORG"], element: () => <InventoryReports /> },
  { path: "/reports/staff", label: "Staff Reports", roles: ["FIN", "MGT", "ORG"], element: () => <StaffReports /> },

  // ─── IT Admin ──────────────────────────────────────────────────────────
  { path: "/it/users", label: "User Management", roles: ["IT", "MGT", "ORG"], element: c => <UserManagement add={c.add} /> },
  { path: "/it/health", label: "System Health", roles: ["IT", "ORG"], element: c => <SystemHealth add={c.add} /> },
  { path: "/it/devices", label: "Device Management", roles: ["IT"], element: c => <DeviceManagement add={c.add} /> },
  { path: "/it/backup", label: "Backup & Restore", roles: ["IT", "ORG"], element: c => <BackupRestore add={c.add} /> },
  { path: "/it/audit", label: "Audit Log", roles: ["IT", "ORG"], element: () => <AuditLog /> },

  // ─── Settings (reached from the user menu, not the sidebar) ────────────
  { path: "/settings/property", label: "Hotel Configuration", roles: ["IT", "MGT", "ORG"], hidden: true, element: c => <HotelConfig add={c.add} /> },
  { path: "/settings/door-lock", label: "Door Lock Integration", roles: ["IT", "MGT", "ORG"], module: "doorLock", hidden: true, element: c => <DoorLockSettings add={c.add} /> },
  { path: "/settings/preferences", label: "My Preferences", roles: ALL, hidden: true, element: c => <MyPreferences add={c.add} /> },
  { path: "/settings/sync", label: "Sync Settings", roles: ["IT", "ORG"], hidden: true, element: c => <SyncSettings add={c.add} /> },
];

// ─── Sidebar structure ────────────────────────────────────────────────────
// Sections reference routes BY PATH. A typo is a build error via the
// assertion below, not a dead sidebar entry discovered in production.
export interface NavSection {
  icon: React.ElementType;
  label: string;
  badge?: number;
  /** A section with no children is itself a link. */
  path?: string;
  children?: string[];
}

export const NAV_SECTIONS: NavSection[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: CalendarDays, label: "Reservations", badge: 3, children: [
    "/reservations/grid", "/reservations/new", "/reservations/groups", "/reservations/waitlist",
    "/reservations/rates", "/reservations/search", "/reservations/cancellations",
  ] },
  { icon: KeyRound, label: "Front Desk", badge: 2, children: [
    "/front-desk/check-in", "/front-desk/check-out", "/front-desk/in-house", "/front-desk/arrivals",
    "/front-desk/departures", "/front-desk/guests", "/front-desk/room-assignment", "/front-desk/walk-in",
    "/front-desk/folio", "/front-desk/key-cards", "/front-desk/room-access", "/front-desk/key-card-log",
    "/front-desk/pins",
  ] },
  { icon: BedDouble, label: "Housekeeping", children: [
    "/housekeeping/board", "/housekeeping/my-tasks", "/housekeeping/schedule",
    "/housekeeping/inspections", "/housekeeping/lost-found", "/housekeeping/linen", "/housekeeping/dnd",
  ] },
  { icon: Wrench, label: "Maintenance", badge: 2, children: [
    "/maintenance/work-orders", "/maintenance/assets", "/maintenance/preventive", "/maintenance/vendors",
  ] },
  { icon: UtensilsCrossed, label: "Restaurant / POS", children: [
    "/restaurant/pos", "/restaurant/kitchen", "/restaurant/tables", "/restaurant/menu",
    "/restaurant/dining-reservations", "/restaurant/room-service", "/restaurant/room-charges",
  ] },
  { icon: MessageSquare, label: "Communications", badge: 5, children: [
    "/communications/chat", "/communications/guest-messaging",
    "/communications/announcements", "/communications/shift-handover",
  ] },
  { icon: DollarSign, label: "Finance & Billing", badge: 1, children: [
    "/finance/folios", "/finance/invoices", "/finance/daily-summary",
    "/finance/payables", "/finance/revenue",
  ] },
  { icon: Package, label: "Inventory", children: [
    "/inventory", "/inventory/products", "/inventory/suppliers",
    "/inventory/transactions", "/inventory/purchase-orders",
  ] },
  { icon: Users, label: "HR & Staff", children: [
    "/hr/staff", "/hr/roles", "/hr/attendance", "/hr/shifts", "/hr/payroll",
  ] },
  { icon: Building2, label: "Multi-Branch", children: [
    "/branches", "/branches/comparison", "/branches/sync",
  ] },
  { icon: BarChart3, label: "Reports", children: [
    "/reports/occupancy", "/reports/revenue", "/reports/department",
    "/reports/guests", "/reports/inventory", "/reports/staff",
  ] },
  { icon: Shield, label: "IT Admin", children: [
    "/it/users", "/it/health", "/it/devices", "/it/backup", "/it/audit",
  ] },
];

// ─── Lookups ──────────────────────────────────────────────────────────────
const BY_PATH = new Map(ROUTES.map(r => [r.path, r]));

export function routeFor(path: string): RouteDef | undefined {
  return BY_PATH.get(path);
}

/** Is this route visible to `role`, with `modules` enabled? */
export function isRouteVisible(
  route: RouteDef, role: Role, modules: ModuleKey[] | null,
): boolean {
  if (!route.roles.includes(role)) return false;
  // `null` means settings have not loaded yet — show rather than flicker
  // sections in after the fetch resolves.
  if (route.module && modules && !modules.includes(route.module)) return false;
  return true;
}

/** Sections with their visible children, empty sections dropped. */
export function visibleNav(role: Role, modules: ModuleKey[] | null) {
  return NAV_SECTIONS
    .map(section => {
      if (section.path) {
        const r = routeFor(section.path);
        return r && isRouteVisible(r, role, modules) ? { ...section, children: [] } : null;
      }
      const children = (section.children ?? []).filter(p => {
        const r = routeFor(p);
        return r != null && isRouteVisible(r, role, modules);
      });
      return children.length > 0 ? { ...section, children } : null;
    })
    .filter((s): s is NavSection & { children: string[] } => s != null);
}

/** Where a role lands at sign-in. */
export function landingPath(role: Role): string {
  return role === "MGT" || role === "ORG" ? "/dashboard" : "/my-dashboard";
}

// Every path named by the sidebar must exist in ROUTES. This is the check
// that the old four-place arrangement could not make: a sidebar entry
// pointing at nothing used to render a "coming soon" placeholder.
if ((import.meta as any).env?.DEV) {
  for (const section of NAV_SECTIONS) {
    for (const p of [section.path, ...(section.children ?? [])]) {
      if (p && !BY_PATH.has(p)) {
        throw new Error(`NAV_SECTIONS references unknown route "${p}" (section "${section.label}")`);
      }
    }
  }
}
