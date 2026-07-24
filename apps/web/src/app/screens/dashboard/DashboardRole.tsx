// Extracted from the former Screens.tsx monolith per Guidelines §2.
import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard, CalendarDays, KeyRound, BedDouble, Wrench,
  UtensilsCrossed, MessageSquare, DollarSign, Package, Users,
  Building2, BarChart3, Settings, ChevronLeft, ChevronRight,
  Bell, LogOut, User, ChevronDown, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, WifiOff, Plus, Search, Filter,
  MoreHorizontal, ArrowRight, Home, Layers, X, Lock, Globe,
  ClipboardList, CalendarCheck, Star, AlertCircle, Clock,
  RefreshCw, Hash, FileText, CreditCard, Truck, Phone,
  Edit3, Eye, Trash2, Download, Send, Menu as MenuIcon,
  HelpCircle, Shield, Server, Cpu, Activity, Wifi,
  MinusCircle, PlusCircle, ShoppingCart, MapPin, Mail,
  UserCheck, BookOpen, Inbox, Zap,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  roomsApi, guestsApi, reservationsApi, housekeepingApi, usersApi, lostFoundApi, authApi, maintenanceApi, financeApi, restaurantApi,
  type Room as ApiRoom, type Guest as ApiGuest,
  type ReservationListItem, type ReservationDetail,
  type HkRoom, type StaffUser, type Inspection, type LostFoundItem,
  type WorkOrderListItem, type WorkOrderDetail as ApiWorkOrderDetail, type WorkOrderStatus,
  type FinanceFolio, type DailySummary as ApiDailySummary,
  type MenuCategory, type RestaurantTable, type RestaurantOrder, type RoomCharge,
  chatApi, announcementsApi, shiftHandoverApi, inventoryApi, hrApi, reportsApi,
  type ChatChannel, type ChatMessage, type Announcement, type ShiftHandoverListItem, type ShiftHandoverDetail,
  type AuthUser, type Product, type StockTransaction, type InventoryDashboard, type Supplier,
  type PurchaseOrderListItem, type PurchaseOrderDetail,
  type StaffMember, type StaffDetail, type AttendanceData, type ShiftData, type PayrollData,
  type OccupancyReport, type RevenueReport, type DepartmentReport, type GuestAnalyticsReport,
  type InventoryReport, type StaffReport,
  adminApi, type AdminUser, type SystemHealth as SystemHealthData, type DiagnosticsResult,
  type ErrorLogEntry, type AdminDevice, type BackupSnapshot, type AuditLogEntry,
  settingsApi, type BranchSettings, type UserPreferences, type ModuleKey,
  dashboardApi, type RoleDashboard, type ManagementOverview, type DashboardStat, type ActivityEvent,
  syncApi, type SyncStatus, type CachedBranch,
} from "../../lib/api";
import {
  type Role, type Toast, type ToastType, type AddToast, fmtN, uid,
  mono, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  hkC, woC, priC, tblC, stC, roomStC, resStC,
  ROOMS, RES_GRID, IN_HOUSE, WORK_ORDERS,
  HK_ROOMS, FOLIO_CHARGES, MENU_ITEMS, MENU_CATS, TABLE_LAYOUT, STOCK, CHAT_MSGS,
  ALL_RES, ARRIVALS_DATA, ACCESS_CREDS, KEY_LOG, ACTIVE_PINS, LOST_FOUND, DND_ROOMS,
  INVOICES_DATA, AP_DATA, DEPT_PERMS, KDS_ORDERS,
  ASSETS, SUPPLIERS_DATA, PRODUCTS_DATA, STOCK_TXN, PO_DATA,
  HK_TASK_ROOMS, RATE_PLANS, WAITLIST_DATA, ROOM_SERVICE_ORDERS,
  DINING_RES, ANNOUNCE_DATA,
} from "../../data";
import {
  Badge, EmptyState, ToastC, LiveClock, SyncPill, StatCard, PageHeader, BtnP, BtnO, Inp, Sel, PlaceholderScreen,
} from "../../Screens";

function fmtStat(s: DashboardStat): string {
  if (s.isCurrency) return fmtN(Number(s.value));
  if (s.isPercent) return `${s.value}%`;
  return String(s.value);
}
function pctDelta(today: number, yesterday: number): { text: string; positive: boolean } | null {
  if (yesterday === 0) return null;
  const diff = Math.round(((today - yesterday) / yesterday) * 1000) / 10;
  return { text: `${diff >= 0 ? "+" : ""}${diff}% vs yesterday`, positive: diff >= 0 };
}
const ACTIVITY_ICON: Record<ActivityEvent["type"], React.ElementType> = { charge: DollarSign, maintenance: Wrench, restaurant: UtensilsCrossed };
function ActivityFeed({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) return <EmptyState icon={ClipboardList} message="No activity in the last 48 hours." />;
  return <div>{events.map((e, i) => { const Icon = ACTIVITY_ICON[e.type]; return (
    <div key={i} className="flex items-center gap-3 px-5 py-3 border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#EFF6FF" }}><Icon size={14} style={{ color: PRIMARY }} /></div>
      <div className="flex-1"><div className="text-sm font-medium" style={{ color: TEXT }}>{e.label}</div><div className="text-xs" style={{ color: MUTED }}>{e.detail}</div></div>
      <div className="text-xs flex-shrink-0" style={{ color: SUBTLE, fontFamily: mono }}>{new Date(e.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  ); })}</div>;
}

// D-02. Real aggregation via GET /dashboard/overview, reusing the same
// tables Reports/Inventory/HR already made real -- see
// server/src/routes/dashboard.ts. Trend deltas use plain-language framing
// ("+4% vs yesterday") per the Smart-Order-adopted dashboard-copy item.

// D-01. Real per-role stats via GET /dashboard/me -- the server derives
// role-appropriate metrics server-side (see dashboard.ts), the frontend
// just maps labels to icons/accents for display.
const ROLE_TITLES: Record<string, string> = { FD: "Front Desk Dashboard", HK: "Housekeeping Dashboard", MX: "Maintenance Dashboard", FIN: "Finance Dashboard", RT: "Restaurant Dashboard", MGT: "Management Dashboard", ORG: "Owner Dashboard" };

const STAT_ICON: Record<string, { icon: React.ElementType; accent: string }> = {
  "Rooms Available": { icon: BedDouble, accent: SUCCESS }, "Check-ins Today": { icon: KeyRound, accent: PRIMARY }, "Check-outs Today": { icon: ArrowRight, accent: ORANGE }, "Outstanding Balance": { icon: DollarSign, accent: ERROR },
  "Rooms to Clean": { icon: BedDouble, accent: ERROR }, "In Progress": { icon: Activity, accent: ORANGE }, "Completed Today": { icon: CheckCircle2, accent: SUCCESS }, "Inspections Pending": { icon: ClipboardList, accent: WARNING },
  "Open Work Orders": { icon: Wrench, accent: ERROR }, "Overdue": { icon: AlertTriangle, accent: ERROR }, "Reported Today": { icon: ClipboardList, accent: ORANGE },
  "Revenue Today": { icon: DollarSign, accent: SUCCESS }, "Payments Received": { icon: CreditCard, accent: TEAL }, "Discounts Applied": { icon: Activity, accent: MUTED },
  "Tables Occupied": { icon: UtensilsCrossed, accent: ORANGE }, "Orders in Queue": { icon: ClipboardList, accent: ERROR }, "Room Service Pending": { icon: Truck, accent: WARNING }, "Today's Revenue": { icon: DollarSign, accent: SUCCESS },
  "Occupancy Rate": { icon: Building2, accent: PRIMARY }, "Active Guests": { icon: Users, accent: ORANGE }, "Open Issues": { icon: AlertTriangle, accent: ERROR },
};

// Department options for MGT/ORG's "Switch View" -- server-enforced (see
// GET /dashboard/me's ?role= handling in server/src/routes/dashboard.ts):
// only actually honored when the caller's real role is MGT or ORG, so this
// dropdown is only ever offered to those two, never trusted client-side.
const SWITCHABLE_DEPARTMENTS: Array<{ value: string; label: string }> = [
  { value: "MGT", label: "My Dashboard" }, { value: "FD", label: "Front Desk" }, { value: "HK", label: "Housekeeping" },
  { value: "MX", label: "Maintenance" }, { value: "FIN", label: "Finance" }, { value: "RT", label: "Restaurant" },
];

export function DashboardRole({ role, nav }: { role: Role; nav?: (s: string, label: string) => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<RoleDashboard | null>(null);
  const [arrivals, setArrivals] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewAs, setViewAs] = useState<string | null>(null);
  const canSwitch = role === "MGT" || role === "ORG";

  useEffect(() => {
    Promise.all([dashboardApi.me(canSwitch && viewAs ? viewAs : undefined), reservationsApi.list()])
      .then(([d, res]) => { setData(d); setArrivals(res.filter(r => r.status === "confirmed").slice(0, 4)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [role, viewAs]);

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title={ROLE_TITLES[data.role] ?? "Dashboard"} sub={new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        actions={canSwitch ? (
          <select value={viewAs ?? "MGT"} onChange={e => setViewAs(e.target.value)}
            className="text-xs px-3 py-2.5 rounded-xl border outline-none" style={{ borderColor: BORDER, color: TEXT }}>
            {SWITCHABLE_DEPARTMENTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        ) : undefined} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">{data.stats.map(s => { const meta = STAT_ICON[s.label] ?? { icon: Activity, accent: PRIMARY }; return <StatCard key={s.label} label={s.label} value={fmtStat(s)} sub={s.sub} icon={meta.icon} accent={meta.accent} />; })}</div>
      <div className="bg-white rounded-xl border overflow-hidden mb-6" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Today's Arrivals</h3><BtnO label="Arrivals List" onClick={() => navigate("/reservations/grid")} /></div>
        {arrivals.length === 0 ? <EmptyState icon={KeyRound} message="No confirmed arrivals waiting today." /> : arrivals.map(g => <div key={g.id} className="flex items-center gap-4 px-5 py-3 border-b" style={{ borderColor: "#F8FAFC" }}><div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{(g.guestFirstName?.[0] ?? "") + (g.guestLastName?.[0] ?? "")}</div><div className="flex-1"><div className="text-sm font-medium" style={{ color: TEXT }}>{g.guestFirstName} {g.guestLastName}</div><div className="text-xs" style={{ color: MUTED }}>{g.roomNumber ? `Room ${g.roomNumber}` : "No room assigned"} · ₦{g.rate.toLocaleString()}/night</div></div><BtnO label="Check In" onClick={() => navigate("/front-desk/check-in")} /></div>)}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Recent Activity</h3></div>
        <ActivityFeed events={data.recentActivity} />
      </div>
    </div>
  );
}
