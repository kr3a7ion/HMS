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

export function SyncSettings({ add }: { add: AddToast }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = () => syncApi.status().then(setStatus).catch(() => add({ type: "error", title: "Couldn't load sync status" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await syncApi.syncNow();
      const ok = result.push.ok && result.pull.ok;
      add({ type: ok ? "success" : "warning", title: ok ? "Sync complete" : "Sync finished with errors", body: !result.push.ok ? `Push: ${result.push.error}` : !result.pull.ok ? `Pull: ${result.pull.error}` : undefined });
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Sync failed" }); }
    finally { setSyncing(false); }
  };

  if (loading || !status) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  if (!status.configured) {
    return (
      <div>
        <PageHeader title="Synchronization" sub="Local ↔ Central server sync settings and status" />
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}>
          <EmptyState icon={RefreshCw} message="This branch isn't paired with a central server yet. Set CENTRAL_SERVER_URL, CENTRAL_BRANCH_ID, and CENTRAL_SYNC_KEY (issued when the branch was provisioned) to enable sync." />
        </div>
      </div>
    );
  }

  const statusColor = (s: string) => s === "ok" ? SUCCESS : s === "error" ? ERROR : MUTED;

  return (
    <div>
      <PageHeader title="Synchronization" sub={`Local ↔ ${status.centralOrganizationName ?? "Central"} server`} actions={<BtnP label={syncing ? "Syncing…" : "Sync Now"} icon={RefreshCw} onClick={syncNow} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Connection Status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>Central Server URL</span><span className="text-sm font-semibold" style={{ color: TEXT, fontFamily: mono }}>{status.centralServerUrl}</span></div>
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>Last Push (this branch → central)</span><span className="text-sm font-semibold" style={{ color: statusColor(status.lastPushStatus) }}>{status.lastPushAt ? new Date(status.lastPushAt).toLocaleString() : "Never"} {status.lastPushStatus === "error" && `— ${status.lastPushError}`}</span></div>
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>Last Pull (central → this branch)</span><span className="text-sm font-semibold" style={{ color: statusColor(status.lastPullStatus) }}>{status.lastPullAt ? new Date(status.lastPullAt).toLocaleString() : "Never"} {status.lastPullStatus === "error" && `— ${status.lastPullError}`}</span></div>
            <div className="flex items-center justify-between py-2"><span className="text-sm" style={{ color: MUTED }}>Pending Items</span><span className="text-sm font-semibold" style={{ color: TEXT }}>{status.pendingItemCount}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Other Branches (last synced)</h3>
          <p className="text-xs mb-3" style={{ color: SUBTLE }}>From the most recent successful pull — not live.</p>
          {status.branches.length === 0 ? <EmptyState icon={Building2} message="No branch data cached yet — press Sync Now." /> : (
            <div className="space-y-2">{status.branches.map(b => <div key={b.branchId} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div><div className="text-sm font-medium" style={{ color: TEXT }}>{b.branchName}</div><div className="text-xs" style={{ color: MUTED }}>{b.occupancyRate != null ? `${b.occupancyRate}% occupancy` : "No data yet"}</div></div><span className="text-xs" style={{ color: SUBTLE }}>{b.snapshotAt ? new Date(b.snapshotAt).toLocaleDateString() : "—"}</span></div>)}</div>
          )}
        </div>
      </div>
      {/* Distribution (Auth/Distribution doc Part 11). currentVersion is
          always real (this build's own package.json); channel/rollback/
          check status reflect central's last instruction and this
          branch's last real registry check -- see ROADMAP.md for what's
          genuinely unverifiable without a real registry + Docker daemon. */}
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Deployment</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>Current Version</span><span className="text-sm font-semibold" style={{ color: TEXT, fontFamily: mono }}>{status.deployment.currentVersion}</span></div>
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>Update Channel</span><span className="text-sm font-semibold" style={{ color: TEXT }}>{status.deployment.updateChannel ?? "stable (default)"}</span></div>
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>Last Update Check</span><span className="text-sm font-semibold" style={{ color: status.deployment.lastUpdateStatus === "failed" ? ERROR : status.deployment.lastUpdateStatus === "update_available" ? WARNING : TEXT }}>{status.deployment.lastUpdateCheckAt ? new Date(status.deployment.lastUpdateCheckAt).toLocaleString() : "Never"} {status.deployment.lastUpdateStatus ? `— ${status.deployment.lastUpdateStatus.replace("_", " ")}` : ""}</span></div>
          {status.deployment.lastUpdateError && <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: "#FEF2F2", color: ERROR }}>{status.deployment.lastUpdateError}</div>}
          {status.deployment.rollbackToVersion && <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: "#FFFBEB", color: "#92400E" }}>Rollback to {status.deployment.rollbackToVersion} requested from Admin Console</div>}
        </div>
      </div>
    </div>
  );
}
