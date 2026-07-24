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

const HK_LABELS: Record<HkRoom["housekeepingStatus"], string> = { dirty: "Dirty", in_progress: "In Progress", clean: "Clean", inspected: "Inspected" };
const HK_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  dirty: { bg: "#FEE2E2", text: "#991B1B" }, in_progress: { bg: "#FEF3C7", text: "#92400E" },
  clean: { bg: "#FEF9C3", text: "#713F12" }, inspected: { bg: "#DCFCE7", text: "#166534" },
};

export function InspectionLog({ add }: { add: AddToast }) {
  const [logs, setLogs] = useState<Inspection[]>([]);
  const [rooms, setRooms] = useState<HkRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ roomId: "", result: "pass" as "pass" | "fail", notes: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    Promise.all([housekeepingApi.listInspections(), housekeepingApi.listRooms()])
      .then(([l, r]) => { setLogs(l); setRooms(r); })
      .catch(() => setError("Couldn't load the inspection log."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const today = new Date().toDateString();
  const passedToday = logs.filter(l => l.result === "pass" && new Date(l.createdAt).toDateString() === today).length;
  const failedToday = logs.filter(l => l.result === "fail" && new Date(l.createdAt).toDateString() === today).length;
  const passRate = passedToday + failedToday === 0 ? "—" : `${Math.round((passedToday / (passedToday + failedToday)) * 100)}%`;

  const submit = async () => {
    if (!form.roomId) { add({ type: "warning", title: "Select a room" }); return; }
    setSubmitting(true);
    try {
      await housekeepingApi.createInspection(form.roomId, form.result, form.notes || undefined);
      add({ type: "success", title: `Room ${rooms.find(r => r.id === form.roomId)?.number} — ${form.result === "pass" ? "Passed" : "Failed"}` });
      setShowNew(false);
      setForm({ roomId: "", result: "pass", notes: "" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't save inspection" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Inspection Log" sub={error || "Supervisor inspections of cleaned rooms"} actions={<BtnP label="New Inspection" icon={Plus} onClick={() => setShowNew(true)} />} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Passed Today", v: String(passedToday), c: SUCCESS }, { l: "Failed Today", v: String(failedToday), c: ERROR }, { l: "Pass Rate", v: passRate, c: PRIMARY }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {logs.length === 0 ? <EmptyState icon={ClipboardList} message="No inspections logged yet." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Inspector", "Time", "Notes", "Result"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{logs.map(l => <tr key={l.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{l.roomNumber}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{l.inspectorFirstName} {l.inspectorLastName}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{new Date(l.createdAt).toLocaleString()}</td><td className="px-5 py-3 text-xs max-w-40" style={{ color: MUTED }}>{l.notes || "—"}</td><td className="px-5 py-3"><Badge label={l.result === "pass" ? "Passed" : "Failed"} colors={l.result === "pass" ? { bg: "#DCFCE7", text: "#166534" } : { bg: "#FEE2E2", text: "#991B1B" }} /></td></tr>)}</tbody>
          </table>
        )}
      </div>

      {showNew && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowNew(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5"><h3 className="text-base font-bold" style={{ color: TEXT }}>New Inspection</h3><button onClick={() => setShowNew(false)} style={{ color: SUBTLE }}><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Room</label>
                <select value={form.roomId} onChange={e => setForm(p => ({ ...p, roomId: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                  <option value="">Select a room…</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>Room {r.number} — {HK_LABELS[r.housekeepingStatus]}</option>)}
                </select>
              </div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Result</label>
                <div className="flex gap-2">{(["pass", "fail"] as const).map(r => (
                  <button key={r} onClick={() => setForm(p => ({ ...p, result: r }))} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2" style={{ borderColor: form.result === r ? (r === "pass" ? SUCCESS : ERROR) : BORDER, backgroundColor: form.result === r ? (r === "pass" ? "#F0FDF4" : "#FEF2F2") : "white", color: form.result === r ? (r === "pass" ? SUCCESS : ERROR) : MUTED }}>{r === "pass" ? "Pass" : "Fail"}</button>
                ))}</div>
              </div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: BORDER, color: TEXT }} placeholder="Issues found, or leave blank" />
              </div>
            </div>
            <div className="flex gap-3 mt-5"><BtnO label="Cancel" onClick={() => setShowNew(false)} /><BtnP label={submitting ? "Saving…" : "Save Inspection"} icon={CheckCircle2} onClick={submit} /></div>
          </div>
        </>
      )}
    </div>
  );
}
