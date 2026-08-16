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

export function DiningReservations({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Dining Reservations" sub="Restaurant booking management" actions={<><BtnO label="Walk-in Seat" icon={Plus} /><BtnP label="New Reservation" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          {["Today", "Tomorrow", "This Week"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "Today" ? PRIMARY : BORDER, backgroundColor: f === "Today" ? PRIMARY : "white", color: f === "Today" ? "white" : MUTED }}>{f}</button>)}
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Date", "Time", "Party", "Guest", "Table", "Special Requests", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{DINING_RES.map((d, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{d.date}</td><td className="px-5 py-3 text-sm font-mono font-semibold" style={{ color: TEXT, fontFamily: mono }}>{d.time}</td><td className="px-5 py-3 text-sm font-bold" style={{ color: PRIMARY }}>{d.party}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{d.guest}</td><td className="px-5 py-3"><Badge label={d.table} colors={{ bg: "#EFF6FF", text: PRIMARY }} /></td><td className="px-5 py-3 text-xs max-w-40" style={{ color: MUTED }}>{d.requests}</td><td className="px-5 py-3"><Badge label={d.status} colors={{ bg: "#CCFBF1", text: "#0F766E" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Not available yet — dining reservations need B15. ${d.guest} seated` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Seat</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Cancel</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
