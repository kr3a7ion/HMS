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

// RP-03. Real per-department aggregation, backed by GET /reports/department
// -- the server infers the caller's own department from their role; MGT/ORG
// may switch between departments or view the branch-wide summary. Metrics
// the current schema can't produce yet (FD avg processing time / walk-in
// rate; HK rooms-cleaned-per-attendant / avg turnaround; RT kitchen ticket
// time) are omitted rather than faked -- see ROADMAP.md.
const DEPT_METRIC_LABELS: Record<string, Array<[string, string, (v: any) => string]>> = {
  FD: [["checkIns", "Check-ins (period)", v => String(v)], ["checkOuts", "Check-outs (period)", v => String(v)]],
  HK: [["inspectionsLogged", "Inspections Logged", v => String(v)], ["inspectionPassRate", "Inspection Pass Rate", v => v == null ? "—" : `${v}%`], ["roomsCurrentlyClean", "Rooms Currently Clean", v => String(v)], ["dndFlagged", "DND Flagged", v => String(v)]],
  MX: [["created", "Orders Created", v => String(v)], ["closed", "Orders Closed", v => String(v)], ["avgResolutionHours", "Avg Resolution", v => v == null ? "—" : `${v}h`], ["overdueRate", "Overdue Rate", v => `${v}%`]],
  RT: [["ordersClosed", "Orders Closed", v => String(v)], ["avgCheckSize", "Avg Check Size", v => `₦${v.toLocaleString()}`]],
  ALL: [["revenue", "Revenue (period)", v => `₦${v.toLocaleString()}`], ["occupancyNow", "Occupancy Now", v => `${v}%`], ["activeGuests", "Active Guests", v => String(v)], ["openWorkOrders", "Open Work Orders", v => String(v)]],
};

export function DepartmentReports({ role }: { role: Role }) {
  const isManager = role === "MGT" || role === "ORG";
  const [dept, setDept] = useState(isManager ? "" : role);
  const [data, setData] = useState<DepartmentReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsApi.department(dept || undefined).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [dept]);

  const labels = data ? (DEPT_METRIC_LABELS[data.department] ?? []) : [];

  const exportCsv = () => {
    if (!data) return;
    const header = "Metric,Value";
    const rows = labels.map(([key, label, fmt]) => [label, fmt(data.metrics[key])].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `department-report-${data.department}-${data.start}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Department Reports" sub={data ? `${data.department === "ALL" ? "Branch-wide" : data.department} · ${new Date(data.start).toLocaleDateString()} – ${new Date(data.end).toLocaleDateString()}` : "Loading…"}
        actions={<div className="flex items-center gap-2">{isManager && <Sel options={["All", "FD", "HK", "MX", "RT"]} value={dept || "All"} onChange={v => setDept(v === "All" ? "" : v)} />}<BtnO label="Export" icon={Download} onClick={exportCsv} /></div>} />
      {loading || !data ? <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : (
        <div className="grid grid-cols-4 gap-4 mb-5">
          {labels.length === 0 ? <div className="col-span-4"><EmptyState icon={BarChart3} message="No report configured for this department yet." /></div> : labels.map(([key, label, fmt]) => (
            <div key={key} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{fmt(data.metrics[key])}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{label}</div></div>
          ))}
          {data.department === "RT" && data.metrics.popularItems?.length > 0 && (
            <div className="col-span-4 bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Popular Items</h3>
              <div className="space-y-2">{data.metrics.popularItems.map((i: { name: string; quantity: number }) => <div key={i.name} className="flex justify-between text-sm"><span style={{ color: TEXT }}>{i.name}</span><span className="font-semibold" style={{ color: MUTED }}>{i.quantity} sold</span></div>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
