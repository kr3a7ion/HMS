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

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export function ShiftScheduler({ add }: { add: AddToast }) {
  const [data, setData] = useState<ShiftData | null>(null);
  const [loading, setLoading] = useState(true);
  const shiftC: Record<string, { bg: string; text: string }> = { Morning: { bg: "#DCFCE7", text: "#166534" }, Evening: { bg: "#DBEAFE", text: "#1E40AF" }, Night: { bg: "#EDE9FE", text: "#6D28D9" }, Off: { bg: "#F3F4F6", text: "#6B7280" } };
  const SHIFT_CYCLE = ["Morning", "Evening", "Night", "Off"] as const;

  const load = () => hrApi.shifts().then(setData).catch(() => add({ type: "error", title: "Couldn't load shift schedule" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const cycleShift = async (userId: string, date: string, current: string) => {
    const next = SHIFT_CYCLE[(SHIFT_CYCLE.indexOf(current as any) + 1) % SHIFT_CYCLE.length];
    try {
      await hrApi.setShift({ userId, date, shiftType: next });
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't update shift" }); }
  };

  const publish = async () => {
    if (!data) return;
    try {
      const res = await hrApi.publishShifts(data.start, data.end);
      add({ type: "success", title: "Schedule published", body: `${res.count} shifts visible to staff` });
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't publish schedule" }); }
  };

  const cloneWeek = async () => {
    if (!data) return;
    const prevStart = new Date(new Date(data.start).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const res = await hrApi.cloneShifts(prevStart, data.start);
      add({ type: "success", title: `Cloned ${res.cloned} shifts from last week` });
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't clone last week" }); }
  };

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const days = dateRange(data.start, data.end);
  const shiftMap = new Map(data.shifts.map(s => [`${s.userId}|${s.date}`, s]));

  return (
    <div>
      <PageHeader title="Shift Scheduler" sub={`${new Date(data.start).toLocaleDateString()} – ${new Date(data.end).toLocaleDateString()} · click a cell to cycle shift`} actions={<><BtnO label="Clone Last Week" icon={RefreshCw} onClick={cloneWeek} /><BtnP label="Publish Schedule" icon={Send} onClick={publish} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden overflow-x-auto" style={{ borderColor: BORDER }}>
        <div className="flex" style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: "#F8FAFC" }}>
          <div className="w-44 flex-shrink-0 px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Staff</div>
          {days.map(d => <div key={d} className="flex-1 text-center py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED, minWidth: 80 }}>{new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>)}
        </div>
        {data.staff.map(s => <div key={s.id} className="flex items-center border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9", minHeight: 52 }}>
          <div className="w-44 flex-shrink-0 px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{s.firstName} {s.lastName}</div>
          {days.map(d => { const shift = shiftMap.get(`${s.id}|${d}`); const label = shift?.shiftType ?? "Off"; const c = shiftC[label]; return (
            <div key={d} className="flex-1 flex justify-center py-2" style={{ minWidth: 80 }}>
              <button onClick={() => cycleShift(s.id, d, label)} className="px-2 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text }}>{label}{shift?.published && " ✓"}</button>
            </div>
          ); })}
        </div>)}
        <div className="px-5 py-3 border-t flex gap-4 text-xs" style={{ borderColor: "#F1F5F9", color: MUTED }}>{Object.entries(shiftC).map(([s, c]) => <span key={s} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: c.bg, border: `1px solid ${c.text}30` }} />{s}</span>)}<span>· ✓ = published</span></div>
      </div>
    </div>
  );
}
