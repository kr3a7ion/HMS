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

export function BackupRestore({ add }: { add: AddToast }) {
  const [snaps, setSnaps] = useState<BackupSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupSnapshot | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = () => adminApi.listBackups().then(setSnaps).catch(() => add({ type: "error", title: "Couldn't load backups" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const backUpNow = async () => {
    setBackingUp(true);
    try {
      const res = await adminApi.createBackup();
      add({ type: "success", title: "Backup complete", body: `${res.fileName} (${(res.sizeBytes / 1024 / 1024).toFixed(1)} MB)` });
      setLoading(true); load();
    } catch { add({ type: "error", title: "Backup failed" }); }
    finally { setBackingUp(false); }
  };

  const restore = async () => {
    if (!restoreTarget) return;
    try {
      const res = await adminApi.restoreBackup(restoreTarget.id);
      add({ type: "warning", title: "Restore staged", body: res.message });
      setRestoreTarget(null); setConfirmText("");
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Couldn't stage restore" }); }
  };

  return (
    <div>
      <PageHeader title="Backup & Restore" sub="Local server data backups" actions={<BtnP label={backingUp ? "Backing up…" : "Back Up Now"} icon={RefreshCw} onClick={backUpNow} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Snapshot History</h3></div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : snaps.length === 0 ? <EmptyState icon={RefreshCw} message="No backups yet." cta="Back Up Now" onCta={backUpNow} /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "Size", "Type", "Status", "Created By", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{snaps.map(s => <tr key={s.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm" style={{ color: TEXT, fontFamily: mono }}>{new Date(s.createdAt).toLocaleString()}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{(s.sizeBytes / 1024 / 1024).toFixed(1)} MB</td><td className="px-5 py-3"><Badge label="Local" colors={{ bg: "#DCFCE7", text: "#166534" }} /></td><td className="px-5 py-3"><Badge label={s.status} colors={s.status === "restore_pending" ? { bg: "#FEF3C7", text: "#92400E" } : s.status === "restored" ? { bg: "#EEF2FF", text: "#4338CA" } : { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{s.createdByFirstName ? `${s.createdByFirstName} ${s.createdByLastName}` : "—"}</td><td className="px-5 py-3"><button disabled={s.status === "restore_pending"} onClick={() => setRestoreTarget(s)} className="text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-40" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Restore</button></td></tr>)}</tbody>
          </table>
        )}
      </div>

      {restoreTarget && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => { setRestoreTarget(null); setConfirmText(""); }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#0D1B2E" }}>Restore from {new Date(restoreTarget.createdAt).toLocaleString()}</h3>
            <p className="text-xs mb-4" style={{ color: ERROR }}>⚠ This overwrites all current data on next server restart. This action cannot be undone.</p>
            <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Type RESTORE to confirm</label>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESTORE" className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none mb-4 font-mono" style={{ borderColor: confirmText === "RESTORE" ? ERROR : BORDER }} />
            <div className="flex gap-3">
              <button onClick={() => { setRestoreTarget(null); setConfirmText(""); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button disabled={confirmText !== "RESTORE"} onClick={restore} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: ERROR }}>Stage Restore</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
