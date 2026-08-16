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

export function PreventiveSchedule({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const tasks = [
    { id: "PS-001", asset: "Central AC Unit", freq: "Monthly", lastDone: "12 Mar 2025", nextDue: "12 Jun 2025", status: "Overdue", tech: "Emeka Nwosu" },
    { id: "PS-002", asset: "Diesel Generator", freq: "Monthly", lastDone: "15 May 2025", nextDue: "15 Jun 2025", status: "Overdue", tech: "Emeka Nwosu" },
    { id: "PS-003", asset: "Elevator #1", freq: "Quarterly", lastDone: "01 Jun 2025", nextDue: "01 Sep 2025", status: "Ok", tech: "External Vendor" },
    { id: "PS-004", asset: "Pool Filtration", freq: "Monthly", lastDone: "20 Apr 2025", nextDue: "20 Jul 2025", status: "Ok", tech: "Chidi Ike" },
    { id: "PS-005", asset: "Fire Extinguishers", freq: "Annual", lastDone: "10 Jan 2025", nextDue: "10 Jan 2026", status: "Ok", tech: "External Vendor" },
    { id: "PS-006", asset: "Commercial Refrigerator", freq: "Quarterly", lastDone: "10 May 2025", nextDue: "10 Aug 2025", status: "Ok", tech: "Chidi Ike" },
  ];
  const stC: Record<string, { bg: string; text: string }> = { Ok: { bg: "#DCFCE7", text: "#166534" }, Overdue: { bg: "#FEE2E2", text: "#991B1B" }, "Due Soon": { bg: "#FEF3C7", text: "#92400E" } };
  return (
    <div>
      <PageHeader title="Preventive Maintenance Schedule" sub="Scheduled service tasks by asset and frequency" actions={<><BtnO label="Calendar View" icon={CalendarDays} /><BtnP label="New Schedule Entry" icon={Plus} /></>} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Overdue", v: tasks.filter(t => t.status === "Overdue").length.toString(), c: ERROR }, { l: "Due This Month", v: "2", c: WARNING }, { l: "On Schedule", v: tasks.filter(t => t.status === "Ok").length.toString(), c: SUCCESS }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["ID", "Asset", "Frequency", "Last Completed", "Next Due", "Technician", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{tasks.map(t => <tr key={t.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{t.id}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{t.asset}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.freq}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.lastDone}</td><td className="px-5 py-3 text-xs font-semibold" style={{ color: t.status === "Overdue" ? ERROR : TEXT }}>{t.nextDue}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.tech}</td><td className="px-5 py-3"><Badge label={t.status} colors={stC[t.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Not available yet — preventive maintenance is not wired (B14). ${t.id} marked complete` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Mark Done</button><button onClick={() => add({ type: "info", title: `Work order created — ${t.asset}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Work Order</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
