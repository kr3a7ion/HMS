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

export function Announcements({ add }: { add: AddToast }) {
  const [announcementsList, setAnnouncementsList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", targetAudience: "all" });

  const load = () => {
    setLoading(true);
    announcementsApi.list().then(async list => {
      setAnnouncementsList(list);
      await Promise.all(list.filter(a => !a.readByMe).map(a => announcementsApi.markRead(a.id)));
    }).catch(() => add({ type: "error", title: "Couldn't load announcements" })).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const post = async () => {
    if (!form.title.trim() || !form.body.trim()) { add({ type: "warning", title: "Fill in title and body" }); return; }
    try {
      await announcementsApi.create(form);
      add({ type: "success", title: "Announcement posted" });
      setShowForm(false);
      setForm({ title: "", body: "", targetAudience: "all" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't post announcement" });
    }
  };

  const archive = async (id: string) => {
    try { await announcementsApi.archive(id); add({ type: "warning", title: "Announcement archived" }); load(); }
    catch { add({ type: "error", title: "Couldn't archive" }); }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Announcements" sub="Broadcast messages to all staff or specific departments" actions={<BtnP label="New Announcement" icon={Plus} onClick={() => setShowForm(p => !p)} />} />
      {showForm && (
        <div className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>New Announcement</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Announcement title…" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} />
            <select value={form.targetAudience} onChange={e => setForm(p => ({ ...p, targetAudience: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
              <option value="all">All Staff</option>
              {["FD", "HK", "MX", "RT", "FIN"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="mb-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Body</label><textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} placeholder="Announcement details…" style={{ borderColor: BORDER }} /></div>
          <div className="flex gap-3"><BtnP label="Post Announcement" icon={Send} onClick={post} /><BtnO label="Cancel" onClick={() => setShowForm(false)} /></div>
        </div>
      )}
      {announcementsList.length === 0 ? <EmptyState icon={MessageSquare} message="No announcements yet." /> : (
        <div className="space-y-3">{announcementsList.map(a => (
          <div key={a.id} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="flex items-start justify-between mb-2">
              <div><h3 className="text-sm font-semibold" style={{ color: TEXT }}>{a.title}</h3><div className="flex items-center gap-3 mt-1 text-xs" style={{ color: MUTED }}><span>By {a.createdByFirstName} {a.createdByLastName}</span>{a.expiresAt && <span>Expires {new Date(a.expiresAt).toLocaleDateString()}</span>}<span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{a.targetAudience === "all" ? "All Staff" : a.targetAudience}</span></div></div>
              <div className="text-right"><div className="text-xs font-semibold" style={{ color: a.readCount === a.totalStaff ? SUCCESS : WARNING }}>{a.readCount}/{a.totalStaff} read</div><div className="w-20 h-1.5 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${a.totalStaff ? (a.readCount / a.totalStaff) * 100 : 0}%`, backgroundColor: a.readCount === a.totalStaff ? SUCCESS : WARNING }} /></div></div>
            </div>
            <p className="text-sm" style={{ color: MUTED }}>{a.body}</p>
            <div className="flex gap-2 mt-3"><button onClick={() => archive(a.id)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Archive</button></div>
          </div>
        ))}</div>
      )}
    </div>
  );
}
