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

export function DailySummary({ add }: { add: AddToast }) {
  const [locked, setLocked] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<ApiDailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    financeApi.dailySummary(date).then(setSummary).catch(() => setError("Couldn't load the daily summary.")).finally(() => setLoading(false));
  };
  useEffect(load, [date]);

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;
  if (error || !summary) return <div className="p-5"><EmptyState icon={AlertCircle} message={error || "No data."} /></div>;

  return (
    <div>
      <PageHeader title="Daily Summary" sub={`${new Date(date).toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Grand Palms Hotel, Abuja`}
        actions={<>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} />
          {locked
            ? <button onClick={() => add({ type: "info", title: "Reopen summary", body: "MGT/ORG authorization required" })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border" style={{ color: MUTED, borderColor: BORDER }}>Reopen (Auth Required)</button>
            : <BtnP label="Lock & Close Day" icon={Lock} onClick={() => { setLocked(true); add({ type: "success", title: "Daily summary locked (demo only — not persisted)" }); }} />}
        </>} />
      {locked && <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5 text-sm font-medium" style={{ backgroundColor: "#DCFCE7", color: SUCCESS, border: `1px solid #BBF7D0` }}><Lock size={15} />Daily summary locked (demo only — not persisted across reloads)</div>}
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Revenue", v: fmtN(summary.totalRevenue), c: SUCCESS, icon: TrendingUp }, { l: "Transactions", v: String(summary.transactionCount), c: PRIMARY, icon: Activity }, { l: "Payments Collected", v: fmtN(summary.totalPayments), c: TEAL, icon: CreditCard }, { l: "Outstanding (Today)", v: fmtN(summary.outstandingBalance), c: summary.outstandingBalance > 0 ? ERROR : SUCCESS, icon: AlertTriangle }].map(s => { const Icon = s.icon; return <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><Icon size={20} style={{ color: s.c }} /><div className="text-2xl font-bold mt-2 mb-0.5" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>; })}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue by Category</h3>
          {summary.revenueByCategory.length === 0 ? <p className="text-sm" style={{ color: MUTED }}>No charges posted this day.</p> : (
            <>
              {summary.revenueByCategory.map(c => <div key={c.category} className="flex items-center gap-3 mb-3"><span className="text-sm flex-1" style={{ color: MUTED }}>{c.category}</span><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${(c.amount / summary.totalRevenue) * 100}%`, backgroundColor: PRIMARY }} /></div><div className="text-right w-28"><div className="text-sm font-semibold" style={{ color: TEXT }}>{fmtN(c.amount)}</div><div className="text-xs" style={{ color: SUBTLE }}>{c.txn} txns</div></div></div>)}
              <div className="pt-3 mt-2 border-t flex items-center justify-between font-bold" style={{ borderColor: BORDER, color: TEXT }}><span>Total</span><span>{fmtN(summary.totalRevenue)}</span></div>
            </>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Payments by Method</h3>
          {summary.paymentsByMethod.length === 0 ? <p className="text-sm" style={{ color: MUTED }}>No payments received this day.</p> : summary.paymentsByMethod.map(p => <div key={p.method} className="flex items-center gap-3 mb-3"><CreditCard size={16} style={{ color: MUTED, flexShrink: 0 }} /><span className="text-sm flex-1 capitalize" style={{ color: MUTED }}>{p.method}</span><span className="text-sm font-bold" style={{ color: TEXT }}>{fmtN(p.amount)}</span></div>)}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: BORDER }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Cash Drawer Reconciliation</h4>
            <p className="text-xs" style={{ color: SUBTLE }}>Not tracked yet — no till/session concept exists in the data model. This section will come back once one does, rather than showing invented numbers.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
