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

const ADMIN_ROLE_OPTIONS = ["FD", "HK", "MX", "FIN", "RT", "MGT", "IT"];
const staffStatusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "#DCFCE7", text: "#166534" }, suspended: { bg: "#FEF3C7", text: "#92400E" }, deactivated: { bg: "#FEE2E2", text: "#991B1B" },
};

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// IT-02. Real os/process/DB stats -- no fabricated network/central-server
// latency (no central server exists pre-Phase-3) and no fake multi-service
// list (this is a single-process app; the one real "service" is the local
// server itself). Per-service "Restart" stays non-functional -- no process
// supervisor exists to back it.

export function SystemHealth({ add }: { add: AddToast }) {
  const [health, setHealth] = useState<SystemHealthData | null>(null);
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [diag, setDiag] = useState<DiagnosticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const load = () => Promise.all([adminApi.systemHealth(), adminApi.errorLog()])
    .then(([h, e]) => { setHealth(h); setErrors(e); })
    .catch(() => add({ type: "error", title: "Couldn't load system health" }))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const runDiagnostic = async () => {
    setRunning(true);
    try {
      const result = await adminApi.runDiagnostics();
      setDiag(result);
      const failed = result.checks.filter(c => !c.pass).length;
      add({ type: failed === 0 ? "success" : "warning", title: failed === 0 ? "All diagnostics passed" : `${failed} diagnostic check(s) failed` });
    } catch { add({ type: "error", title: "Couldn't run diagnostics" }); }
    finally { setRunning(false); }
  };

  if (loading || !health) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="System Health" sub="Local server status" actions={<BtnP label="Run Diagnostic" icon={Activity} onClick={runDiagnostic} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { l: "CPU Load (1m)", v: health.server.cpuLoad1m.toFixed(2), w: Math.min((health.server.cpuLoad1m / health.server.cpuCount) * 100, 100) },
          { l: "Memory Used", v: `${health.server.memUsedPct}%`, w: health.server.memUsedPct },
          { l: "Database", v: health.database.connected ? `${(health.database.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "Disconnected", w: health.database.connected ? 100 : 0 },
          { l: "Server Uptime", v: fmtUptime(health.server.uptimeSeconds), w: 100 },
        ].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{s.v}</div><div className="text-xs uppercase tracking-wider mb-2" style={{ color: MUTED }}>{s.l}</div><div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${s.w}%`, backgroundColor: PRIMARY }} /></div></div>)}
      </div>
      {diag && (
        <div className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Diagnostic Results — {new Date(diag.ranAt).toLocaleString()}</h3>
          <div className="space-y-2">{diag.checks.map(c => <div key={c.name} className="flex items-center gap-2 text-sm"><CheckCircle2 size={14} style={{ color: c.pass ? SUCCESS : ERROR }} /><span style={{ color: TEXT }}>{c.name}</span>{c.detail && <span className="text-xs" style={{ color: MUTED }}>— {c.detail}</span>}</div>)}</div>
        </div>
      )}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Services</h3></div>
        {/* "Restart" stays non-functional -- no process supervisor exists
            for this single-process app to hand a restart request to. */}
        {health.services.map(s => <div key={s.name} className="flex items-center gap-4 px-5 py-4 border-b hover:bg-[#FAFBFD]" style={{ borderColor: "#F8FAFC" }}><div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#DCFCE7" }}><Server size={16} style={{ color: SUCCESS }} /></div><div className="flex-1"><div className="text-sm font-medium" style={{ color: TEXT }}>{s.name}</div><div className="text-xs mt-0.5" style={{ color: SUBTLE }}>Up {fmtUptime(s.uptimeSeconds)}</div></div><Badge label="Running" colors={{ bg: "#DCFCE7", text: SUCCESS }} /><div className="flex gap-1"><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Restart</button><button onClick={() => setShowLogs(v => !v)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>{showLogs ? "Hide Logs" : "Logs"}</button></div></div>)}
        {showLogs && (
          <div className="p-5">
            {errors.length === 0 ? <EmptyState icon={Activity} message="No errors captured since the server started." /> : (
              <div className="space-y-2">{errors.slice(0, 20).map(e => <div key={e.id} className="p-3 rounded-lg text-xs" style={{ backgroundColor: "#FEF2F2" }}><div className="flex justify-between font-mono" style={{ color: ERROR }}><span>{e.method} {e.path}</span><span>{new Date(e.timestamp).toLocaleString()}</span></div><div className="mt-1" style={{ color: TEXT }}>{e.message}</div></div>)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
