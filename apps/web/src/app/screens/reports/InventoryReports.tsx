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

export function InventoryReports() {
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsApi.inventory().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const exportCsv = () => {
    const header = "Category,Consumption (NGN)";
    const rows = data.consumptionByCategory.map(c => [c.category, c.value].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `inventory-report-${data.start}-to-${data.end}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Inventory Reports" sub={`${new Date(data.start).toLocaleDateString()} – ${new Date(data.end).toLocaleDateString()}`}
        actions={<BtnO label="Export" icon={Download} onClick={exportCsv} />} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Stock Value", v: `₦${data.totalStockValue.toLocaleString()}`, c: PRIMARY }, { l: "Critical Items", v: data.criticalItems.toString(), c: ERROR }, { l: "Low Stock Items", v: data.lowStockItems.toString(), c: WARNING }, { l: "Supplier Spend (period)", v: `₦${data.totalSupplierSpendKobo.toLocaleString()}`, c: TEAL }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Consumption by Category (₦)</h3>
          {data.consumptionByCategory.length === 0 ? <EmptyState icon={Package} message="No stock consumed (type 'out') in this period yet." /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.consumptionByCategory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`₦${v.toLocaleString()}`]} />
                <Bar key="inv-cons-bar" dataKey="value" name="Consumption" fill={TEAL} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Stock Status by Category</h3>
          {data.stockStatusByCategory.length === 0 ? <EmptyState icon={Package} message="No products configured yet." /> : (
            <div className="space-y-3">{data.stockStatusByCategory.map(c => { const total = c.ok + c.low + c.critical; return <div key={c.category}><div className="flex items-center justify-between text-xs mb-1"><span style={{ color: TEXT }}>{c.category}</span><div className="flex gap-2">{c.critical > 0 && <span style={{ color: ERROR }}>{c.critical} critical</span>}{c.low > 0 && <span style={{ color: WARNING }}>{c.low} low</span>}<span style={{ color: SUCCESS }}>{c.ok} ok</span></div></div><div className="h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: "#F1F5F9" }}><div style={{ width: `${(c.ok / total) * 100}%`, backgroundColor: SUCCESS }} /><div style={{ width: `${(c.low / total) * 100}%`, backgroundColor: WARNING }} /><div style={{ width: `${(c.critical / total) * 100}%`, backgroundColor: ERROR }} /></div></div>; })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
