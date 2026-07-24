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
  doorLockApi, type KeyCardEvent,
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

// FD-13. Append-only, real: GET /door-lock/events, joined server-side with
// room/guest/staff names. No delete capability, same discipline as
// IT-05 Audit Log.
const EVENT_LABELS: Record<string, string> = {
  issued: "Issued", duplicate_issued: "Duplicate Issued", replacement_issued: "Replacement Issued",
  revoked: "Revoked", emergency_revoked: "Emergency Revoked",
  encode_failed: "Encode Failed", api_failed: "API Failed", sync_failed: "Sync Failed",
  queued_offline: "Queued Offline", sync_success: "Sync Success",
};
const EVENT_COLORS: Record<string, { bg: string; text: string }> = {
  issued: { bg: "#CCFBF1", text: "#0F766E" }, duplicate_issued: { bg: "#DBEAFE", text: "#1E40AF" }, replacement_issued: { bg: "#DBEAFE", text: "#1E40AF" },
  revoked: { bg: "#F3F4F6", text: "#374151" }, emergency_revoked: { bg: "#FEE2E2", text: "#991B1B" },
  encode_failed: { bg: "#FEE2E2", text: "#991B1B" }, api_failed: { bg: "#FEE2E2", text: "#991B1B" }, sync_failed: { bg: "#FEE2E2", text: "#991B1B" },
  queued_offline: { bg: "#FEF3C7", text: "#92400E" }, sync_success: { bg: "#DCFCE7", text: "#166534" },
};

export function KeyCardLog() {
  const [events, setEvents] = useState<KeyCardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("All Events");
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => {
    doorLockApi.events().then(setEvents).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = events.filter(e =>
    (eventFilter === "All Events" || e.eventType === eventFilter) &&
    (dateFilter === "" || e.performedAt.slice(0, 10) === dateFilter) &&
    (search === "" || e.room.toLowerCase().includes(search.toLowerCase()) || e.guest.toLowerCase().includes(search.toLowerCase()) || e.staff.toLowerCase().includes(search.toLowerCase())));

  const exportCsv = () => {
    const header = "Timestamp,Event Type,Room,Guest,Credential Type,Reference,Staff,Details";
    const rows = filtered.map(e => [new Date(e.performedAt).toISOString(), EVENT_LABELS[e.eventType] ?? e.eventType, e.room, e.guest, e.credentialType, e.credentialReference ?? "", e.staff, (e.details ?? "").replace(/,/g, ";")].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `key-card-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Key Card Log" sub="Append-only audit trail of every access credential event" actions={<><BtnO label="Export CSV" icon={Download} onClick={exportCsv} /><BtnO label="Export PDF" icon={FileText} onClick={() => window.print()} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search room, guest, or staff…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Events", ...Object.keys(EVENT_LABELS)]} value={eventFilter} onChange={setEventFilter} />
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }} />
        </div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : filtered.length === 0 ? <EmptyState icon={ClipboardList} message="No access credential events logged yet." /> : (
          <table className="w-full">
            <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "Event Type", "Room", "Guest", "Credential", "Reference", "Staff", "Details"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(e => <tr key={e.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{new Date(e.performedAt).toLocaleString()}</td><td className="px-4 py-3"><Badge label={EVENT_LABELS[e.eventType] ?? e.eventType} colors={EVENT_COLORS[e.eventType] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-4 py-3 text-sm font-bold" style={{ color: PRIMARY }}>{e.room}</td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{e.guest}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{e.credentialType}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{e.credentialReference ?? "—"}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{e.staff}</td><td className="px-4 py-3 text-xs" style={{ color: SUBTLE }}>{e.details ?? "—"}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
