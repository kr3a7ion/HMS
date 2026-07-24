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

export function GuestProfileDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Stay History", "Preferences", "Folios", "Complaints & Feedback"];
  return (
    <div>
      <PageHeader title="Guest Profile — Dr. Chukwuemeka Bello" sub="G-002 · VIP · 15 stays"
        actions={<><BtnO label="Create Reservation" icon={Plus} /><BtnP label="Edit Profile" icon={Edit3} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-2" style={{ backgroundColor: PRIMARY }}>CB</div>
            <div className="flex items-center justify-center gap-1 mb-1"><span className="text-base font-bold" style={{ color: TEXT }}>Dr. Chukwuemeka Bello</span></div>
            <Star size={14} fill={ORANGE} style={{ color: ORANGE, display: "inline" }} /><span className="text-xs ml-1" style={{ color: MUTED }}>VIP Guest</span>
          </div>
          <div className="space-y-2 text-xs border-t pt-3" style={{ borderColor: "#F1F5F9" }}>
            {[["Phone", "+234 803 555 6666"], ["Email", "c.bello@example.com"], ["ID", "Passport A12345678"], ["Nationality", "Nigerian"], ["Member Since", "March 2020"]].map(([k, v]) => <div key={k} className="flex flex-col"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t text-center" style={{ borderColor: "#F1F5F9" }}>
            <div><div className="text-xl font-bold" style={{ color: PRIMARY }}>15</div><div className="text-xs" style={{ color: MUTED }}>Total Stays</div></div>
            <div><div className="text-xl font-bold" style={{ color: PRIMARY }}>₦2.4M</div><div className="text-xs" style={{ color: MUTED }}>Lifetime Value</div></div>
          </div>
        </div>
        {/* Main */}
        <div className="lg:col-span-3 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b" style={{ borderColor: BORDER }}>
            {tabs.map(t => <button key={t} onClick={() => setTab(t)} className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: tab === t ? PRIMARY : MUTED, borderBottom: tab === t ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{t}</button>)}
          </div>
          <div className="p-5">
            {tab === "Overview" && <div className="space-y-4"><div className="p-4 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Current Stay</div><div className="text-sm" style={{ color: MUTED }}>BK-2849 · Suite 501 · 24–27 Jun 2025 · Confirmed, arriving today</div></div><div><div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Internal Notes</div><p className="text-sm" style={{ color: MUTED }}>VIP — always request champagne and fruit basket on arrival. Prefers high floors. Regular monthly business traveller. Never disturb before 10:00.</p></div></div>}
            {tab === "Stay History" && <div className="space-y-2">{[{ id: "BK-2849", dates: "24–27 Jun 2025", room: "Suite 501", total: "₦273,375", status: "Confirmed" }, { id: "BK-2741", dates: "15–18 May 2025", room: "Suite 501", total: "₦273,375", status: "Checked Out" }, { id: "BK-2630", dates: "8–10 Apr 2025", room: "Suite 502", total: "₦182,250", status: "Checked Out" }].map(s => <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div className="flex-1"><div className="text-sm font-medium" style={{ color: TEXT }}>{s.dates}</div><div className="text-xs" style={{ color: MUTED }}>{s.room} · <span style={{ fontFamily: mono }}>{s.id}</span></div></div><div className="text-sm font-bold" style={{ color: TEXT }}>{s.total}</div><Badge label={s.status} colors={resStC[s.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></div>)}</div>}
            {tab === "Preferences" && <div className="grid grid-cols-2 gap-3">{[["Room Type", "Suite — top floor"], ["Pillow Type", "Firm"], ["Wake-up Call", "07:30"], ["Newspaper", "The Punch"], ["Dietary", "No shellfish"], ["Temperature", "20°C"], ["Minibar", "Stock with whisky"], ["Amenities", "Extra towels × 4"]].map(([k, v]) => <div key={k} className="p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div className="text-xs" style={{ color: MUTED }}>{k}</div><div className="text-sm font-medium mt-0.5" style={{ color: TEXT }}>{v}</div></div>)}</div>}
            {tab === "Folios" && <div className="text-sm" style={{ color: MUTED }}><p>No closed folios for current period. Previous folios archived.</p></div>}
            {tab === "Complaints & Feedback" && <EmptyState icon={CheckCircle2} message="No complaints or feedback on record. Excellent guest history." />}
          </div>
        </div>
      </div>
    </div>
  );
}
