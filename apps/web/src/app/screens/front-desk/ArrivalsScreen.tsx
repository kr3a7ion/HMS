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

export function ArrivalsScreen({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All");
  const filtered = ARRIVALS_DATA.filter(a => {
    if (search && !a.guest.toLowerCase().includes(search.toLowerCase()) && !a.id.includes(search)) return false;
    if (tab === "VIP") return a.vip;
    if (tab === "Unassigned") return !a.assigned;
    if (tab === "Arrived") return false; // none arrived yet in demo
    return true;
  });
  return (
    <div>
      <PageHeader title="Arrivals List" sub={`${filtered.length} of ${ARRIVALS_DATA.length} arrivals today · 24 Jun 2025`} actions={<><BtnO label="Print List" icon={FileText} /><BtnP label="Quick Check-In" icon={KeyRound} onClick={() => navigate("/front-desk/check-in")} /></>} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b flex-wrap" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guest or reservation…" className="pl-7 pr-3 py-1.5 text-xs rounded-xl border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          {["All", "VIP", "Unassigned", "Arrived"].map(f => (
            <button key={f} onClick={() => setTab(f)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all"
              style={{ borderColor: tab === f ? PRIMARY : BORDER, backgroundColor: tab === f ? PRIMARY : "white", color: tab === f ? "white" : MUTED }}>
              {f}
              {f === "VIP" && <span className="ml-1 opacity-70">{ARRIVALS_DATA.filter(a => a.vip).length}</span>}
              {f === "Unassigned" && <span className="ml-1 opacity-70">{ARRIVALS_DATA.filter(a => !a.assigned).length}</span>}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: SUBTLE }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Guest", "Reservation", "Room", "ETA", "Nights", "Room Assigned", "Special Requests", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{ARRIVALS_DATA.map(a => (
            <tr key={a.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{a.av}</div><div><div className="flex items-center gap-1.5"><span className="text-sm font-medium" style={{ color: TEXT }}>{a.guest}</span>{a.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}</div></div></div></td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{a.id}</td>
              <td className="px-5 py-3 text-sm font-semibold" style={{ color: PRIMARY }}>{a.type}</td>
              <td className="px-5 py-3 text-sm font-mono" style={{ color: TEXT, fontFamily: mono }}>{a.eta}</td>
              <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{a.nights}n</td>
              <td className="px-5 py-3">{a.assigned ? <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Assigned</span> : <span className="text-xs font-medium" style={{ color: WARNING }}>Unassigned</span>}</td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, maxWidth: 160 }}><span className="line-clamp-1">{a.requests}</span></td>
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => navigate("/front-desk/check-in")} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Check In</button><button className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><MoreHorizontal size={13} /></button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
