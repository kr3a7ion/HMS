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

export function FinanceFolioManagement({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [folios, setFolios] = useState<FinanceFolio[]>([]);
  const [statusFilter, setStatusFilter] = useState<"All" | "open" | "closed" | "disputed">("All");
  const [balanceOnly, setBalanceOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    financeApi.listFolios({ status: statusFilter === "All" ? undefined : statusFilter, minBalance: balanceOnly })
      .then(setFolios)
      .catch(() => setError("Couldn't load folios."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [statusFilter, balanceOnly]);

  const toggleDispute = async (f: FinanceFolio) => {
    try {
      await financeApi.setDisputed(f.id, f.folioStatus !== "disputed");
      add({ type: f.folioStatus === "disputed" ? "success" : "warning", title: f.folioStatus === "disputed" ? "Dispute cleared" : "Folio marked disputed" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't update dispute status" });
    }
  };

  const statusColors: Record<string, { bg: string; text: string }> = { open: { bg: "#FEF3C7", text: "#92400E" }, closed: { bg: "#DCFCE7", text: "#166534" }, disputed: { bg: "#FEE2E2", text: "#991B1B" } };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Folio Management" sub={error || `${folios.length} folios · Finance view across all reservations`} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b flex-wrap" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          {(["All", "open", "closed", "disputed"] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold capitalize transition-all"
              style={{ borderColor: statusFilter === f ? PRIMARY : BORDER, backgroundColor: statusFilter === f ? PRIMARY : "white", color: statusFilter === f ? "white" : MUTED }}>
              {f}
            </button>
          ))}
          <label className="flex items-center gap-2 text-xs ml-2" style={{ color: MUTED }}>
            <input type="checkbox" checked={balanceOnly} onChange={e => setBalanceOnly(e.target.checked)} />
            Balance &gt; 0 only
          </label>
        </div>
        {folios.length === 0 ? <EmptyState icon={DollarSign} message="No folios match this filter." /> : (
          <table className="w-full">
            <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Guest", "Room", "Check-in", "Check-out", "Charges", "Paid", "Balance", "Status", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{folios.map((f, i) => (
              <tr key={f.id} className="border-t hover:bg-[#F8FAFC] cursor-pointer transition-colors" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }} onClick={() => navigate(`/front-desk/folio/${f.id}`)}>
                <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{f.guestFirstName} {f.guestLastName}</td>
                <td className="px-4 py-3.5 font-bold" style={{ color: PRIMARY }}>{f.roomNumber ?? "—"}</td>
                <td className="px-4 py-3.5 text-xs" style={{ color: MUTED }}>{new Date(f.checkInDate).toLocaleDateString()}</td>
                <td className="px-4 py-3.5 text-xs" style={{ color: MUTED }}>{new Date(f.checkOutDate).toLocaleDateString()}</td>
                <td className="px-4 py-3.5 text-sm font-bold" style={{ color: TEXT }}>₦{f.totalCharges.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-sm" style={{ color: SUCCESS }}>₦{f.totalPaid.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-sm font-bold" style={{ color: f.balance > 0 ? ERROR : SUCCESS }}>{f.balance > 0 ? `₦${f.balance.toLocaleString()}` : "Settled"}</td>
                <td className="px-4 py-3.5"><Badge label={f.folioStatus} colors={statusColors[f.folioStatus]} /></td>
                <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleDispute(f)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: f.folioStatus === "disputed" ? SUCCESS : ERROR, borderColor: f.folioStatus === "disputed" ? `${SUCCESS}30` : `${ERROR}30` }}>
                    {f.folioStatus === "disputed" ? "Clear Dispute" : "Dispute"}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
