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
  type ReservationWithBalance,
} from "../../lib/api";
import {
  type Role, type Toast, type ToastType, type AddToast, fmtN, uid,
  mono, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  hkC, woC, priC, tblC, stC, roomStC, resStC,
  ROOMS, RES_GRID, WORK_ORDERS,
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
import { AsyncBoundary } from "../../components/AsyncBoundary";
import { MoneyText } from "../../components/Money";

/** Initials for the avatar chip. */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

/** Whole nights remaining from now to checkout; 0 on the day of departure. */
function nightsLeft(checkOutDate: string): number {
  const out = new Date(checkOutDate).getTime();
  return Math.max(0, Math.ceil((out - Date.now()) / 86_400_000));
}

// FD-08 In-House Guests — wired to GET /reservations/in-house (B10).
//
// The endpoint now returns folio totals per row (see withFolioTotals in
// routes/reservations.ts). This is the screen where a bill running away gets
// noticed, so the Balance column is the point of it, not decoration.
//
// FOUR CONTROLS WERE INERT. The search box had no state at all — just a
// placeholder — and Filter, Export and Post Charge had no handlers. All four
// now do something real: search filters, Filter narrows to guests who still
// owe, Export writes a CSV of what is on screen, and Post Charge opens the
// folio, which is where a charge is actually posted.
export function InHouseGuests({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ReservationWithBalance[]>([]);
  const [search, setSearch] = useState("");
  const [unsettledOnly, setUnsettledOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reservationsApi.inHouse()
      .then(page => setRows(page.items))
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = rows.filter(g => {
    if (unsettledOnly && g.balanceKobo <= 0) return false;
    if (search) {
      const q = search.toLowerCase();
      return (g.guestName ?? "").toLowerCase().includes(q) || (g.roomNumber ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // Exports what is on screen, not the whole table — the filters the user
  // just set are part of what they mean by "export".
  const exportCsv = () => {
    if (filtered.length === 0) { add({ type: "info", title: "Nothing to export" }); return; }
    const head = ["Room", "Guest", "Check-in", "Check-out", "Nights left", "VIP", "Balance (kobo)"];
    const cell = (v: string) => '"' + v.split('"').join('""') + '"';
    const lines = filtered.map(g => [
      g.roomNumber ?? "", g.guestName ?? "",
      g.checkInDate.slice(0, 10), g.checkOutDate.slice(0, 10),
      String(nightsLeft(g.checkOutDate)), g.vip ? "yes" : "no",
      // Kobo, deliberately: a spreadsheet column that has been through a
      // float conversion is exactly how money goes wrong (invariant 2).
      String(g.balanceKobo),
    ].map(cell).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `in-house-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="In-House Guests"
        sub={loading ? "Loading…" : `${filtered.length} guest${filtered.length === 1 ? "" : "s"} currently checked in`}
        actions={<><BtnO label="Export" icon={Download} onClick={exportCsv} /><BtnP label="Post Charge" icon={Plus} onClick={() => navigate("/front-desk/folio")} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guest or room…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} /></div>
          <button onClick={() => setUnsettledOnly(v => !v)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium"
            style={{ borderColor: unsettledOnly ? PRIMARY : BORDER, backgroundColor: unsettledOnly ? PRIMARY : "white", color: unsettledOnly ? "white" : MUTED }}
            title="Show only guests with an outstanding balance">
            <Filter size={13} />Unsettled only
          </button>
          <span className="ml-auto text-xs" style={{ color: SUBTLE }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="p-1">
          <AsyncBoundary loading={loading} error={error} onRetry={load} skeletonRows={5}>
            {filtered.length === 0 ? (
              <EmptyState icon={Users} message={rows.length === 0 ? "No guests are checked in." : "No guests match that search."} />
            ) : (
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest Name", "Check-in", "Check-out", "Nights Left", "VIP", "Balance", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>{filtered.map(g => (
                  <tr key={g.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
                    <td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>{g.roomNumber ?? "—"}</td>
                    <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{initials(g.guestName)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{g.guestName ?? "—"}</span></div></td>
                    <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{g.checkInDate.slice(0, 10)}</td>
                    <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{g.checkOutDate.slice(0, 10)}</td>
                    <td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>{nightsLeft(g.checkOutDate)}d</td>
                    <td className="px-5 py-3">{g.vip ? <Star size={16} fill={ORANGE} style={{ color: ORANGE }} /> : <span style={{ color: SUBTLE }}>—</span>}</td>
                    <td className="px-5 py-3">{g.balanceKobo > 0 ? <MoneyText kobo={g.balanceKobo} className="text-sm font-semibold" /> : <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Settled</span>}</td>
                    <td className="px-5 py-3"><div className="flex items-center gap-1"><button onClick={() => navigate(`/front-desk/check-out/${g.id}`)} className="px-2 py-1 rounded text-xs font-medium border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Check Out</button><button onClick={() => navigate(`/front-desk/folio/${g.id}`)} title="Open folio" className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><MoreHorizontal size={13} /></button></div></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </AsyncBoundary>
        </div>
      </div>
    </div>
  );
}
