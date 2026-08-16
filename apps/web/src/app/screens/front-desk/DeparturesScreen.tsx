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

const DEPARTURES_DATA = [
  { room: "101", guest: "Adaeze Okonkwo", checkout: "11:00", balance: 0, lateFlag: false, nights: 3, av: "AO" },
  { room: "202", guest: "Emmanuel Adeyemi", checkout: "11:00", balance: 45000, lateFlag: false, nights: 2, av: "EA" },
  { room: "203", guest: "Fatima Musa", checkout: "12:00", balance: 0, lateFlag: true, nights: 3, av: "FM" },
  { room: "118", guest: "Tunde Lawal", checkout: "10:00", balance: 18500, lateFlag: false, nights: 1, av: "TL" },
];

export function DeparturesScreen({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader title="Departures List" sub={`${DEPARTURES_DATA.length} expected check-outs today · 24 Jun 2025`} actions={<><BtnO label="Print List" icon={FileText} /><BtnP label="Quick Check-Out" icon={ArrowRight} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "Checkout Time", "Balance Due", "Late Checkout", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{DEPARTURES_DATA.map(d => (
            <tr key={d.room} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{d.room}</td>
              <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{d.av}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{d.guest}</span></div></td>
              <td className="px-5 py-3 text-sm font-mono" style={{ color: TEXT, fontFamily: mono }}>{d.checkout}</td>
              <td className="px-5 py-3">{d.balance > 0 ? <span className="text-sm font-bold" style={{ color: ERROR }}>₦{d.balance.toLocaleString()}</span> : <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Settled</span>}</td>
              <td className="px-5 py-3">{d.lateFlag ? <Badge label="Late Checkout" colors={{ bg: "#FEF3C7", text: "#92400E" }} /> : <span style={{ color: SUBTLE }}>—</span>}</td>
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => navigate("/front-desk/check-out")} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Check Out</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Extend</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
