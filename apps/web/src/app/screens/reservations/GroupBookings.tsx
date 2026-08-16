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

export function GroupBookings({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const groups = [
    { id: "GRP-001", name: "Dangote Group Executive Retreat", type: "Corporate", contact: "Mrs. Toyin Ahmed", rooms: 12, checkin: "28 Jun", checkout: "30 Jun", status: "Confirmed" },
    { id: "GRP-002", name: "Adeyemi Wedding Party", type: "Wedding", contact: "Mr. Bolu Adeyemi", rooms: 8, checkin: "05 Jul", checkout: "07 Jul", status: "Confirmed" },
  ];
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", type: "Corporate", contact: "", rooms: "5", checkin: "", checkout: "" });

  const createGroup = () => {
    if (!newGroup.name || !newGroup.contact) { add({ type: "warning", title: "Fill in group name and contact" }); return; }
    setShowCreate(false);
    add({ type: "info", title: "Not available yet — group bookings need B12", body: `${newGroup.name} · ${newGroup.rooms} rooms · ${newGroup.type}` });
    setNewGroup({ name: "", type: "Corporate", contact: "", rooms: "5", checkin: "", checkout: "" });
  };

  return (
    <div>
      <PageHeader title="Group Bookings" sub="Block bookings for groups, conferences, and events" actions={<BtnP label="New Group Booking" icon={Plus} onClick={() => setShowCreate(true)} />} />
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.id} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="flex items-start justify-between mb-4">
              <div><h3 className="text-base font-semibold" style={{ color: TEXT }}>{g.name}</h3><div className="flex items-center gap-3 mt-1 text-xs" style={{ color: MUTED }}><span style={{ fontFamily: mono }}>{g.id}</span><span>{g.type}</span><span>Contact: {g.contact}</span></div></div>
              <Badge label={g.status} colors={{ bg: "#CCFBF1", text: "#0F766E" }} />
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[{ l: "Rooms Blocked", v: g.rooms.toString() }, { l: "Check-in", v: g.checkin }, { l: "Check-out", v: g.checkout }, { l: "Nights", v: "2" }].map(s => <div key={s.l} className="rounded-xl p-3 text-center" style={{ backgroundColor: "#F8FAFC" }}><div className="text-lg font-bold" style={{ color: TEXT }}>{s.v}</div><div className="text-xs" style={{ color: MUTED }}>{s.l}</div></div>)}
            </div>
            <div className="flex gap-2">
              <BtnO label="View Rooming List" icon={Users} />
              <BtnO label="Master Folio" icon={FileText} />
              <button onClick={() => add({ type: "info", title: `PDF generated — ${g.id}` })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-white" style={{ color: MUTED, borderColor: BORDER }}><Download size={14} />Export PDF</button>
            </div>
          </div>
        ))}
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}>
          <EmptyState icon={Users} message="Create a new group booking to manage block reservations for corporate events, weddings, and conferences." cta="New Group Booking" onCta={() => add({ type: "info", title: "Group booking form" })} />
        </div>
      </div>
    </div>
  );
}
