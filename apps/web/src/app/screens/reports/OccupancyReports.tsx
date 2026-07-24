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

export function OccupancyReports() {
  const [data, setData] = useState<OccupancyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsApi.occupancy().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const exportCsv = () => {
    const header = "Date,Occupancy %";
    const rows = data.occupancyByDay.map(d => [d.date, d.occupancy].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `occupancy-report-${data.start}-to-${data.end}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Occupancy Reports" sub={`${new Date(data.start).toLocaleDateString()} – ${new Date(data.end).toLocaleDateString()}`}
        actions={<><BtnO label="Export Excel" icon={Download} onClick={exportCsv} /><BtnO label="Export PDF" icon={FileText} onClick={() => window.print()} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Avg Occupancy", v: `${data.avgOccupancy}%` }, { l: "No-Show Rate", v: `${data.noShowRate}%` }, { l: "Cancellation Rate", v: `${data.cancellationRate}%` }, { l: "Avg Length of Stay", v: `${data.avgLengthOfStay} nights` }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Daily Occupancy</h3>
          {data.occupancyByDay.length === 0 ? <EmptyState icon={CalendarDays} message="No stays in this period yet." /> : (
            <ResponsiveContainer width="100%" height={220}><BarChart data={data.occupancyByDay} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis dataKey="date" tickFormatter={d => new Date(d).getDate().toString()} tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} /><Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} labelFormatter={d => new Date(d).toLocaleDateString()} formatter={(v: any) => [`${v}%`]} /><Bar key="daily-occ-bar" dataKey="occupancy" name="Occupancy" fill={PRIMARY} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy by Room Type</h3>
          {data.occupancyByRoomType.length === 0 ? <EmptyState icon={BedDouble} message="No room types configured." /> : data.occupancyByRoomType.map(r => <div key={r.type} className="mb-4"><div className="flex items-center justify-between text-sm mb-1.5"><span style={{ color: TEXT }}>{r.type}</span><span className="font-bold" style={{ color: PRIMARY }}>{r.occupancy}%</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${Math.min(r.occupancy, 100)}%`, backgroundColor: PRIMARY }} /></div></div>)}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Key Metrics</div>
            {[["ADR", `₦${data.adr.toLocaleString()}`], ["RevPAR", `₦${data.revpar.toLocaleString()}`]].map(([k, v]) => <div key={k} className="flex justify-between text-sm mb-1.5"><span style={{ color: MUTED }}>{k}</span><span className="font-semibold" style={{ color: TEXT }}>{v}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
