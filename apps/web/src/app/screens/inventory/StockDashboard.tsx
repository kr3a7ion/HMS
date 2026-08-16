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
  UserCheck, BookOpen, Inbox, Zap, ArrowUpDown,
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
import { formatNaira } from "../../lib/money";

// Shared stock-status helper for IV-01/02/04 and HK-06 -- one place that
// decides what "low"/"critical" means so every screen agrees.
function stockStatus(p: Product): { label: string; bg: string; text: string; bar: string } {
  if (p.currentStock <= p.reorderThreshold) return { label: "Critical", bg: "#FEE2E2", text: "#991B1B", bar: ERROR };
  if (p.currentStock <= p.parLevel) return { label: "Low", bg: "#FEF3C7", text: "#92400E", bar: WARNING };
  return { label: "Ok", bg: "#DCFCE7", text: "#166534", bar: SUCCESS };
}

// IV-01. Real aggregation from GET /inventory/dashboard.

export function StockDashboard({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [dash, setDash] = useState<InventoryDashboard | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([inventoryApi.dashboard(), inventoryApi.listProducts()])
      .then(([d, p]) => { setDash(d); setProducts(p); })
      .catch(() => add({ type: "error", title: "Couldn't load stock dashboard" }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !dash) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const critical = products.filter(p => stockStatus(p).label === "Critical");

  return (
    <div>
      <PageHeader title="Stock Dashboard" sub="Inventory overview" actions={<><BtnO label="Purchase Orders" icon={FileText} onClick={() => navigate("/inventory/purchase-orders")} /><BtnP label="View Products" icon={Package} onClick={() => navigate("/inventory/products")} /></>} />
      {critical.length > 0 && <div className="flex items-start gap-3 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: "#FEF2F2", border: `1px solid #FECACA` }}><AlertTriangle size={16} style={{ color: ERROR, marginTop: 1 }} /><div><div className="text-sm font-semibold" style={{ color: ERROR }}>Critical Stock — {critical.length} items require immediate reorder</div><div className="text-xs mt-0.5" style={{ color: "#991B1B" }}>{critical.map(i => i.name).join(" · ")}</div></div></div>}
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Items", v: dash.totalItems.toString(), c: PRIMARY }, { l: "Low/Critical Stock", v: dash.lowStockCount.toString(), c: dash.lowStockCount > 0 ? ERROR : SUCCESS }, { l: "Total Value", v: fmtN(dash.totalValue), c: SUCCESS }, { l: "Recent Transactions", v: dash.recentTransactions.length.toString(), c: TEAL }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>All Items</h3></div>
        {products.length === 0 ? <EmptyState icon={Package} message="No products configured yet." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Item", "Category", "Current / Par", "Reorder Point", "Unit Cost", "Value", "Status"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{products.map(item => { const c = stockStatus(item); const pct = Math.round((item.currentStock / item.parLevel) * 100); return <tr key={item.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{item.name}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.category}</td><td className="px-5 py-3"><div className="flex items-center gap-2"><span className="text-sm font-semibold" style={{ color: c.text }}>{item.currentStock}</span><span className="text-xs" style={{ color: SUBTLE }}>/ {item.parLevel} {item.unit}</span></div><div className="mt-1 h-1.5 w-24 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: c.bar }} /></div></td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{item.reorderThreshold} {item.unit}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{formatNaira(item.unitCostKobo)}</td><td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>{formatNaira((item.currentStock * item.unitCostKobo))}</td><td className="px-5 py-3"><Badge label={c.label} colors={{ bg: c.bg, text: c.text }} /></td></tr>; })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
