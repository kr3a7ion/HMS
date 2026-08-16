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

export function ReservationSearch({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const filtered = q ? ALL_RES.filter(r => r.guest.toLowerCase().includes(q.toLowerCase()) || r.id.toLowerCase().includes(q)) : ALL_RES;
  return (
    <div>
      <PageHeader title="Reservation Search" sub="Search all reservations by guest, ID, room, date, or status" actions={<BtnP label="New Reservation" icon={Plus} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 p-4 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
          <div className="lg:col-span-2 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Guest name, reservation ID, or room…" className="pl-9 pr-4 py-2.5 w-full border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Status", "Confirmed", "Checked In", "Checked Out", "No Show", "Cancelled"]} />
          <Inp label="" type="date" defaultValue="2025-06-24" placeholder="Check-in from" />
          <Inp label="" type="date" defaultValue="2025-06-30" placeholder="Check-in to" />
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Reservation ID", "Guest", "Room", "Check-in", "Check-out", "Nights", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(r => <tr key={r.id} className="border-t hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: "#F1F5F9" }}>
            <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{r.id}</td>
            <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{r.guest.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{r.guest}</span></div></td>
            <td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>Room {r.room}</td>
            <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkin}</td>
            <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkout}</td>
            <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{r.nights}n</td>
            <td className="px-5 py-3"><Badge label={r.status} colors={resStC[r.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td>
            <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => navigate(`/reservations/${r.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button>{r.status === "Confirmed" && <button onClick={() => navigate("/front-desk/check-in")} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Check In</button>}</div></td>
          </tr>)}</tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon={Search} message="No reservations match your search." />}
      </div>
    </div>
  );
}
