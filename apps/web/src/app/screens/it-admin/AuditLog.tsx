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

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("All Modules");
  const [search, setSearch] = useState("");

  useEffect(() => {
    adminApi.auditLog().then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const modules = Array.from(new Set(logs.map(l => l.module).filter(Boolean))) as string[];
  const filtered = logs.filter(l =>
    (moduleFilter === "All Modules" || l.module === moduleFilter) &&
    (search === "" || l.action.toLowerCase().includes(search.toLowerCase()) || `${l.userFirstName ?? ""} ${l.userLastName ?? ""}`.toLowerCase().includes(search.toLowerCase()) || (l.recordId ?? "").toLowerCase().includes(search.toLowerCase())));

  const exportCsv = () => {
    const header = "Timestamp,User,Role,Action,Module,Record,IP,Details";
    const rows = filtered.map(l => [new Date(l.createdAt).toISOString(), l.userFirstName ? `${l.userFirstName} ${l.userLastName}` : "System", l.userRole ?? "", l.action, l.module ?? "", l.recordId ?? "", l.ipAddress ?? "", (l.details ?? "").replace(/,/g, ";")].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Audit Log" sub="Append-only record of system events · No delete capability" actions={<BtnO label="Export CSV" icon={Download} onClick={exportCsv} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}><div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by user, action, or record…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-56" style={{ borderColor: BORDER }} /></div><Sel options={["All Modules", ...modules]} value={moduleFilter} onChange={setModuleFilter} /></div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : filtered.length === 0 ? <EmptyState icon={ClipboardList} message="No audit events match." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "User", "Role", "Action", "Module", "Record", "IP"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(l => <tr key={l.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{new Date(l.createdAt).toLocaleString()}</td><td className="px-4 py-3 text-sm font-medium" style={{ color: TEXT }}>{l.userFirstName ? `${l.userFirstName} ${l.userLastName}` : "System"}</td><td className="px-4 py-3">{l.userRole && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{l.userRole}</span>}</td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{l.action}{l.details && <div className="text-xs mt-0.5" style={{ color: MUTED }}>{l.details}</div>}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{l.module ?? "—"}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{l.recordId ?? "—"}</td><td className="px-4 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{l.ipAddress ?? "—"}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
