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
  type EnrichedReservation,
} from "../../lib/api";
import {
  type Role, type Toast, type ToastType, type AddToast, fmtN, uid,
  mono, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  hkC, woC, priC, tblC, stC, roomStC, resStC,
  ROOMS, RES_GRID, IN_HOUSE, WORK_ORDERS,
  HK_ROOMS, FOLIO_CHARGES, MENU_ITEMS, MENU_CATS, TABLE_LAYOUT, STOCK, CHAT_MSGS,
  ARRIVALS_DATA, ACCESS_CREDS, KEY_LOG, ACTIVE_PINS, LOST_FOUND, DND_ROOMS,
  INVOICES_DATA, AP_DATA, DEPT_PERMS, KDS_ORDERS,
  ASSETS, SUPPLIERS_DATA, PRODUCTS_DATA, STOCK_TXN, PO_DATA,
  HK_TASK_ROOMS, RATE_PLANS, WAITLIST_DATA, ROOM_SERVICE_ORDERS,
  DINING_RES, ANNOUNCE_DATA,
} from "../../data";
import {
  Badge, EmptyState, ToastC, LiveClock, SyncPill, StatCard, PageHeader, BtnP, BtnO, Inp, Sel, PlaceholderScreen,
} from "../../Screens";
import { AsyncBoundary } from "../../components/AsyncBoundary";

/** Initials for the avatar chip. */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function nightsBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

/**
 * The dropdown shows operational language; the server stores snake_case.
 * Keeping the mapping in one place stops "Checked In" being sent as-is and
 * silently matching nothing.
 */
const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "All Status", value: "" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Pending", value: "pending" },
  { label: "Checked In", value: "checked_in" },
  { label: "Checked Out", value: "checked_out" },
  { label: "No Show", value: "no_show" },
  { label: "Cancelled", value: "cancelled" },
];

/** Server status -> the badge palette, which is keyed by display label. */
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed", pending: "Pending", checked_in: "Checked In",
  checked_out: "Checked Out", no_show: "No Show", cancelled: "Cancelled",
};

// R-04 Reservation Search — wired to GET /reservations/search (B10).
//
// The status dropdown and both date inputs were decorative: neither carried
// state nor reached anything, and the search itself filtered a mock array in
// the browser. "New Reservation" had no handler. The server has supported
// q / status / from / to / roomNumber all along.
//
// FILTERS LIVE IN THE URL (`useSearchParams`), not component state. A search
// a clerk wants to return to, share with a colleague, or reload after a
// mis-click is a search that has to survive navigation — which is the whole
// reason the Phase 3 nav rebuild moved filters out of local state.
export function ReservationSearch({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const [rows, setRows] = useState<EnrichedReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reservationsApi.search({
      q: q || undefined,
      status: status || undefined,
      from: from || undefined,
      to: to || undefined,
    })
      .then(page => setRows(page.items))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [q, status, from, to]);

  // Debounced so typing a guest name is one request per pause, not per
  // keystroke. The server is on the LAN and would survive the keystrokes,
  // but the results flickering under the cursor is what makes it feel broken.
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div>
      <PageHeader title="Reservation Search" sub="Search all reservations by guest, ID, room, date, or status"
        actions={<BtnP label="New Reservation" icon={Plus} onClick={() => navigate("/reservations/new")} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 p-4 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
          <div className="lg:col-span-2 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={q} onChange={e => setParam("q", e.target.value)} placeholder="Guest name, reservation ID, or room…" className="pl-9 pr-4 py-2.5 w-full border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          <select value={status} onChange={e => setParam("status", e.target.value)}
            className="px-3 py-2.5 border rounded-lg text-sm outline-none bg-white" style={{ borderColor: BORDER, color: TEXT }}>
            {STATUS_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setParam("from", e.target.value)} title="Check-in from"
            className="px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} />
          <input type="date" value={to} onChange={e => setParam("to", e.target.value)} title="Check-in to"
            className="px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} />
        </div>
        <div className="p-1">
          <AsyncBoundary loading={loading} error={error} onRetry={load} skeletonRows={6}>
            {rows.length === 0 ? (
              <EmptyState icon={Search} message="No reservations match your search." />
            ) : (
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Reservation ID", "Guest", "Room", "Check-in", "Check-out", "Nights", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>{rows.map(r => {
                  const label = STATUS_LABEL[r.status] ?? r.status;
                  return (
                    <tr key={r.id} onClick={() => navigate(`/reservations/${r.id}`)} className="border-t hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{r.id}</td>
                      <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{initials(r.guestName)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{r.guestName ?? "—"}</span></div></td>
                      <td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>{r.roomNumber ? `Room ${r.roomNumber}` : (r.roomTypeName ?? "Unassigned")}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkInDate.slice(0, 10)}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkOutDate.slice(0, 10)}</td>
                      <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{nightsBetween(r.checkInDate, r.checkOutDate)}n</td>
                      <td className="px-5 py-3"><Badge label={label} colors={resStC[label] ?? { bg: "#F1F5F9", text: "#374151" }} /></td>
                      <td className="px-5 py-3" onClick={e => e.stopPropagation()}><div className="flex gap-1"><button onClick={() => navigate(`/reservations/${r.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button>{(r.status === "confirmed" || r.status === "pending") && <button onClick={() => navigate("/front-desk/check-in")} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Check In</button>}</div></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
          </AsyncBoundary>
        </div>
      </div>
    </div>
  );
}
