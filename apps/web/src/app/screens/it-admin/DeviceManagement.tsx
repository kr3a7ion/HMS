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

export function DeviceManagement({ add }: { add: AddToast }) {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const stC: Record<string, { bg: string; text: string }> = { Online: { bg: "#DCFCE7", text: "#166534" }, Idle: { bg: "#FEF3C7", text: "#92400E" }, Revoked: { bg: "#F3F4F6", text: "#374151" } };

  const load = () => adminApi.listDevices().then(setDevices).catch(() => add({ type: "error", title: "Couldn't load devices" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const deauthorize = async (d: AdminDevice) => {
    try {
      await adminApi.deauthorizeDevice(d.sessionId);
      add({ type: "warning", title: `Device deauthorized — ${d.userFirstName} ${d.userLastName}'s session ended` });
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't deauthorize device" }); }
  };

  return (
    <div>
      <PageHeader title="Device Management" sub="Login sessions on the branch LAN" />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Online", v: devices.filter(d => d.status === "Online").length.toString(), c: SUCCESS }, { l: "Idle", v: devices.filter(d => d.status === "Idle").length.toString(), c: WARNING }, { l: "Total Sessions", v: devices.length.toString(), c: PRIMARY }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : devices.length === 0 ? <EmptyState icon={Server} message="No login sessions yet." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["User", "Department", "IP Address", "Device Info", "Last Active", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{devices.map(d => <tr key={d.sessionId} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{d.userFirstName ? `${d.userFirstName} ${d.userLastName}` : "—"}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{d.userDepartment ?? "—"}</td><td className="px-5 py-3 text-xs" style={{ color: TEXT, fontFamily: mono }}>{d.ipAddress ?? "—"}</td><td className="px-5 py-3 text-xs truncate max-w-[220px]" style={{ color: SUBTLE, fontFamily: mono }} title={d.userAgent ?? ""}>{d.userAgent ?? "—"}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{d.lastActiveAt ? new Date(d.lastActiveAt).toLocaleString() : "—"}</td><td className="px-5 py-3"><Badge label={d.status} colors={stC[d.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1">{d.status !== "Revoked" && <button onClick={() => deauthorize(d)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Deauthorize</button>}</div></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
