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

const ATTEND_BADGE: Record<string, { bg: string; text: string; code: string; label: string }> = {
  present: { bg: "#DCFCE7", text: "#166534", code: "P", label: "Present" },
  absent: { bg: "#FEE2E2", text: "#991B1B", code: "A", label: "Absent" },
  late: { bg: "#FEF3C7", text: "#92400E", code: "T", label: "Late" },
  leave: { bg: "#EDE9FE", text: "#6D28D9", code: "L", label: "On Leave" },
};

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = new Date(start); d <= new Date(end); d.setDate(d.getDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

export function AttendanceScreen({ add }: { add: AddToast }) {
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cell, setCell] = useState<{ userId: string; date: string; name: string } | null>(null);
  const [cellStatus, setCellStatus] = useState<"present" | "absent" | "late" | "leave">("present");

  const load = () => hrApi.attendance().then(setData).catch(() => add({ type: "error", title: "Couldn't load attendance" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const saveCell = async () => {
    if (!cell) return;
    try {
      await hrApi.recordAttendance({ userId: cell.userId, date: cell.date, status: cellStatus });
      add({ type: "success", title: `${cell.name} marked ${cellStatus}` });
      setCell(null);
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't record attendance" }); }
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    try {
      await hrApi.decideLeaveRequest(id, decision);
      add({ type: decision === "approved" ? "success" : "warning", title: `Leave request ${decision}` });
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Couldn't decide leave request" }); }
  };

  if (loading || !data) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const days = dateRange(data.start, data.end);
  const byUserDate = new Map(data.records.map(r => [`${r.userId}|${r.date}`, r.status]));

  // "Approve Leave" from the original header is gone on purpose, not
  // silently dropped -- it's now real inline Approve/Reject buttons on
  // each pending request below, which is more precise than a single
  // header button that doesn't say which request it applies to.
  const exportCsv = () => {
    const header = `Staff Member,Department,${days.map(d => new Date(d).toLocaleDateString()).join(",")},Days Present`;
    const rows = data.staff.map(s => {
      const cells = days.map(d => byUserDate.get(`${s.id}|${d}`) ?? "");
      const present = days.filter(d => byUserDate.get(`${s.id}|${d}`) === "present").length;
      return [`${s.firstName} ${s.lastName}`, s.department ?? "", ...cells, present].join(",");
    });
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `attendance-${data.start}-to-${data.end}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Attendance" sub={`${new Date(data.start).toLocaleDateString()} – ${new Date(data.end).toLocaleDateString()}`}
        actions={<BtnO label="Export" icon={Download} onClick={exportCsv} />} />
      {data.pendingLeave.length > 0 && (
        <div className="bg-white rounded-xl border p-4 mb-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Pending Leave Requests</h3>
          <div className="space-y-2">{data.pendingLeave.map(lr => { const s = data.staff.find(x => x.id === lr.userId); return (
            <div key={lr.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: "#F8FAFC" }}>
              <div className="text-sm" style={{ color: TEXT }}>{s ? `${s.firstName} ${s.lastName}` : "—"} · {new Date(lr.startDate).toLocaleDateString()}–{new Date(lr.endDate).toLocaleDateString()}{lr.reason && <span style={{ color: MUTED }}> · {lr.reason}</span>}</div>
              <div className="flex gap-2"><button onClick={() => decide(lr.id, "approved")} className="text-xs px-2.5 py-1 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Approve</button><button onClick={() => decide(lr.id, "rejected")} className="text-xs px-2.5 py-1 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Reject</button></div>
            </div>
          ); })}</div>
        </div>
      )}
      <div className="bg-white rounded-xl border overflow-hidden overflow-x-auto" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Staff Member</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Department</th>{days.map(d => <th key={d} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</th>)}<th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Present</th></tr></thead>
          <tbody>{data.staff.map(s => { const present = days.filter(d => byUserDate.get(`${s.id}|${d}`) === "present").length; return (
            <tr key={s.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{s.firstName} {s.lastName}</td>
              <td className="px-5 py-3">{s.department && <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{s.department}</span>}</td>
              {days.map(d => { const status = byUserDate.get(`${s.id}|${d}`); const badge = status ? ATTEND_BADGE[status] : null; return (
                <td key={d} className="px-4 py-3 text-center">
                  <button onClick={() => { setCell({ userId: s.id, date: d, name: `${s.firstName} ${s.lastName}` }); setCellStatus((status as any) ?? "present"); }} title={badge?.label ?? "Not recorded"} className="inline-flex w-8 h-8 rounded-lg items-center justify-center text-xs font-bold" style={badge ? { backgroundColor: badge.bg, color: badge.text } : { backgroundColor: "#F3F4F6", color: "#9CA3AF" }}>{badge?.code ?? "—"}</button>
                </td>
              ); })}
              <td className="px-5 py-3 text-center font-bold text-sm" style={{ color: TEXT }}>{present}/{days.length}</td>
            </tr>
          ); })}</tbody>
        </table>
      </div>

      {cell && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setCell(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#0D1B2E" }}>{cell.name}</h3>
            <p className="text-xs mb-5" style={{ color: MUTED }}>{new Date(cell.date).toLocaleDateString()}</p>
            <div className="grid grid-cols-2 gap-2">{(["present", "absent", "late", "leave"] as const).map(s => <button key={s} onClick={() => setCellStatus(s)} className="py-2.5 rounded-xl text-sm font-medium border capitalize" style={cellStatus === s ? { backgroundColor: PRIMARY, color: "white", borderColor: PRIMARY } : { color: MUTED, borderColor: BORDER }}>{s}</button>)}</div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setCell(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={saveCell} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
