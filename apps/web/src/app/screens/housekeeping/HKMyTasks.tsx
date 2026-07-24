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

const HK_LABELS: Record<HkRoom["housekeepingStatus"], string> = { dirty: "Dirty", in_progress: "In Progress", clean: "Clean", inspected: "Inspected" };
const HK_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  dirty: { bg: "#FEE2E2", text: "#991B1B" }, in_progress: { bg: "#FEF3C7", text: "#92400E" },
  clean: { bg: "#FEF9C3", text: "#713F12" }, inspected: { bg: "#DCFCE7", text: "#166534" },
};

export function HKMyTasks({ add }: { add: AddToast }) {
  const [rooms, setRooms] = useState<HkRoom[]>([]);
  const [myName, setMyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    Promise.all([authApi.me(), housekeepingApi.listRooms()])
      .then(([me, allRooms]) => {
        setMyName(`${me.firstName} ${me.lastName}`);
        setRooms(allRooms.filter(r => r.assignedAttendantId === me.id));
      })
      .catch(() => setError("Couldn't load your tasks from the local server."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const setStatus = async (room: HkRoom, status: HkRoom["housekeepingStatus"]) => {
    try {
      const updated = await housekeepingApi.setStatus(room.id, status);
      setRooms(rs => rs.map(r => r.id === room.id ? updated : r));
      add({ type: "success", title: `Room ${room.number} → ${HK_LABELS[status]}` });
    } catch {
      add({ type: "error", title: "Couldn't update room status" });
    }
  };

  if (loading) return <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title={`My Tasks — ${myName}`} sub={error || `${rooms.length} room${rooms.length !== 1 ? "s" : ""} assigned to you`} />
      {rooms.length === 0 ? <EmptyState icon={BedDouble} message="No rooms currently assigned to you." /> : (
        <div className="space-y-3">
          {rooms.map(r => (
            <div key={r.id} className="bg-white rounded-xl border p-5" style={{ borderColor: r.priority ? ORANGE : BORDER, borderWidth: r.priority ? 2 : 1 }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold text-white" style={{ backgroundColor: PRIMARY }}>{r.number}</div>
                  <div><div className="flex items-center gap-2"><span className="text-xl font-bold" style={{ color: TEXT }}>Room {r.number}</span>{r.priority && <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ backgroundColor: "#FEE2E2", color: ERROR }}>PRIORITY</span>}</div><div className="text-sm mt-0.5" style={{ color: MUTED }}>{r.type} · Floor {r.floor}</div></div>
                </div>
                <Badge label={HK_LABELS[r.housekeepingStatus]} colors={HK_BADGE_COLORS[r.housekeepingStatus]} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {r.housekeepingStatus === "dirty" && <button onClick={() => setStatus(r, "in_progress")} className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[48px]" style={{ backgroundColor: PRIMARY }}>Start Cleaning</button>}
                {r.housekeepingStatus === "in_progress" && <button onClick={() => setStatus(r, "clean")} className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[48px]" style={{ backgroundColor: SUCCESS }}>Mark Cleaned</button>}
                {(r.housekeepingStatus === "clean" || r.housekeepingStatus === "inspected") && <div className="flex-1 py-3 rounded-xl text-sm font-bold text-center min-h-[48px] flex items-center justify-center" style={{ backgroundColor: "#DCFCE7", color: SUCCESS }}>✓ {r.housekeepingStatus === "inspected" ? "Inspected" : "Cleaned — Awaiting Inspection"}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
