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

export function RoomAssignmentBoard({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const unassigned = ARRIVALS_DATA.filter(a => !a.assigned);
  const available = ROOMS.filter(r => r.status === "Available");
  const [sel, setSel] = useState<string | null>(null);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Room Assignment Board" sub="Assign unassigned arrivals to available rooms" actions={<BtnP label="Auto-Assign All" icon={Zap} onClick={() => add({ type: "info", title: "Not available yet — auto-assignment is not wired" })} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Unassigned Arrivals ({unassigned.length})</h3><p className="text-xs mt-0.5" style={{ color: MUTED }}>Select an arrival, then a room to assign</p></div>
          <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>{unassigned.map(a => <div key={a.id} onClick={() => setSel(a.id)} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors" style={{ backgroundColor: sel === a.id ? "#EFF6FF" : "white", borderLeft: sel === a.id ? `3px solid ${PRIMARY}` : "3px solid transparent" }}><div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{a.av}</div><div className="flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium" style={{ color: TEXT }}>{a.guest}</span>{a.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}</div><div className="text-xs" style={{ color: MUTED }}>{a.type} · ETA {a.eta}</div></div>{sel === a.id && <CheckCircle2 size={16} style={{ color: PRIMARY }} />}</div>)}</div>
          {unassigned.length === 0 && <EmptyState icon={CheckCircle2} message="All arrivals are assigned." />}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Available Rooms ({available.length})</h3></div>
          <div className="grid grid-cols-3 gap-2 p-4">{available.map(r => <div key={r.id} onClick={() => setSelRoom(r.id)} className="p-3 rounded-xl border-2 cursor-pointer text-center transition-all" style={{ borderColor: selRoom === r.id ? PRIMARY : BORDER, backgroundColor: selRoom === r.id ? "#EFF6FF" : "white" }}><div className="text-lg font-bold" style={{ color: TEXT }}>{r.id}</div><div className="text-xs" style={{ color: MUTED }}>{r.type}</div><div className="text-xs" style={{ color: SUBTLE }}>Floor {r.floor}</div></div>)}</div>
          {sel && selRoom && (
            <div className="px-5 pb-5"><div className="p-3 rounded-xl mb-3" style={{ backgroundColor: "#F0FDF4", border: `1px solid #BBF7D0` }}><div className="text-xs font-semibold" style={{ color: SUCCESS }}>Assignment Preview</div><div className="text-sm mt-1" style={{ color: TEXT }}>{ARRIVALS_DATA.find(a => a.id === sel)?.guest} → Room {selRoom}</div></div><BtnP label="Confirm Assignment" icon={CheckCircle2} onClick={() => { add({ type: "info", title: "Not available yet — this screen is not wired to room assignment", body: `Room ${selRoom} → ${ARRIVALS_DATA.find(a => a.id === sel)?.guest}` }); setSel(null); setSelRoom(null); }} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
