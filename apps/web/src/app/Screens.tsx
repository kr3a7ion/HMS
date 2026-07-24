// Shared UI primitives (Badge, StatCard, PageHeader, Inp, Sel, etc.) used
// across every screen. Screen components themselves live under
// src/app/screens/<module>/ per Guidelines §2 — this file is imported by
// those modules, not the other way around, so there's no circular dependency.
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
} from "./lib/api";
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
} from "./data";

// ─── UI Primitives ──────────────────────────────────────────────────────────
// ─── PREMIUM UI PRIMITIVES ────────────────────────────────────────────────────


export function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text, letterSpacing: "0.01em" }}>
      {label}
    </span>
  );
}

export function EmptyState({ icon: Icon, message, cta, onCta }: { icon: React.ElementType; message: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-sm"
        style={{ background: "linear-gradient(135deg, #F1F5F9, #E2E8F0)" }}>
        <Icon size={26} color={SUBTLE} />
      </div>
      <p className="text-sm max-w-xs leading-relaxed" style={{ color: MUTED }}>{message}</p>
      {cta && (
        <button onClick={onCta} className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ backgroundColor: PRIMARY }}>
          {cta}
        </button>
      )}
    </div>
  );
}

export function ToastC({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; icon: React.ElementType; accent: string }> = {
    success: { bg: "#EFFEF7", border: "#86EFAC", icon: CheckCircle2, accent: "#16A34A" },
    error:   { bg: "#FFF1F2", border: "#FDA4AF", icon: AlertCircle, accent: "#E11D48" },
    info:    { bg: "#EFF6FF", border: "#93C5FD", icon: AlertCircle, accent: "#2563EB" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", icon: AlertTriangle, accent: "#D97706" },
  };
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none" style={{ maxWidth: 360 }}>
      {toasts.map(t => { const c = cfg[t.type]; const Icon = c.icon; return (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-xl border min-w-72"
          style={{ backgroundColor: c.bg, borderColor: c.border }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: `${c.accent}15` }}>
            <Icon size={14} style={{ color: c.accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: TEXT }}>{t.title}</div>
            {t.body && <div className="text-xs mt-0.5 leading-relaxed" style={{ color: MUTED }}>{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-100 transition-opacity mt-0.5" style={{ color: MUTED }}>
            <X size={14} />
          </button>
        </div>
      ); })}
    </div>
  );
}

export function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="text-right">
      <div className="text-sm font-semibold text-white leading-none tracking-wide" style={{ fontFamily: mono, letterSpacing: "0.05em" }}>
        {p(t.getHours())}:{p(t.getMinutes())}:{p(t.getSeconds())}
      </div>
      <div className="text-xs mt-0.5" style={{ color: MUTED, fontFamily: mono }}>
        {t.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}
      </div>
    </div>
  );
}

export function SyncPill() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}>
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22C55E", boxShadow: "0 0 8px #22C55E" }} />
      Synced
    </div>
  );
}

export function StatCard({ label, value, sub, delta, deltaPositive, icon: Icon, accent }: {
  label: string; value: string; sub: string; delta?: string; deltaPositive?: boolean; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="rounded-2xl p-5 relative overflow-hidden group cursor-default transition-all duration-300 hover:-translate-y-0.5"
      style={{ backgroundColor: "white", border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
      {/* Top accent line */}
      <div className="absolute top-0 left-5 right-5 h-0.5 rounded-b-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}40)` }} />

      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-all group-hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${accent}20, ${accent}0a)`, border: `1px solid ${accent}18` }}>
          <Icon size={21} style={{ color: accent }} />
        </div>
        {delta && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${deltaPositive ? "text-emerald-700" : "text-rose-600"}`}
            style={{ backgroundColor: deltaPositive ? "#ECFDF5" : "#FFF1F2" }}>
            {deltaPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta}
          </div>
        )}
      </div>
      <div className="text-3xl font-bold leading-none mb-1.5 tracking-tight" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>{value}</div>
      <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: MUTED, letterSpacing: "0.08em" }}>{label}</div>
      <div className="text-xs" style={{ color: SUBTLE }}>{sub}</div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="font-bold tracking-tight" style={{ color: TEXT, fontSize: 22, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>{title}</h1>
        {sub && <p className="text-sm mt-0.5" style={{ color: MUTED }}>{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function BtnP({ label, icon: Icon, onClick, color }: { label: string; icon?: React.ElementType; onClick?: () => void; color?: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0"
      style={{ backgroundColor: color ?? PRIMARY, boxShadow: `0 2px 8px ${(color ?? PRIMARY)}40` }}>
      {Icon && <Icon size={14} />}{label}
    </button>
  );
}

export function BtnO({ label, icon: Icon, onClick }: { label: string; icon?: React.ElementType; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white hover:bg-[#F8FAFC] transition-all hover:shadow-sm"
      style={{ color: MUTED, borderColor: BORDER }}>
      {Icon && <Icon size={14} />}{label}
    </button>
  );
}

export function Inp({ label, placeholder, type, defaultValue, value, onChange }: { label?: string; placeholder?: string; type?: string; defaultValue?: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <div>
      {label && <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{label}</label>}
      <input type={type ?? "text"} placeholder={placeholder}
        {...(onChange ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue })}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} />
    </div>
  );
}

export function Sel({ label, options, value, onChange }: { label?: string; options: string[] | Array<{ value: string; label: string }>; value?: string; onChange?: (v: string) => void }) {
  const normalized = options.map(o => typeof o === "string" ? { value: o, label: o } : o);
  return (
    <div>
      {label && <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{label}</label>}
      <select value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
        {normalized.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
export function PlaceholderScreen({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return <div><PageHeader title={title} /><div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={Icon} message={desc} cta={`Open ${title}`} /></div></div>;
}

// ─── Router ──────────────────────────────────────────────────────────────────
// ─── NEW SCREENS ─────────────────────────────────────────────────────────────









const MENU_ALL = [
  { id: 1, name: "Jollof Rice + Chicken", price: 4500, cat: "Mains", avail: true },
  { id: 2, name: "Egusi Soup + Pounded Yam", price: 5200, cat: "Mains", avail: true },
  { id: 3, name: "Grilled Fish", price: 6800, cat: "Mains", avail: true },
  { id: 4, name: "Fried Plantain", price: 1500, cat: "Sides", avail: true },
  { id: 5, name: "Moi Moi", price: 1200, cat: "Sides", avail: false },
  { id: 6, name: "Chapman", price: 2000, cat: "Drinks", avail: true },
  { id: 7, name: "Zobo", price: 1000, cat: "Drinks", avail: true },
  { id: 8, name: "Chocolate Cake", price: 3500, cat: "Desserts", avail: true },
  { id: 9, name: "Suya", price: 3000, cat: "Starters", avail: true },
  { id: 10, name: "Spring Rolls (6pc)", price: 2800, cat: "Starters", avail: true },
];
