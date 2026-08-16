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
  type StaffMember, type StaffDetail, type AttendanceData, type ShiftData, type PayrollData, type RoleSummary,
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

const HR_DEPARTMENTS = ["Management", "Front Desk", "Housekeeping", "Maintenance", "Finance", "Restaurant"];
const staffStatusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "#DCFCE7", text: "#166534" }, suspended: { bg: "#FEF3C7", text: "#92400E" }, deactivated: { bg: "#FEE2E2", text: "#991B1B" },
};

// HR-01. Real staff list, backed by /hr/staff -- MGT/ORG only per Blueprint.

export function StaffProfileDetail({ add }: { add: AddToast }) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const tabs = ["Overview", "Attendance Log", "Shifts", "Payroll Summary", "Management Notes"];
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : "Overview");
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState({ department: "", phone: "", emergencyContactName: "", emergencyContactPhone: "", role: "", contractType: "" });
  const [newNote, setNewNote] = useState("");
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const roleName = (rid: string) => roles.find(r => r.id === rid)?.name ?? rid;

  const load = () => {
    if (!id) return;
    hrApi.getStaff(id).then(setStaff).catch(() => setError("Couldn't load this staff profile.")).finally(() => setLoading(false));
  };
  useEffect(() => { setLoading(true); load(); hrApi.listRoles().then(setRoles).catch(() => {}); }, [id]);

  const openEdit = () => {
    if (!staff) return;
    setEdit({ department: staff.department ?? "", phone: staff.phone ?? "", emergencyContactName: staff.emergencyContactName ?? "", emergencyContactPhone: staff.emergencyContactPhone ?? "", role: staff.role, contractType: staff.contractType ?? "" });
    setShowEdit(true);
  };
  // StaffDirectory's row-level Edit button deep-links here with ?edit=1
  // rather than duplicating an edit form in the list -- one real edit path.
  useEffect(() => { if (staff && searchParams.get("edit") === "1") openEdit(); }, [staff]);
  const saveEdit = async () => {
    if (!id) return;
    try {
      await hrApi.updateStaff(id, { ...edit, contractType: edit.contractType || undefined });
      add({ type: "success", title: "Profile updated" });
      setShowEdit(false);
      load();
    } catch { add({ type: "error", title: "Couldn't update profile" }); }
  };
  const resetPassword = async () => {
    if (!id) return;
    try {
      const res = await hrApi.resetPassword(id);
      add({ type: "success", title: "Password reset", body: `New temp password: ${res.tempPassword}` });
    } catch { add({ type: "error", title: "Couldn't reset password" }); }
  };
  const deactivate = async () => {
    if (!id) return;
    try {
      await hrApi.deactivateStaff(id);
      add({ type: "warning", title: "Staff member deactivated" });
      load();
    } catch { add({ type: "error", title: "Couldn't deactivate" }); }
  };
  const addNote = async () => {
    if (!id || !newNote.trim()) return;
    try {
      await hrApi.addNote(id, newNote);
      setNewNote("");
      load();
    } catch { add({ type: "error", title: "Couldn't add note" }); }
  };
  const adjustPay = async (payRate: number) => {
    if (!id) return;
    try {
      await hrApi.adjustPayRate(id, payRate);
      add({ type: "success", title: "Pay rate updated" });
      load();
    } catch { add({ type: "error", title: "Couldn't update pay rate" }); }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;
  if (error || !staff) return <div className="p-5"><EmptyState icon={Users} message={error || "Staff member not found."} /></div>;

  const baseSalary = staff.payRateKobo ?? 0;
  const deductions = Math.round((baseSalary / 30) * staff.attendanceSummary.absent);
  const net = baseSalary - deductions;

  return (
    <div>
      <PageHeader title={`Staff Profile — ${staff.firstName} ${staff.lastName}`} sub={`${staff.employeeId ?? "—"} · ${roleName(staff.role)} · ${staff.department ?? "—"}`}
        actions={<><BtnO label="Reset Password" icon={KeyRound} onClick={resetPassword} /><BtnP label="Edit Profile" icon={Edit3} onClick={openEdit} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="text-center mb-4"><div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-2" style={{ backgroundColor: PRIMARY }}>{staff.firstName[0]}{staff.lastName[0]}</div><div className="text-sm font-bold" style={{ color: TEXT }}>{staff.firstName} {staff.lastName}</div><Badge label={staff.status} colors={staffStatusColors[staff.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></div>
          <div className="space-y-2 text-xs border-t pt-3" style={{ borderColor: "#F1F5F9" }}>{[["Employee ID", staff.employeeId ?? "—"], ["Role", roleName(staff.role)], ["Department", staff.department ?? "—"], ["Phone", staff.phone ?? "—"], ["Start Date", staff.startDate ? new Date(staff.startDate).toLocaleDateString() : "—"]].map(([k, v]) => <div key={k} className="flex flex-col"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}</div>
          {staff.status === "active" && <button onClick={deactivate} className="w-full mt-3 text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Deactivate Account</button>}
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b" style={{ borderColor: BORDER }}>{tabs.map(t => <button key={t} onClick={() => setTab(t)} className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: tab === t ? PRIMARY : MUTED, borderBottom: tab === t ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{t}</button>)}</div>
          <div className="p-5">
            {/* The original mock's Overview also had a "Shift" field --
                dropped here on purpose rather than restored, since it would
                just duplicate the real "Shifts" tab two clicks away on this
                same page; a static summary here would go stale the moment
                a new shift is published. Contract Type is real (users.contractType). */}
            {tab === "Overview" && <div className="grid grid-cols-2 gap-3">{[["Full Name", `${staff.firstName} ${staff.lastName}`], ["Email", staff.email], ["Start Date", staff.startDate ? new Date(staff.startDate).toLocaleDateString() : "—"], ["Contract Type", staff.contractType ?? "—"], ["Department", staff.department ?? "—"], ["Emergency Contact", staff.emergencyContactName ? `${staff.emergencyContactName}${staff.emergencyContactPhone ? " · " + staff.emergencyContactPhone : ""}` : "—"]].map(([k, v]) => <div key={k}><div className="text-xs" style={{ color: MUTED }}>{k}</div><div className="text-sm font-medium mt-0.5" style={{ color: TEXT }}>{v}</div></div>)}</div>}
            {tab === "Attendance Log" && <div className="grid grid-cols-4 gap-3">{[["Present", staff.attendanceSummary.present, SUCCESS], ["Absent", staff.attendanceSummary.absent, ERROR], ["Late", staff.attendanceSummary.late, WARNING], ["On Leave", staff.attendanceSummary.leave, TEAL]].map(([l, v, c]) => <div key={l as string} className="text-center p-3 rounded-lg" style={{ backgroundColor: "#F8FAFC" }}><div className="text-xl font-bold" style={{ color: c as string }}>{v}</div><div className="text-xs mt-0.5" style={{ color: MUTED }}>{l} (this month)</div></div>)}</div>}
            {tab === "Shifts" && (staff.upcomingShifts.length === 0 ? <EmptyState icon={CalendarDays} message="No published shifts scheduled." /> : <div className="space-y-2">{staff.upcomingShifts.map(sh => <div key={sh.id} className="text-sm p-2 rounded-lg" style={{ backgroundColor: "#F8FAFC", color: TEXT }}>{new Date(sh.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {sh.shiftType}</div>)}</div>)}
            {tab === "Payroll Summary" && <div>
              <div className="flex items-center justify-between mb-2"><div className="text-sm font-semibold" style={{ color: TEXT }}>Current period</div>{staff.payRateKobo == null && <span className="text-xs" style={{ color: MUTED }}>No pay rate on file</span>}</div>
              <div className="space-y-2">{[["Base Salary", `₦${baseSalary.toLocaleString()}`, TEXT], ["Overtime", "₦0", MUTED], ["Deductions", `−₦${deductions.toLocaleString()}`, ERROR], ["Net Pay", `₦${net.toLocaleString()}`, SUCCESS]].map(([k, v, c]) => <div key={k as string} className="flex justify-between text-sm border-b pb-2" style={{ borderColor: "#F1F5F9" }}><span style={{ color: MUTED }}>{k}</span><span className="font-bold" style={{ color: c as string }}>{v}</span></div>)}</div>
              <div className="flex items-center gap-2 mt-4"><input type="number" placeholder="New monthly rate (₦)" id="pay-rate-input" className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} onKeyDown={e => { if (e.key === "Enter") { const v = Number((e.target as HTMLInputElement).value); if (v > 0) { adjustPay(v); (e.target as HTMLInputElement).value = ""; } } }} /><span className="text-xs" style={{ color: SUBTLE }}>Enter to save</span></div>
            </div>}
            {tab === "Management Notes" && <div>
              {staff.notes.length === 0 ? <EmptyState icon={ClipboardList} message="No management notes on record." /> : <div className="space-y-2 mb-4">{staff.notes.map(n => <div key={n.id} className="p-3 rounded-lg" style={{ backgroundColor: "#F8FAFC" }}><div className="text-sm" style={{ color: TEXT }}>{n.note}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{n.createdByFirstName} {n.createdByLastName} · {new Date(n.createdAt).toLocaleString()}</div></div>)}</div>}
              <div className="flex gap-2"><input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a management note…" className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /><button onClick={addNote} className="text-xs font-medium px-3 py-2 rounded-xl text-white" style={{ backgroundColor: PRIMARY }}>Add Note</button></div>
            </div>}
          </div>
        </div>
      </div>

      {showEdit && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowEdit(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E" }}>Edit Profile</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Role</label><Sel options={roles.map(r => ({ value: r.id, label: r.name }))} value={edit.role} onChange={v => setEdit(p => ({ ...p, role: v }))} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Department</label><Sel options={HR_DEPARTMENTS} value={edit.department} onChange={v => setEdit(p => ({ ...p, department: v }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Phone</label><input value={edit.phone} onChange={e => setEdit(p => ({ ...p, phone: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Contract Type</label><Sel options={["Full-time", "Part-time", "Contract"]} value={edit.contractType || "Full-time"} onChange={v => setEdit(p => ({ ...p, contractType: v }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Emergency Contact</label><input value={edit.emergencyContactName} onChange={e => setEdit(p => ({ ...p, emergencyContactName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Contact Phone</label><input value={edit.emergencyContactPhone} onChange={e => setEdit(p => ({ ...p, emergencyContactPhone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEdit(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={saveEdit} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Save Changes</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
