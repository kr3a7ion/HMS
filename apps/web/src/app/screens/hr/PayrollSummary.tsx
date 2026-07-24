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

export function PayrollSummary({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hrApi.payroll().then(setData).catch(() => add({ type: "error", title: "Couldn't load payroll summary" })).finally(() => setLoading(false));
  }, []);

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const exportCsv = () => {
    const header = "Staff Member,Department,Base Salary,Absent Days,Deductions,Net Pay";
    const rows = data.staff.map(p => [`${p.firstName} ${p.lastName}`, p.department ?? "", p.baseSalary, p.absentDays, p.deductions, p.net].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `payroll-${data.period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* "Process Payroll" stays visible but non-functional -- same pattern
          as IT Admin's "Restart Service": no payment processor/payroll
          provider is integrated anywhere in this codebase, so a click here
          can't submit anything real, and a fake success toast would be
          worse than not having the button pretend to work. */}
      <PageHeader title="Payroll Summary" sub={`Period: ${data.period}`}
        actions={<><BtnO label="Export for Payroll" icon={Download} onClick={exportCsv} /><BtnP label="Process Payroll" icon={DollarSign} /></>} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Total Gross", v: `₦${data.totalGross.toLocaleString()}`, c: PRIMARY }, { l: "Total Deductions", v: `₦${data.totalDeductions.toLocaleString()}`, c: ERROR }, { l: "Total Net", v: fmtN(data.totalNet), c: SUCCESS }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1 uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {data.staff.length === 0 ? <EmptyState icon={DollarSign} message="No staff have a pay rate on file yet." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Staff Member", "Department", "Base Salary", "Overtime", "Absent Days", "Deductions", "Net Pay", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{data.staff.map(p => <tr key={p.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{p.firstName[0]}{p.lastName[0]}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{p.firstName} {p.lastName}</span></div></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.department ?? "—"}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>₦{p.baseSalary.toLocaleString()}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>—</td><td className="px-5 py-3 text-sm" style={{ color: p.absentDays > 0 ? ERROR : MUTED }}>{p.absentDays}</td><td className="px-5 py-3 text-sm" style={{ color: ERROR }}>{p.deductions > 0 ? `−₦${p.deductions.toLocaleString()}` : "—"}</td><td className="px-5 py-3 text-sm font-bold" style={{ color: SUCCESS }}>₦{p.net.toLocaleString()}</td><td className="px-5 py-3"><button onClick={() => navigate(`/hr/staff/${p.id}?tab=Payroll Summary`)} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Breakdown</button></td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
