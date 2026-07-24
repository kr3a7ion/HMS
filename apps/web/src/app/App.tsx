// Lean shell: sidebar, header, notification panel, Router, App root.
// Screen components live under ./screens/<module>/, shared UI primitives in
// Screens.tsx, and data/constants in data.tsx.
import { useState, useCallback, useEffect } from "react";
import {
  LayoutDashboard, CalendarDays, KeyRound, BedDouble, Wrench,
  UtensilsCrossed, MessageSquare, DollarSign, Package, Users,
  Building2, BarChart3, Settings, ChevronLeft, ChevronRight,
  Bell, LogOut, User, ChevronDown, AlertTriangle, Plus,
  MoreHorizontal, ArrowRight, Home, Layers, X, Lock, Globe,
  ClipboardList, CalendarCheck, Star, AlertCircle, FileText, CreditCard, Truck,
  Shield, Cpu, Activity, RefreshCw, Hash, Phone, Edit3, Eye, Trash2,
  Download, Send, Menu as MenuIcon, HelpCircle, CheckCircle2, Search, WifiOff, Clock,
  TrendingUp, TrendingDown, UserCheck,
} from "lucide-react";

// ─── Shared data & types ─────────────────────────────────────────────────────
import {
  type Role, type Screen, type Toast, type ToastType,
  uid, fmtN,
  mono, sans, NAV_BG, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  NOTIFS, BRANCHES, SCREEN_ROLE_MAP, DOOR_LOCK_SCREENS,
} from "./data";
import { LoginScreen, ForgotPasswordScreen, ForceChangePasswordScreen } from "./Auth";
import AdminConsole from "./AdminConsole";
import OrgPortal from "./OrgPortal";
import { authApi, settingsApi, doorLockApi, type AuthUser, type ModuleKey, type LockQueueItem } from "./lib/api";
import { BranchOverview } from "./screens/multi-branch/BranchOverview";
import { BranchComparison } from "./screens/multi-branch/BranchComparison";
import { CentralSyncStatus } from "./screens/multi-branch/CentralSyncStatus";
import { Routes, Route, useNavigate, useLocation } from "react-router";

// Screen IDs that now live at a real URL instead of the old screen-switch
// mechanism (ROADMAP.md Phase 1 "stop being a single-page app"). Extend
// this as more modules get real routes in Phase 2 — nav() below handles
// both kinds transparently, old call sites don't need to change.
const REAL_ROUTES: Partial<Record<Screen, string>> = {
  "reservation-grid": "/reservations/grid",
  "new-reservation": "/reservations/new",
  "check-in": "/front-desk/check-in",
  "folio": "/front-desk/folio",
  "finance-folio": "/finance/folios",
  "check-out": "/front-desk/check-out",
  "work-orders": "/maintenance/work-orders",
  "pos-terminal": "/restaurant/pos",
  "table-management": "/restaurant/tables",
  "kitchen-display": "/restaurant/kitchen",
  "menu-management": "/restaurant/menu",
  "room-charges": "/restaurant/room-charges",
};

type AuthState = "login" | "branch" | "admin-console" | "org-portal" | "force-change-password";

// ─── Screen components & primitives ──────────────────────────────────────────
// Primitives (Badge, StatCard, PageHeader, Inp, Sel, etc.) live in Screens.tsx;
// every screen component lives in its own per-module file under ./screens/
// per Guidelines §2.
import { EmptyState, ToastC, LiveClock, SyncPill } from "./Screens";
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

// ─── Sidebar nav config ───────────────────────────────────────────────────────
const NAV: Array<{ icon: React.ElementType; label: string; screen?: Screen; badge?: number; children?: { label: string; screen: Screen }[] }> = [
  { icon: LayoutDashboard, label: "Dashboard", screen: "dashboard-mgmt" },
  { icon: CalendarDays, label: "Reservations", badge: 3, children: [{ label: "Reservation Grid", screen: "reservation-grid" }, { label: "New Reservation", screen: "new-reservation" }, { label: "Group Bookings", screen: "group-bookings" }, { label: "Waitlist", screen: "waitlist" }, { label: "Rate Management", screen: "rate-management" }, { label: "Reservation Search", screen: "reservation-search" }, { label: "Cancellation & Refund", screen: "cancellation" }] },
  { icon: KeyRound, label: "Front Desk", badge: 2, children: [{ label: "Check-In", screen: "check-in" }, { label: "Check-Out", screen: "check-out" }, { label: "In-House Guests", screen: "in-house-guests" }, { label: "Arrivals List", screen: "arrivals" }, { label: "Departures List", screen: "departures" }, { label: "Guest Profiles", screen: "guest-profiles" }, { label: "Room Assignment", screen: "room-assignment" }, { label: "Walk-In Registration", screen: "walk-in" }, { label: "Folio Management", screen: "folio" }, { label: "Key Card Management", screen: "key-card" }, { label: "Room Access Mgmt", screen: "room-access" }, { label: "Key Card Log", screen: "key-card-log" }, { label: "PIN Management", screen: "pin-management" }] },
  { icon: BedDouble, label: "Housekeeping", children: [{ label: "Housekeeping Board", screen: "hk-board" }, { label: "My Tasks", screen: "hk-tasks" }, { label: "Schedule", screen: "hk-schedule" }, { label: "Inspection Log", screen: "hk-inspection" }, { label: "Lost & Found", screen: "lost-found" }, { label: "Linen & Supplies", screen: "linen-supplies" }, { label: "Do Not Disturb Log", screen: "dnd-log" }] },
  { icon: Wrench, label: "Maintenance", badge: 2, children: [{ label: "Work Orders", screen: "work-orders" }, { label: "Asset Register", screen: "asset-register" }, { label: "Preventive Schedule", screen: "preventive-schedule" }, { label: "Vendor Contacts", screen: "vendor-contacts" }] },
  { icon: UtensilsCrossed, label: "Restaurant / POS", children: [{ label: "POS Terminal", screen: "pos-terminal" }, { label: "Kitchen Display", screen: "kitchen-display" }, { label: "Table Management", screen: "table-management" }, { label: "Menu Management", screen: "menu-management" }, { label: "Dining Reservations", screen: "dining-reservations" }, { label: "Room Service Orders", screen: "room-service" }, { label: "Guest Room Charges", screen: "room-charges" }] },
  { icon: MessageSquare, label: "Communications", badge: 5, children: [{ label: "Internal Chat", screen: "internal-chat" }, { label: "Guest Messaging", screen: "guest-messaging" }, { label: "Announcements", screen: "announcements" }, { label: "Shift Handover", screen: "shift-handover" }] },
  { icon: DollarSign, label: "Finance & Billing", badge: 1, children: [{ label: "Folio Management", screen: "finance-folio" }, { label: "Invoice & Receipts", screen: "invoices" }, { label: "Daily Summary", screen: "daily-summary" }, { label: "Accounts Payable", screen: "accounts-payable" }, { label: "Revenue Reports", screen: "revenue-reports" }] },
  { icon: Package, label: "Inventory", children: [{ label: "Stock Dashboard", screen: "stock-dashboard" }, { label: "Products", screen: "products" }, { label: "Suppliers", screen: "suppliers" }, { label: "Stock Transactions", screen: "stock-transactions" }, { label: "Purchase Orders", screen: "purchase-orders" }] },
  { icon: Users, label: "HR & Staff", children: [{ label: "Staff Directory", screen: "staff-directory" }, { label: "Roles & Permissions", screen: "roles-permissions" }, { label: "Attendance", screen: "attendance" }, { label: "Shift Scheduler", screen: "shift-scheduler" }, { label: "Payroll Summary", screen: "payroll" }] },
  { icon: Building2, label: "Multi-Branch", children: [{ label: "Branch Overview", screen: "branch-overview" }, { label: "Branch Comparison", screen: "branch-comparison" }, { label: "Central Sync Status", screen: "sync-status" }] },
  { icon: BarChart3, label: "Reports", children: [{ label: "Occupancy Reports", screen: "rp-occupancy" }, { label: "Revenue Reports", screen: "rp-revenue" }, { label: "Department Reports", screen: "rp-department" }, { label: "Guest Analytics", screen: "rp-guest" }, { label: "Inventory Reports", screen: "rp-inventory" }, { label: "Staff Reports", screen: "rp-staff" }] },
  { icon: Shield, label: "IT Admin", children: [{ label: "User Management", screen: "user-management" }, { label: "System Health", screen: "system-health" }, { label: "Device Management", screen: "device-management" }, { label: "Backup & Restore", screen: "backup-restore" }, { label: "Audit Log", screen: "audit-log" }] },
];

// ST-01 Enabled Modules -> sidebar visibility. Only the three top-level NAV
// entries that map cleanly to one whole module are filtered here; Door
// Lock isn't a single NAV item (it's spread across Front Desk's key-card
// sub-items plus Settings), so toggling it off only hides the Settings >
// Door Lock Integration entry, not Front Desk's already-built features.
const NAV_MODULE_MAP: Record<string, ModuleKey> = {
  "Restaurant / POS": "restaurant",
  "Inventory": "inventory",
  "Multi-Branch": "multiBranch",
};

// ─── Placeholder for unbuilt screens ─────────────────────────────────────────
function PlaceholderScreen({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-xl font-bold" style={{ color: TEXT }}>{title}</h1></div></div>
      <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}>
        <EmptyState icon={Icon} message={desc} cta={`Open ${title}`} />
      </div>
    </div>
  );
}

// ─── Nav type ─────────────────────────────────────────────────────────────────
type NavFn = (s: Screen, label: string) => void;

// ─── Router ───────────────────────────────────────────────────────────────────
function Router({ screen, add, role, nav }: { screen: Screen; add: (t: Omit<Toast, "id">) => void; role: Role; nav: NavFn }) {
  // Dashboard
  if (screen === "dashboard-mgmt") return <DashboardMgmt add={add} nav={nav} />;
  if (screen === "dashboard-role") return <DashboardRole role={role} nav={nav} />;
  // Reservations
  // "reservation-grid" and "new-reservation" are real routes now (App root
  // Routes block) — nav() redirects there instead of reaching this switch.
  if (screen === "reservation-search") return <ReservationSearch add={add} nav={nav} />;
  if (screen === "reservation-detail") return <ReservationDetail add={add} />;
  if (screen === "group-bookings") return <GroupBookings add={add} />;
  if (screen === "waitlist") return <Waitlist add={add} />;
  if (screen === "rate-management") return <RateManagement add={add} />;
  if (screen === "cancellation") return <CancellationRefund add={add} />;
  // Front Desk
  // "check-in", "check-out", "folio"/"finance-folio" are real routes now —
  // see the note above.
  if (screen === "in-house-guests") return <InHouseGuests add={add} nav={nav} />;
  if (screen === "guest-profiles") return <GuestProfiles add={add} nav={nav} />;
  if (screen === "guest-profile-detail") return <GuestProfileDetail add={add} />;
  if (screen === "arrivals") return <ArrivalsScreen add={add} nav={nav} />;
  if (screen === "departures") return <DeparturesScreen add={add} nav={nav} />;
  if (screen === "room-assignment") return <RoomAssignmentBoard add={add} nav={nav} />;
  if (screen === "walk-in") return <WalkInReg add={add} />;
  if (screen === "key-card") return <KeyCardMgmt add={add} nav={nav} />;
  if (screen === "room-access") return <RoomAccessMgmt add={add} nav={nav} />;
  if (screen === "key-card-log") return <KeyCardLog />;
  if (screen === "pin-management") return <PINManagement add={add} nav={nav} />;
  // Housekeeping
  if (screen === "hk-board") return <HKBoard add={add} nav={nav} />;
  if (screen === "hk-tasks") return <HKMyTasks add={add} />;
  if (screen === "hk-inspection") return <InspectionLog add={add} />;
  if (screen === "linen-supplies") return <LinenSupplies add={add} />;
  if (screen === "hk-schedule") return <HousekeepingSchedule add={add} />;
  if (screen === "lost-found") return <LostFound add={add} />;
  if (screen === "dnd-log") return <DNDLog add={add} />;
  // Maintenance
  // "work-orders" and "work-order-detail" are real routes now (App root
  // Routes block) — nav() redirects there instead of reaching this switch.
  if (screen === "asset-register") return <AssetRegister add={add} />;
  if (screen === "preventive-schedule") return <PreventiveSchedule add={add} />;
  if (screen === "vendor-contacts") return <VendorContacts add={add} />;
  // Restaurant
  // "pos-terminal", "table-management", "kitchen-display",
  // "menu-management", "room-charges" are real routes now — see the note
  // above and the Routes block below.
  if (screen === "dining-reservations") return <DiningReservations add={add} />;
  if (screen === "room-service") return <RoomServiceOrders add={add} />;
  // Communications
  if (screen === "internal-chat") return <InternalChat add={add} />;
  if (screen === "guest-messaging") return <GuestMessaging add={add} />;
  if (screen === "announcements") return <Announcements add={add} />;
  if (screen === "shift-handover") return <ShiftHandover add={add} />;
  // Finance
  if (screen === "invoices") return <InvoiceReceipts add={add} />;
  if (screen === "accounts-payable") return <AccountsPayable add={add} />;
  if (screen === "daily-summary") return <DailySummary add={add} />;
  if (screen === "rp-revenue" || screen === "revenue-reports") return <RevenueReports />;
  // Inventory
  if (screen === "stock-dashboard") return <StockDashboard add={add} />;
  if (screen === "products") return <ProductsScreen add={add} />;
  if (screen === "suppliers") return <SuppliersScreen add={add} />;
  if (screen === "stock-transactions") return <StockTransactions add={add} />;
  if (screen === "purchase-orders") return <PurchaseOrders add={add} />;
  // HR
  if (screen === "staff-directory") return <StaffDirectory add={add} />;
  if (screen === "roles-permissions") return <RolesPermissions add={add} />;
  if (screen === "attendance") return <AttendanceScreen add={add} />;
  if (screen === "shift-scheduler") return <ShiftScheduler add={add} />;
  if (screen === "payroll") return <PayrollSummary add={add} />;
  // Multi-Branch
  if (screen === "branch-overview") return <BranchOverview add={add} />;
  if (screen === "branch-comparison") return <BranchComparison add={add} />;
  if (screen === "sync-status") return <CentralSyncStatus add={add} />;
  // Reports
  if (screen === "rp-occupancy") return <OccupancyReports />;
  if (screen === "rp-department") return <DepartmentReports role={role} />;
  if (screen === "rp-guest") return <GuestAnalytics />;
  if (screen === "rp-inventory") return <InventoryReports />;
  if (screen === "rp-staff") return <StaffReports />;
  // IT Admin
  if (screen === "system-health") return <SystemHealth add={add} />;
  if (screen === "user-management") return <UserManagement add={add} />;
  if (screen === "device-management") return <DeviceManagement add={add} />;
  if (screen === "backup-restore") return <BackupRestore add={add} />;
  if (screen === "audit-log") return <AuditLog />;
  // Settings
  if (screen === "hotel-config") return <HotelConfig add={add} />;
  if (screen === "door-lock-settings") return <DoorLockSettings add={add} />;
  if (screen === "my-preferences") return <MyPreferences add={add} />;
  if (screen === "settings-sync") return <SyncSettings add={add} />;

  return <PlaceholderScreen title="Screen" desc="This screen is coming soon." icon={LayoutDashboard} />;
}

// ─── App Root ─────────────────────────────────────────────────────────────────
// ─── App Root — manages auth layer routing ────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState<AuthState>("login");
  const [loggedUser, setLoggedUser] = useState<AuthUser | null>(null);

  // Real local-server login always lands in the branch app (Nexura_Auth
  // Part 4.1 — even an on-site Org Super Admin authenticates against the
  // local server, not a separate portal). "admin-console" / "org-portal"
  // are reached via the links below the login form; each has its own real
  // central-server login gate inside OrgPortal.tsx/AdminConsole.tsx (Phase 3),
  // entirely separate from this local-server session.
  const handleLogin = (user: AuthUser) => {
    setLoggedUser(user);
    setAuthState("branch");
  };

  const handleLogout = () => {
    authApi.logout().catch(() => { /* best-effort — clear local state regardless */ });
    setLoggedUser(null);
    setAuthState("login");
  };

  if (authState === "login") {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onPreviewAdminConsole={() => setAuthState("admin-console")}
        onPreviewOrgPortal={() => setAuthState("org-portal")}
      />
    );
  }
  if (authState === "admin-console") return <AdminConsole onLogout={handleLogout} />;
  if (authState === "org-portal") return <OrgPortal onLogout={handleLogout} />;
  if (authState === "force-change-password") return <ForceChangePasswordScreen onComplete={() => setAuthState("branch")} />;

  if (!loggedUser) { setAuthState("login"); return null; }
  return <NexuraApp initialRole={loggedUser.role as Role} loggedUser={loggedUser} onLogout={handleLogout} />;
}

// ─── Nexura App Shell ─────────────────────────────────────────────────────────
// ─── Session Expired Modal (Nexura_Auth Part 7.1) ─────────────────────────────
function SessionExpiredModal({ offline, onStay, onSignOut }: { offline: boolean; onStay: () => void; onSignOut: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.6)" }} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ backgroundColor: "#FEF3C7" }}>
          <Clock size={22} style={{ color: "#D97706" }} />
        </div>
        <h3 className="text-base font-bold text-center mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
          {offline ? "Session Extended (Offline)" : "Session About to Expire"}
        </h3>
        <p className="text-sm text-center mb-5 leading-relaxed" style={{ color: "#64748B" }}>
          {offline
            ? "Your session token expired while offline. An 8-hour grace period extension has been issued automatically (Nexura_Auth §7.1). Please re-authenticate when connectivity returns."
            : "Your 12-hour session will expire in 5 minutes. Stay signed in or you'll be redirected to the login screen."}
        </p>
        <div className="flex gap-3">
          <button onClick={onSignOut} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-[#F8FAFC]" style={{ color: "#64748B", borderColor: "#E2E8F0" }}>
            Sign Out
          </button>
          <button onClick={onStay} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md" style={{ backgroundColor: "#123A73" }}>
            {offline ? "Continue Offline" : "Stay Signed In"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Permissions Changed Dialog (Nexura_Auth Part 6.3) ────────────────────────
function PermissionsChangedDialog({ onReLogin }: { onReLogin: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.6)" }} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ backgroundColor: "#EEF2FF" }}>
          <Shield size={22} style={{ color: "#4F46E5" }} />
        </div>
        <h3 className="text-base font-bold text-center mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
          Account Permissions Updated
        </h3>
        <p className="text-sm text-center mb-2 leading-relaxed" style={{ color: "#64748B" }}>
          Your role permissions were changed by a manager while you were logged in. Your current session has been invalidated (Nexura_Auth §6.3).
        </p>
        <p className="text-xs text-center mb-5" style={{ color: "#94A3B8" }}>Please sign in again to receive your updated permissions.</p>
        <button onClick={onReLogin} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#123A73" }}>
          Sign In Again
        </button>
      </div>
    </>
  );
}

function NexuraApp({ initialRole, loggedUser, onLogout }: { initialRole: Role; loggedUser: AuthUser; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("Front Desk");
  // D-01/D-02: MGT/ORG get the branch-wide Management Overview; every
  // other role lands on their own role-adaptive "My Dashboard" instead
  // (was unreachable via nav before -- see ROADMAP.md).
  const [screen, setScreen] = useState<Screen>(() => (initialRole === "MGT" || initialRole === "ORG") ? "dashboard-mgmt" : "dashboard-role");
  const [activeLabel, setActiveLabel] = useState("Dashboard");
  const [role, setRole] = useState<Role>(initialRole);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState("All");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [offline, setOffline] = useState(false);
  // Auth event dialogs (Nexura_Auth §6.3, §7.1)
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const [showPermsChanged, setShowPermsChanged] = useState(false);
  // ST-01 Enabled Modules -- fetched once per session; HotelConfig's own
  // save doesn't need to push a live update here, a reload picks it up,
  // same as any other settings change in this app.
  const [enabledModules, setEnabledModules] = useState<ModuleKey[] | null>(null);
  useEffect(() => { settingsApi.getBranch().then(s => setEnabledModules(s.enabledModules)).catch(() => setEnabledModules(["restaurant", "inventory", "multiBranch", "doorLock"])); }, []);
  // 6.10 Lock Command Queue Monitor -- only appears with real pending
  // items, polled every 30s (server itself retries every 2 min, see
  // server/src/services/locks/queue.ts; this is just the UI staying
  // current between those retries).
  const [lockQueue, setLockQueue] = useState<LockQueueItem[]>([]);
  const [lockQueueOpen, setLockQueueOpen] = useState(false);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const doorLockOn = enabledModules?.includes("doorLock") ?? false;
  useEffect(() => {
    if (!doorLockOn) return;
    const poll = () => doorLockApi.queue().then(setLockQueue).catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [doorLockOn]);
  const retryQueueNow = async () => {
    setRetryingQueue(true);
    try { await doorLockApi.retryQueueNow(); const q = await doorLockApi.queue(); setLockQueue(q); }
    finally { setRetryingQueue(false); }
  };
  // Role-Based Menu Visibility (Blueprint §2.5, SCREEN_ROLE_MAP in data.tsx)
  // -- each department sees only what it needs; MGT/ORG see everything for
  // oversight. Applied on top of the existing module-enabled filter.
  // "Dashboard" is the one top-level item with no children (a single
  // `screen` field) and is skipped here on purpose -- it always shows for
  // every role, just routed to a different real screen per role (see nav()
  // above and the initial-screen logic).
  const visibleNav = NAV
    .filter(item => {
      const key = NAV_MODULE_MAP[item.label];
      return enabledModules === null || !key || enabledModules.includes(key);
    })
    .map(item => item.children
      ? { ...item, children: item.children.filter(c => {
          if (DOOR_LOCK_SCREENS.includes(c.screen) && enabledModules !== null && !enabledModules.includes("doorLock")) return false;
          const allowed = SCREEN_ROLE_MAP[c.screen]; return !allowed || allowed.includes(role);
        }) }
      : item)
    .filter(item => !item.children || item.children.length > 0);

  const add = useCallback((t: Omit<Toast, "id">) => {
    const id = uid();
    setToasts(p => [...p, { ...t, id }]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 4500);
  }, []);
  const dismiss = useCallback((id: string) => setToasts(p => p.filter(t => t.id !== id)), []);

  const routerNavigate = useNavigate();
  const routerLocation = useLocation();
  const nav = (s: Screen, label: string) => {
    setScreen(s); setActiveLabel(label);
    setNotifOpen(false); setUserMenuOpen(false); setBranchMenuOpen(false);
    const realPath = REAL_ROUTES[s];
    if (realPath) { routerNavigate(realPath); return; }
    // Coming back to a screen-switch screen from a real route — make sure
    // the URL returns to the catch-all so it actually renders.
    if (routerLocation.pathname !== "/") routerNavigate("/");
  };

  const unread = NOTIFS.filter(n => n.unread).length;
  const parent = NAV.find(n => n.children?.some(c => c.screen === screen));
  const filteredN = notifFilter === "All" ? NOTIFS
    : notifFilter === "Urgent" ? NOTIFS.filter(n => n.category === "Emergency")
    : notifFilter === "Door Lock" ? NOTIFS.filter(n => n.category === "Door Lock")
    : notifFilter === "System" ? NOTIFS.filter(n => ["System", "Chat"].includes(n.category))
    : NOTIFS.filter(n => ["Reservation", "Housekeeping", "Maintenance", "Finance", "Restaurant"].includes(n.category));

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: sans, backgroundColor: "#F5F7FA" }}>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="flex flex-col h-full flex-shrink-0 transition-all duration-200 z-20"
        style={{ width: collapsed ? 64 : 240, backgroundColor: NAV_BG, borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none" }}>
        <div className="h-16 flex items-center flex-shrink-0 px-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: TEAL }}><Home size={16} color="white" /></div>
          {!collapsed && <div className="ml-3 overflow-hidden"><div className="text-white font-semibold text-sm leading-none truncate">Grand Palms Hotel</div><div className="text-xs mt-0.5 truncate" style={{ color: SUBTLE }}>Abuja Branch</div></div>}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {visibleNav.map(item => {
            const Icon = item.icon;
            const isActive = screen === item.screen || (item.screen === "dashboard-mgmt" && screen === "dashboard-role") || item.children?.some(c => c.screen === screen);
            const isExp = expanded === item.label;
            const hasChild = !!item.children?.length;
            return (
              <div key={item.label}>
                <button
                  onClick={() => {
                    if (item.screen) {
                      const target = item.screen === "dashboard-mgmt" && role !== "MGT" && role !== "ORG" ? "dashboard-role" : item.screen;
                      nav(target, item.label);
                    }
                    if (hasChild) {
                      if (collapsed) { setCollapsed(false); setExpanded(item.label); }
                      else setExpanded(p => p === item.label ? null : item.label);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors relative group"
                  style={{ backgroundColor: isActive ? "rgba(255,255,255,0.08)" : "transparent", borderLeft: isActive ? `3px solid ${ORANGE}` : "3px solid transparent", minHeight: 44 }}
                  title={collapsed ? item.label : undefined}>
                  <div className="relative flex-shrink-0">
                    <Icon size={18} color={isActive ? "white" : SUBTLE} />
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center" style={{ fontSize: 8, color: "white", fontWeight: 700 }}>{item.badge}</span>
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <span className={`flex-1 text-sm truncate ${isActive ? "text-white font-medium" : "text-[#CBD5E1]"}`}>{item.label}</span>
                      {hasChild && <ChevronDown size={13} color="#64748B" style={{ flexShrink: 0, transform: isExp ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }} />}
                    </>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50"
                      style={{ backgroundColor: NAV_BG, border: "1px solid rgba(255,255,255,0.1)" }}>
                      {item.label}
                    </div>
                  )}
                </button>
                {!collapsed && hasChild && isExp && (
                  <div style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", marginLeft: 28 }}>
                    {item.children!.map(c => (
                      <button key={c.label} onClick={() => nav(c.screen, c.label)}
                        className="w-full text-left px-4 py-1.5 text-xs truncate transition-colors hover:text-white"
                        style={{ color: screen === c.screen ? TEAL : SUBTLE, fontWeight: screen === c.screen ? 600 : 400, minHeight: 32 }}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!collapsed && (
            <>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Quick Actions</div>
                {[
                  { icon: Plus, label: "New Reservation", s: "new-reservation" as Screen },
                  { icon: KeyRound, label: "Quick Check-In", s: "check-in" as Screen },
                  { icon: ArrowRight, label: "Quick Check-Out", s: "check-out" as Screen },
                  { icon: AlertTriangle, label: "Emergency Alert", s: "internal-chat" as Screen, c: ERROR },
                ].filter(qa => { const allowed = SCREEN_ROLE_MAP[qa.s]; return !allowed || allowed.includes(role); }).map(qa => {
                  const Icon = qa.icon;
                  return (
                    <button key={qa.label} onClick={() => nav(qa.s, qa.label)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors" style={{ minHeight: 40 }}>
                      <Icon size={15} style={{ color: (qa as any).c ?? SUBTLE, flexShrink: 0 }} />
                      <span className="text-sm" style={{ color: (qa as any).c ?? "#CBD5E1" }}>{qa.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Settings</div>
                {[
                  { label: "Hotel Configuration", s: "hotel-config" as Screen },
                  { label: "Door Lock Integration", s: "door-lock-settings" as Screen },
                  { label: "Synchronization", s: "settings-sync" as Screen },
                  { label: "My Preferences", s: "my-preferences" as Screen },
                ].filter(item => {
                  if (DOOR_LOCK_SCREENS.includes(item.s) && enabledModules !== null && !enabledModules.includes("doorLock")) return false;
                  const allowed = SCREEN_ROLE_MAP[item.s]; return !allowed || allowed.includes(role);
                }).map(item => (
                  <button key={item.s} onClick={() => nav(item.s, item.label)}
                    className="w-full text-left px-4 py-1.5 text-xs truncate transition-colors hover:text-white"
                    style={{ color: screen === item.s ? TEAL : SUBTLE, fontWeight: screen === item.s ? 600 : 400, minHeight: 32 }}>
                    {item.label}
                  </button>
                ))}
                <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors" style={{ minHeight: 40 }}>
                  <HelpCircle size={16} color={SUBTLE} /><span className="text-sm text-[#CBD5E1]">Help</span>
                </button>
              </div>
            </>
          )}
        </nav>
        <button onClick={() => setCollapsed(p => !p)}
          className="flex items-center justify-center py-3 mx-3 mb-3 rounded-lg text-[#64748B] hover:text-white hover:bg-white/5 gap-2 text-xs"
          style={{ minHeight: 40, border: "1px solid rgba(255,255,255,0.08)" }}>
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
        </button>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center px-5 flex-shrink-0 z-10 gap-4"
          style={{ height: 64, backgroundColor: NAV_BG, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={() => setCollapsed(p => !p)} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 flex-shrink-0">
              <MenuIcon size={20} color="white" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: TEAL }}><Home size={13} color="white" /></div>
              <span className="text-white font-semibold text-sm hidden md:block">Grand Palms</span>
              <span className="hidden md:block" style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: SUBTLE }}>
              {parent && <><span className="hidden md:block">{parent.label}</span><span style={{ color: "rgba(255,255,255,0.2)" }}>›</span></>}
              <span className="text-white font-medium truncate">{activeLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => nav("shift-handover", "Shift Handover")}
              className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium text-white hover:opacity-80"
              style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
              <span>Morning</span><span style={{ color: SUBTLE }}>07:00–15:00</span>
            </button>
            <LiveClock />
            {/* Sync status — toggleable offline simulation */}
            <button
              onClick={() => {
                setOffline(p => !p);
                add({ type: offline ? "success" : "warning", title: offline ? "Back online — syncing…" : "Simulating offline mode", body: offline ? "5 pending items pushed" : "Changes will queue until reconnected" });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80"
              style={{ backgroundColor: offline ? "rgba(107,114,128,0.2)" : "rgba(34,197,94,0.12)", border: "1px solid rgba(255,255,255,0.1)" }}
              title={offline ? "Click to go online" : "Click to simulate offline"}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: offline ? "#6B7280" : "#22C55E", boxShadow: offline ? "none" : "0 0 6px #22C55E" }} />
              {offline ? "Offline" : "Synced"}
            </button>
            {/* 6.10 Lock Command Queue Monitor -- only rendered when there's
                a real pending item, not a decorative fixed count. */}
            {lockQueue.length > 0 && (
              <div className="relative hidden lg:block">
                <button onClick={() => setLockQueueOpen(p => !p)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-white hover:opacity-80"
                  style={{ backgroundColor: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
                  <Lock size={12} style={{ color: "#8B5CF6" }} /><span className="hidden xl:inline">{lockQueue.length} queued</span>
                </button>
                {lockQueueOpen && (
                  <div className="absolute right-0 top-full mt-1 w-80 rounded-xl shadow-2xl z-50 border overflow-hidden" style={{ backgroundColor: "white", borderColor: BORDER }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm font-semibold" style={{ color: TEXT }}>🔒 Lock Command Queue</span></div>
                    <div className="max-h-64 overflow-y-auto">
                      {lockQueue.map(item => (
                        <div key={item.id} className="px-4 py-2.5 border-b text-xs" style={{ borderColor: "#F8FAFC" }}>
                          <div className="font-medium" style={{ color: TEXT }}>{item.commandType.replace("_", " ")} — Room {item.room}</div>
                          <div style={{ color: MUTED }}>Queued: {new Date(item.createdAt).toLocaleTimeString()} · Expires: {new Date(item.expiresAt).toLocaleString()}</div>
                          {item.lastRetryAt && <div style={{ color: WARNING }}>Last attempt: {new Date(item.lastRetryAt).toLocaleTimeString()} — {item.errorLog ?? "failed"}</div>}
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 text-xs" style={{ color: SUBTLE }}>Retrying every 2 min…</div>
                    <button onClick={retryQueueNow} disabled={retryingQueue} className="w-full text-center py-2.5 text-xs font-semibold border-t disabled:opacity-50" style={{ color: PRIMARY, borderColor: "#F1F5F9" }}>{retryingQueue ? "Retrying…" : "Retry Now"}</button>
                  </div>
                )}
              </div>
            )}
            {/* Auth demo triggers — Nexura_Auth §6.3 and §7.1 */}
            <div className="relative hidden xl:block group">
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors" title="Demo: Auth Events (Nexura_Auth §6.3 / §7.1)">
                <Shield size={12} /><span>Auth Demo</span>
              </button>
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-2xl border overflow-hidden z-50 hidden group-hover:block" style={{ backgroundColor: "white", borderColor: "#E2E8F0" }}>
                <div className="px-3 py-2 border-b text-xs font-semibold" style={{ color: "#64748B", borderColor: "#F1F5F9" }}>Auth Event Demos</div>
                <button onClick={() => setShowSessionExpired(true)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#F5F7FA] text-left" style={{ color: "#0D1B2E" }}>
                  <Clock size={12} style={{ color: "#D97706" }} />Session Expired (§7.1)
                </button>
                <button onClick={() => setShowPermsChanged(true)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#F5F7FA] text-left" style={{ color: "#0D1B2E" }}>
                  <Shield size={12} style={{ color: "#4F46E5" }} />Permissions Changed (§6.3)
                </button>
              </div>
            </div>
            <div className="relative hidden md:block">
              <button onClick={() => { setBranchMenuOpen(p => !p); setUserMenuOpen(false); setNotifOpen(false); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                <Globe size={13} /><span>Abuja</span><ChevronDown size={11} color={SUBTLE} />
              </button>
              {branchMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-2xl z-50 border overflow-hidden" style={{ backgroundColor: "white", borderColor: BORDER }}>
                  {BRANCHES.map(b => (
                    <button key={b.id} onClick={() => { setBranchMenuOpen(false); add({ type: "info", title: `Switched to ${b.name}` }); }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: TEXT }}>
                      <span>{b.name}</span>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.status === "synced" ? SUCCESS : WARNING }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => { setNotifOpen(p => !p); setUserMenuOpen(false); setBranchMenuOpen(false); }}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              <Bell size={18} color="white" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white font-bold" style={{ fontSize: 9 }}>{unread}</span>
              )}
            </button>
            <select value={role} onChange={e => setRole(e.target.value as Role)}
              className="hidden xl:block text-xs px-2 py-1.5 rounded-lg border text-[#0F172A] outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.9)", borderColor: "rgba(255,255,255,0.2)" }}
              title="Switch role (demo)">
              {(["MGT", "ORG", "FD", "HK", "MX", "FIN", "RT", "RSV", "IT"] as Role[]).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="relative">
              <button onClick={() => { setUserMenuOpen(p => !p); setNotifOpen(false); setBranchMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: TEAL }}>{(loggedUser.firstName[0] ?? "") + (loggedUser.lastName[0] ?? "")}</div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-medium text-white leading-none">{loggedUser.firstName} {loggedUser.lastName}</div>
                  <div className="text-xs mt-0.5 uppercase tracking-wider" style={{ color: SUBTLE, fontSize: 9 }}>{role}</div>
                </div>
                <ChevronDown size={11} color={SUBTLE} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-2xl z-50 border overflow-hidden" style={{ backgroundColor: "white", borderColor: BORDER }}>
                  <div className="px-3 py-2.5 border-b" style={{ borderColor: "#F1F5F9" }}>
                    <div className="text-xs font-semibold" style={{ color: TEXT }}>{loggedUser.firstName} {loggedUser.lastName}</div>
                    <div className="text-xs mt-0.5" style={{ color: MUTED }}>{loggedUser.email} · {role}</div>
                  </div>
                  {[
                    { icon: User, label: "My Profile", fn: () => { setUserMenuOpen(false); nav("my-preferences", "My Preferences"); } },
                    { icon: KeyRound, label: "Change Password", fn: () => { setUserMenuOpen(false); add({ type: "info", title: "Change Password", body: "Go to My Preferences → Security" }); } },
                    { icon: Layers, label: "Switch Role (Demo)", fn: () => setUserMenuOpen(false) },
                    { icon: LogOut, label: "Sign Out", fn: () => { setUserMenuOpen(false); onLogout(); }, danger: true },
                  ].map(({ icon: Icon, label, fn, danger }) => (
                    <button key={label} onClick={fn}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[#F5F7FA]"
                      style={{ color: danger ? ERROR : TEXT }}>
                      <Icon size={14} style={{ color: danger ? ERROR : MUTED }} />{label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "none" }}>
          <div className="max-w-screen-2xl mx-auto">
            {offline && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl mb-5 text-sm font-medium"
                style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                <WifiOff size={15} />
                <span>You're offline — showing last synced data. Changes will sync automatically when reconnected.</span>
                <button onClick={() => { setOffline(false); add({ type: "success", title: "Back online — syncing…" }); }}
                  className="ml-auto text-xs px-2.5 py-1 rounded-lg font-medium hover:opacity-80"
                  style={{ backgroundColor: "#F59E0B", color: "white" }}>
                  Go Online
                </button>
              </div>
            )}
            <Routes>
              <Route path="/reservations/grid" element={<ReservationGrid add={add} />} />
              <Route path="/reservations/new" element={<NewReservation add={add} />} />
              <Route path="/front-desk/check-in" element={<CheckInWizard add={add} />} />
              <Route path="/front-desk/folio" element={<FolioScreen add={add} />} />
              <Route path="/front-desk/folio/:reservationId" element={<FolioScreen add={add} />} />
              <Route path="/front-desk/check-out" element={<CheckOut add={add} />} />
              <Route path="/front-desk/check-out/:reservationId" element={<CheckOut add={add} />} />
              <Route path="/maintenance/work-orders" element={<WorkOrders add={add} />} />
              <Route path="/maintenance/work-orders/:id" element={<WorkOrderDetail add={add} />} />
              <Route path="/finance/folios" element={<FinanceFolioManagement add={add} />} />
              <Route path="/restaurant/pos" element={<POSTerminal add={add} />} />
              <Route path="/restaurant/tables" element={<TableManagement add={add} />} />
              <Route path="/restaurant/kitchen" element={<KitchenDisplay />} />
              <Route path="/restaurant/menu" element={<MenuManagement add={add} />} />
              <Route path="/restaurant/room-charges" element={<GuestRoomCharges />} />
              <Route path="/hr/staff/:id" element={<StaffProfileDetail add={add} />} />
              <Route path="*" element={<Router screen={screen} add={add} role={role} nav={nav} />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* ── Notification panel ───────────────────────────────────────────── */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-30" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setNotifOpen(false)} />
          <div className="fixed right-0 top-0 h-full z-40 flex flex-col shadow-2xl" style={{ width: 400, backgroundColor: "white", borderLeft: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
              <h2 className="text-base font-semibold" style={{ color: TEXT }}>Notifications</h2>
              <div className="flex items-center gap-2">
                <button className="text-xs font-medium hover:underline" style={{ color: TEAL }}>Mark all read</button>
                <button onClick={() => setNotifOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><X size={15} /></button>
              </div>
            </div>
            <div className="flex border-b" style={{ borderColor: "#F1F5F9" }}>
              {["All", "Urgent", "Operational", "System", "Door Lock"].map(tab => (
                <button key={tab} onClick={() => setNotifFilter(tab)} className="flex-1 text-xs font-medium py-2.5"
                  style={{ color: notifFilter === tab ? PRIMARY : MUTED, borderBottom: notifFilter === tab ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              {filteredN.length === 0 && <EmptyState icon={Bell} message="No notifications in this category." />}
              {filteredN.map(n => {
                const NIcon = n.icon;
                return (
                  <div key={n.id} className="flex gap-3 px-5 py-4 border-b hover:bg-[#FAFBFD] cursor-pointer group"
                    style={{ borderLeft: `4px solid ${n.color}`, minHeight: 72, borderColor: "#F8FAFC" }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${n.color}18` }}>
                      <NIcon size={16} style={{ color: n.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: TEXT }}>{n.title}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {n.unread && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#3B82F6" }} />}
                          <button className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center" style={{ color: SUBTLE }}><X size={12} /></button>
                        </div>
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: MUTED }}>{n.body}</p>
                      <span className="text-xs mt-1 inline-block" style={{ color: SUBTLE }}>{n.time} ago</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "#F1F5F9" }}>
              <button className="w-full py-2 text-sm font-medium rounded-lg hover:bg-[#ECFDF5]" style={{ color: TEAL }}>View all notifications</button>
            </div>
          </div>
        </>
      )}

      <ToastC toasts={toasts} dismiss={dismiss} />

      {/* Nexura_Auth §7.1 — Session Expired */}
      {showSessionExpired && (
        <SessionExpiredModal
          offline={offline}
          onStay={() => { setShowSessionExpired(false); add({ type: "success", title: "Session extended", body: "Token refreshed — 12 hours remaining" }); }}
          onSignOut={() => { setShowSessionExpired(false); onLogout(); }}
        />
      )}

      {/* Nexura_Auth §6.3 — Permissions Changed */}
      {showPermsChanged && (
        <PermissionsChangedDialog onReLogin={() => { setShowPermsChanged(false); onLogout(); }} />
      )}
    </div>
  );
}
