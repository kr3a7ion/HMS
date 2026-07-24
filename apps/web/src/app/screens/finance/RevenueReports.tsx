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

export function RevenueReports() {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const PIE_COLORS = [PRIMARY, TEAL, ORANGE, SUBTLE, "#8B5CF6", "#EC4899"];

  useEffect(() => {
    reportsApi.revenue().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Revenue Reports" sub={`${new Date(data.start).toLocaleDateString()} – ${new Date(data.end).toLocaleDateString()}`} />
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>₦{data.totalRevenue.toLocaleString()}</div>
          <div className="text-xs uppercase tracking-wider mb-1" style={{ color: MUTED }}>Total Revenue</div>
          {data.changeVsPreviousPeriod != null && <div className={`flex items-center gap-1 text-xs ${data.changeVsPreviousPeriod >= 0 ? "text-green-600" : "text-red-500"}`}>{data.changeVsPreviousPeriod >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{data.changeVsPreviousPeriod}% vs previous period</div>}
        </div>
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>₦{data.adr.toLocaleString()}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>ADR</div></div>
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>₦{data.revpar.toLocaleString()}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>RevPAR</div></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue by Day (₦)</h3>
          {data.revenueByDay.length === 0 ? <EmptyState icon={DollarSign} message="No revenue posted in this period yet." /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.revenueByDay} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="date" tickFormatter={d => new Date(d).getDate().toString()} tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} labelFormatter={d => new Date(d).toLocaleDateString()} formatter={(v: any) => [`₦${v.toLocaleString()}`]} />
                <Area key="area-rev-rpt" type="monotone" dataKey="amount" name="Revenue" stroke={PRIMARY} strokeWidth={2} fill={PRIMARY + "20"} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue by Category</h3>
          {data.revenueByCategory.length === 0 ? <EmptyState icon={DollarSign} message="No revenue posted in this period yet." /> : (
            <>
              <ResponsiveContainer width="100%" height={160}><PieChart><Pie key="rev-cat-pie" data={data.revenueByCategory} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="amount" nameKey="category" stroke="none">{data.revenueByCategory.map((_, i) => <Cell key={`rev-cat-cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip formatter={(v: any) => [`₦${v.toLocaleString()}`]} contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer>
              <div className="space-y-1 mt-2">{data.revenueByCategory.map((c, i) => <div key={c.category} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />{c.category}</div><span className="font-semibold" style={{ color: TEXT }}>₦{c.amount.toLocaleString()}</span></div>)}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
