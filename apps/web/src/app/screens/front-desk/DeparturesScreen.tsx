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
  type DepartureRow,
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
import { AsyncBoundary } from "../../components/AsyncBoundary";
import { MoneyText } from "../../components/Money";

/** Initials for the avatar chip. The mock carried a precomputed `av` field. */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// FD-07 Departures List -- wired to GET /reservations/departures (B10).
//
// TWO COLUMNS COULD NOT BE FILLED FROM THE DATA AS IT STOOD.
//
// "Balance Due" mattered enough to fix properly: a clerk cannot check anyone
// out without knowing what they owe, so the endpoint now returns the folio
// balance per row (computed after pagination, so the work is bounded by page
// size). That column is real.
//
// "Checkout Time" and "Late Checkout" are NOT. `reservations` stores whole
// business dates, with no per-guest checkout time and no late-checkout flag,
// so the mock's 11:00/12:00 and its "Late Checkout" badge had nothing behind
// them. Both columns stay -- the design calls for them and dropping them
// would be a silent removal -- and read "--" until the fields exist.

export function DeparturesScreen({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DepartureRow[]>([]);
  const [businessDate, setBusinessDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    reservationsApi.departures()
      .then(page => { setRows(page.items); setBusinessDate(page.businessDate); })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const dateLabel = businessDate
    ? new Date(businessDate).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return (
    <div>
      <PageHeader title="Departures List"
        sub={loading ? "Loading…" : `${rows.length} expected check-out${rows.length === 1 ? "" : "s"}${dateLabel ? ` · ${dateLabel}` : ""}`}
        actions={<><BtnO label="Print List" icon={FileText} onClick={() => window.print()} /><BtnP label="Quick Check-Out" icon={ArrowRight} onClick={() => navigate("/front-desk/check-out")} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="p-1">
          <AsyncBoundary loading={loading} error={error} onRetry={load} skeletonRows={5}>
            {rows.length === 0 ? (
              <EmptyState icon={ArrowRight} message="No departures for today." />
            ) : (
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "Checkout Time", "Balance Due", "Late Checkout", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>{rows.map(d => (
                  <tr key={d.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
                    <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{d.roomNumber ?? "—"}</td>
                    <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{initials(d.guestName)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{d.guestName ?? "—"}</span></div></td>
                    {/* No per-guest checkout time is recorded -- see the note above. */}
                    <td className="px-5 py-3 text-sm" style={{ color: SUBTLE, fontFamily: mono }} title="Checkout time isn't recorded yet">—</td>
                    <td className="px-5 py-3">{d.balanceKobo > 0 ? <MoneyText kobo={d.balanceKobo} className="text-sm font-bold" /> : <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Settled</span>}</td>
                    {/* No late-checkout flag exists -- see the note above. */}
                    <td className="px-5 py-3"><span style={{ color: SUBTLE }} title="Late checkout isn't tracked yet">—</span></td>
                    <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => navigate(`/front-desk/check-out/${d.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Check Out</button><button onClick={() => navigate(`/reservations/${d.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Open</button></div></td>
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
