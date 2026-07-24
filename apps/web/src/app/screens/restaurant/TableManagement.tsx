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

export function TableManagement({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    restaurantApi.listTables().then(setTables).catch(() => add({ type: "error", title: "Couldn't load tables" })).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (id: string, status: RestaurantTable["status"]) => {
    try {
      const updated = await restaurantApi.setTableStatus(id, status);
      setTables(ts => ts.map(t => t.id === id ? updated : t));
      add({ type: "success", title: `Table ${updated.label} → ${status}` });
    } catch {
      add({ type: "error", title: "Couldn't update table" });
    }
  };

  const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    available: { bg: "#DCFCE7", border: "#16A34A", text: "#166534" },
    occupied: { bg: "#FFF7ED", border: ORANGE, text: "#9A3412" },
    reserved: { bg: "#CCFBF1", border: TEAL, text: "#0F766E" },
    dirty: { bg: "#FEF3C7", border: WARNING, text: "#92400E" },
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;
  const t = tables.find(x => x.id === selected) ?? null;

  return (
    <div>
      <PageHeader title="Table Management" sub="Restaurant floor status" actions={<BtnP label="Open POS" icon={UtensilsCrossed} onClick={() => navigate("/restaurant/pos")} />} />
      <div className="grid grid-cols-4 gap-4 mb-5">{(["occupied", "available", "reserved", "dirty"] as const).map(s => <div key={s} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-3xl font-bold" style={{ color: statusColors[s].border }}>{tables.filter(t => t.status === s).length}</div><div className="text-xs mt-1 capitalize" style={{ color: MUTED }}>{s}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Tables</h3>
          {tables.length === 0 ? <EmptyState icon={UtensilsCrossed} message="No tables configured for this branch yet." /> : (
            <div className="grid grid-cols-4 gap-3">
              {tables.map(tb => { const c = statusColors[tb.status]; return (
                <div key={tb.id} onClick={() => setSelected(tb.id)} className="cursor-pointer rounded-xl border-2 flex flex-col items-center justify-center hover:shadow-md transition-all p-4" style={{ backgroundColor: selected === tb.id ? `${c.border}30` : c.bg, borderColor: selected === tb.id ? c.border : `${c.border}80`, minHeight: 80 }}>
                  <div className="text-sm font-bold" style={{ color: c.text }}>{tb.label}</div>
                  <div className="text-xs" style={{ color: c.text }}>{tb.seats}p</div>
                </div>
              ); })}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>{t ? `Table ${t.label}` : "Select a table"}</h3>
          {t ? (
            <div>
              <Badge label={t.status} colors={{ bg: statusColors[t.status].bg, text: statusColors[t.status].text }} />
              <div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span style={{ color: MUTED }}>Seats</span><span style={{ color: TEXT }}>{t.seats} persons</span></div></div>
              <div className="space-y-2 mt-4">
                {t.status === "available" && <BtnP label="Open POS for this Table" icon={UtensilsCrossed} onClick={() => navigate("/restaurant/pos")} />}
                {t.status === "occupied" && <BtnO label="Mark Dirty (bill closed)" icon={FileText} onClick={() => setStatus(t.id, "dirty")} />}
                {t.status === "dirty" && <BtnP label="Mark Clean" icon={CheckCircle2} onClick={() => setStatus(t.id, "available")} color={SUCCESS} />}
                {t.status !== "reserved" && <BtnO label="Reserve Table" icon={CalendarDays} onClick={() => setStatus(t.id, "reserved")} />}
                {t.status === "reserved" && <BtnO label="Release Reservation" icon={X} onClick={() => setStatus(t.id, "available")} />}
              </div>
            </div>
          ) : <EmptyState icon={UtensilsCrossed} message="Click a table to see details and actions." />}
        </div>
      </div>
    </div>
  );
}
