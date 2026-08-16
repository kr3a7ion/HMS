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
import { formatNaira } from "../../lib/money";

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
// D-02. Real aggregation via GET /dashboard/overview, reusing the same
// tables Reports/Inventory/HR already made real -- see
// server/src/routes/dashboard.ts. Trend deltas use plain-language framing
// ("+4% vs yesterday") per the Smart-Order-adopted dashboard-copy item.
//
// This restores the original Figma layout (Room Status panel, Recent
// Activity as a table, header actions) after a prior pass silently
// dropped/restyled them while wiring in real data -- see ROADMAP.md.
// Export PDF and New Reservation were purely decorative in the original
// mock (no onClick at all); both are now real.

const ROOM_STATUS_COLORS: Record<string, string> = {
  Occupied: ORANGE, Available: SUCCESS, Cleaning: WARNING, Reserved: TEAL, Maintenance: ERROR, "Out of Service": "#6B7280",
};
const ACTIVITY_ICON: Record<ActivityEvent["type"], React.ElementType> = { charge: DollarSign, maintenance: Wrench, restaurant: UtensilsCrossed };
const ACTIVITY_COLOR: Record<ActivityEvent["type"], { bg: string; text: string }> = {
  charge: { bg: "#ECFDF5", text: TEAL }, maintenance: { bg: "#FFF7ED", text: "#F97316" }, restaurant: { bg: "#EFF6FF", text: PRIMARY },
};

export function DashboardMgmt({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [data, setData] = useState<ManagementOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.overview().then(setData).catch(() => add({ type: "error", title: "Couldn't load the dashboard" })).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const occToday = data.occupancyTrend[data.occupancyTrend.length - 1]?.occupancy ?? 0;
  const occYesterday = data.occupancyTrend[data.occupancyTrend.length - 2]?.occupancy ?? 0;
  const revToday = data.revenueTrend[data.revenueTrend.length - 1]?.revenueKobo ?? 0;
  const revYesterday = data.revenueTrend[data.revenueTrend.length - 2]?.revenueKobo ?? 0;
  const occDelta = pctDelta(occToday, occYesterday);
  const revDelta = pctDelta(revToday, revYesterday);
  const PIE_COLORS = [PRIMARY, TEAL, ORANGE, "#8B5CF6", SUBTLE];
  const statusColor: Record<string, string> = { success: SUCCESS, warning: WARNING, error: ERROR };
  const statusBg: Record<string, string> = { success: "#F0FDF4", warning: "#FFFBEB", error: "#FEF2F2" };
  const kpiIcon: Record<string, React.ElementType> = { Housekeeping: BedDouble, Maintenance: Wrench, Restaurant: UtensilsCrossed };
  // Paths, not screen ids. The old version mapped to ids and then looked
  // them up in a second table that only covered two of the three, so the
  // Housekeeping tile silently navigated to "/" instead of the board.
  const kpiTarget: Record<string, string> = {
    Housekeeping: "/housekeeping/board",
    Maintenance: "/maintenance/work-orders",
    Restaurant: "/restaurant/pos",
  };

  return (
    <div>
      <PageHeader title="Management Overview" sub={new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        actions={<><BtnO label="Export PDF" icon={Download} onClick={() => window.print()} /><BtnP label="New Reservation" icon={Plus} onClick={() => navigate("/reservations/new")} /></>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Occupancy Rate" value={`${data.occupancyRate}%`} sub={`${data.inHouseCount} rooms occupied`} delta={occDelta?.text} deltaPositive={occDelta?.positive} icon={Building2} accent={PRIMARY} />
        <StatCard label="Revenue Today" value={fmtN(data.revenueTodayKobo)} sub={`RevPAR ₦${data.revparKobo.toLocaleString()}`} delta={revDelta?.text} deltaPositive={revDelta?.positive} icon={DollarSign} accent={TEAL} />
        <StatCard label="Active Guests" value={String(data.inHouseCount)} sub={`${data.arrivalsToday} arrivals · ${data.departuresToday} departures today`} icon={Users} accent={ORANGE} />
        <StatCard label="Open Issues" value={String(data.departmentKpis.find(k => k.metric === "Open Work Orders")?.value ?? 0)} sub="Open work orders" icon={AlertTriangle} accent={ERROR} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Occupancy & Revenue — Last 7 Days</h3><p className="text-xs mt-0.5" style={{ color: SUBTLE }}>Daily trend</p></div>
            <div className="flex gap-4 text-xs" style={{ color: MUTED }}>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: PRIMARY }} />Occupancy %</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: TEAL }} />Revenue ₦</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.occupancyTrend.map((t, i) => ({ day: new Date(t.date).toLocaleDateString(undefined, { weekday: "short" }), occ: t.occupancy, rev: data.revenueTrend[i]?.revenueKobo ?? 0 }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any, n: any) => [n === "rev" ? `₦${v.toLocaleString()}` : `${v}%`, n === "rev" ? "Revenue" : "Occupancy"]} />
              <Area key="area-occ" type="monotone" dataKey="occ" name="Occupancy" stroke={PRIMARY} strokeWidth={2} fill={PRIMARY + "20"} dot={false} />
              <Area key="area-rev" type="monotone" dataKey="rev" name="Revenue" stroke={TEAL} strokeWidth={2} fill={TEAL + "20"} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Revenue Breakdown</h3>
          <p className="text-xs mb-3" style={{ color: SUBTLE }}>By category today</p>
          {data.revenueByCategory.length === 0 ? <EmptyState icon={DollarSign} message="No revenue posted yet today." /> : (
            <>
              <ResponsiveContainer width="100%" height={140}><PieChart><Pie key="dash-pie" data={data.revenueByCategory} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="amount" nameKey="category" stroke="none">{data.revenueByCategory.map((_, i) => <Cell key={`dash-cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => [`₦${v.toLocaleString()}`]} contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer>
              <div className="space-y-2 mt-2">{data.revenueByCategory.map((c, i) => <div key={c.category} className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="text-xs" style={{ color: MUTED }}>{c.category}</span></div><span className="text-xs font-semibold" style={{ color: TEXT }}>{formatNaira(c.amountKobo)}</span></div>)}</div>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Room Status</h3>
          {data.roomStatus.length === 0 ? <EmptyState icon={BedDouble} message="No rooms configured yet." /> : (
            <div className="space-y-2.5">{data.roomStatus.map(r => {
              const pct = data.roomsTotal > 0 ? Math.round((r.count / data.roomsTotal) * 100) : 0;
              const color = ROOM_STATUS_COLORS[r.status] ?? SUBTLE;
              return <div key={r.status} className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} /><span className="text-sm flex-1" style={{ color: MUTED }}>{r.status}</span><div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} /></div><span className="text-sm font-semibold w-6 text-right" style={{ color: TEXT }}>{r.count}</span></div>;
            })}</div>
          )}
          <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: "#F1F5F9" }}><span className="text-xs" style={{ color: MUTED }}>Total rooms</span><span className="text-sm font-bold" style={{ color: TEXT }}>{data.roomsTotal}</span></div>
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <div className="col-span-2"><h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Department KPIs</h3></div>
          {data.departmentKpis.map((k, i) => {
            const sc = statusColor[k.status]; const sb = statusBg[k.status]; const Icon = kpiIcon[k.department] ?? Activity; const target = kpiTarget[k.department];
            const onClick = () => { if (target) navigate(target); };
            return <div key={`${k.department}-${k.metric}-${i}`} onClick={onClick} className="bg-white rounded-xl p-4 border flex items-start gap-3 cursor-pointer hover:shadow-sm transition-shadow" style={{ borderColor: BORDER }}><div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: sb }}><Icon size={18} style={{ color: sc }} /></div><div><div className="text-xs font-medium" style={{ color: MUTED }}>{k.department}</div><div className="text-sm font-semibold" style={{ color: TEXT }}>{k.metric}</div><div className="text-lg font-bold" style={{ color: sc }}>{k.value}</div></div></div>;
          })}
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
          <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Recent Activity</h3>
          <BtnO label="View All" onClick={() => navigate("/front-desk/in-house")} />
        </div>
        {data.recentActivity.length === 0 ? <EmptyState icon={ClipboardList} message="No activity in the last 48 hours." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Ref ID", "Guest / Actor", "Room", "Action", "Time"].map(h => <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{data.recentActivity.map((e, i) => { const c = ACTIVITY_COLOR[e.type]; const Icon = ACTIVITY_ICON[e.type];
              return <tr key={`${e.refId}-${i}`} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>#{e.refId.slice(0, 8)}</td>
                <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: c.text }}>{e.actor.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{e.actor}</span></div></td>
                <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{e.room ?? "—"}</td>
                <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text }}><Icon size={11} />{e.label}</span></td>
                <td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{new Date(e.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
              </tr>; })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
