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

export function MyPreferences({ add }: { add: AddToast }) {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "" });

  const load = () => Promise.all([authApi.me(), settingsApi.getMyPreferences()])
    .then(([u, p]) => { setMe(u); setPrefs(p); })
    .catch(() => add({ type: "error", title: "Couldn't load preferences" }))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const save = async (patch: Partial<{ language: string; dateFormat: string; timeFormat: "24h" | "12h"; notificationPrefs: Record<string, boolean> }>) => {
    try { const p = await settingsApi.updateMyPreferences(patch); setPrefs(p); }
    catch { add({ type: "error", title: "Couldn't save preference" }); }
  };

  const changePassword = async () => {
    if (pwForm.next.length < 8) { add({ type: "error", title: "New password must be at least 8 characters" }); return; }
    try {
      await settingsApi.changePassword(pwForm.current, pwForm.next);
      add({ type: "success", title: "Password changed" });
      setShowChangePw(false); setPwForm({ current: "", next: "" });
    } catch (e) { add({ type: "error", title: e instanceof Error && e.message === "CURRENT_PASSWORD_INCORRECT" ? "Current password is incorrect" : "Couldn't change password" }); }
  };

  if (loading || !me || !prefs) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const notifLabels: Record<string, string> = { reservations: "Reservation notifications", housekeeping: "Housekeeping alerts", maintenance: "Maintenance work orders", finance: "Finance notifications", doorLock: "Door lock events", chat: "Internal chat messages", shiftHandover: "Shift handover reminders" };

  return (
    <div>
      <PageHeader title="My Preferences" sub={`${me.firstName} ${me.lastName} · ${me.role} — Personal settings`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Display & Language</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: MUTED }}>Language</label><div className="flex gap-2">{[["en", "English"], ["ha", "Hausa"], ["yo", "Yoruba"], ["ig", "Igbo"]].map(([code, l]) => <button key={code} onClick={() => save({ language: code })} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: prefs.language === code ? PRIMARY : BORDER, backgroundColor: prefs.language === code ? "#EFF6FF" : "white", color: prefs.language === code ? PRIMARY : MUTED }}>{l}</button>)}</div></div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: MUTED }}>Date Format</label><Sel options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} value={prefs.dateFormat} onChange={v => save({ dateFormat: v })} /></div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: MUTED }}>Time Format</label><div className="flex gap-2">{[["24h", "24-hour (14:30)"], ["12h", "12-hour (2:30 PM)"]].map(([code, l]) => <button key={code} onClick={() => save({ timeFormat: code as "24h" | "12h" })} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: prefs.timeFormat === code ? PRIMARY : BORDER, backgroundColor: prefs.timeFormat === code ? "#EFF6FF" : "white", color: prefs.timeFormat === code ? PRIMARY : MUTED }}>{l}</button>)}</div></div>
            </div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Notification Preferences</h3>
            <div className="space-y-3">{Object.entries(prefs.notificationPrefs).map(([key, on]) => <div key={key} className="flex items-center justify-between py-1.5"><span className="text-sm" style={{ color: TEXT }}>{notifLabels[key] ?? key}</span><button onClick={() => save({ notificationPrefs: { [key]: !on } })} className="w-10 h-5 rounded-full relative" style={{ backgroundColor: on ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: on ? 22 : 2 }} /></button></div>)}</div>
            <p className="text-xs mt-3" style={{ color: SUBTLE }}>Saved for real, but nothing in the app consults these yet — toasts and notifications still fire unconditionally.</p>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Security</h3>
            <BtnO label="Change Password" icon={KeyRound} onClick={() => setShowChangePw(true)} />
          </div>
        </div>
      </div>

      {showChangePw && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowChangePw(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E" }}>Change Password</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Current Password</label><input type="password" value={pwForm.current} onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>New Password (min. 8 characters)</label><input type="password" value={pwForm.next} onChange={e => setPwForm(p => ({ ...p, next: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowChangePw(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={changePassword} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Change Password</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
