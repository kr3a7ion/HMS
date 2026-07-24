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

export function StaffDirectory({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [status, setStatus] = useState("All Status");
  const [showCreate, setShowCreate] = useState(false);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: "FD", department: "Front Desk", phone: "", payRate: "", contractType: "Full-time" });

  const load = () => hrApi.listStaff().then(setStaff).catch(() => add({ type: "error", title: "Couldn't load staff directory" })).finally(() => setLoading(false));
  useEffect(() => { load(); hrApi.listRoles().then(setRoles).catch(() => {}); }, []);
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? id;

  const create = async () => {
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()) { add({ type: "error", title: "Email, first name, and last name are required" }); return; }
    try {
      const res = await hrApi.createStaff({ email: form.email, firstName: form.firstName, lastName: form.lastName, role: form.role, department: form.department, phone: form.phone || undefined, payRate: form.payRate ? Number(form.payRate) : undefined, contractType: form.contractType });
      add({ type: "success", title: `${form.firstName} ${form.lastName} added — ${res.employeeId}`, body: `Temp password: ${res.tempPassword}` });
      setShowCreate(false);
      setForm({ email: "", firstName: "", lastName: "", role: "FD", department: "Front Desk", phone: "", payRate: "", contractType: "Full-time" });
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Couldn't add staff member" }); }
  };

  const filtered = staff.filter(s =>
    (department === "All Departments" || s.department === department) &&
    (status === "All Status" || s.status === status.toLowerCase()) &&
    (search === "" || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) || (s.department ?? "").toLowerCase().includes(search.toLowerCase())));

  const exportCsv = () => {
    const header = "Employee ID,First Name,Last Name,Role,Department,Phone,Start Date,Status";
    const rows = filtered.map(s => [s.employeeId ?? "", s.firstName, s.lastName, roleName(s.role), s.department ?? "", s.phone ?? "", s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : "", s.status].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `staff-directory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="Staff Directory" sub={loading ? "Loading…" : `${staff.length} staff members`} actions={<><BtnO label="Export" icon={Download} onClick={exportCsv} /><BtnP label="Add Staff Member" icon={Plus} onClick={() => setShowCreate(true)} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative flex-1 max-w-xs"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or department…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-full" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Departments", ...HR_DEPARTMENTS]} value={department} onChange={setDepartment} />
          <Sel options={["All Status", "Active", "Suspended", "Deactivated"]} value={status} onChange={setStatus} />
        </div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : filtered.length === 0 ? <EmptyState icon={Users} message="No staff members match your search." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Employee", "Role", "Department", "Phone", "Start Date", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            {/* No row-level delete: staff accounts only ever deactivate
                (see hrApi.deactivateStaff), never hard-delete, for the same
                audit-trail reason Audit Log itself has no delete capability
                -- deactivation lives on the profile page, not here. */}
            <tbody>{filtered.map(s => <tr key={s.id} className="border-t hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: "#F1F5F9" }} onClick={() => navigate(`/hr/staff/${s.id}`)}><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{s.firstName[0]}{s.lastName[0]}</div><div><div className="text-sm font-semibold" style={{ color: TEXT }}>{s.firstName} {s.lastName}</div><div className="text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{s.employeeId ?? "—"}</div></div></div></td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{roleName(s.role)}</td><td className="px-5 py-3">{s.department && <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{s.department}</span>}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{s.phone ?? "—"}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{s.startDate ? new Date(s.startDate).toLocaleDateString() : "—"}</td><td className="px-5 py-3"><Badge label={s.status} colors={staffStatusColors[s.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3" onClick={e => e.stopPropagation()}><div className="flex gap-1"><button onClick={() => navigate(`/hr/staff/${s.id}`)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><Eye size={13} /></button><button onClick={() => navigate(`/hr/staff/${s.id}?edit=1`)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><Edit3 size={13} /></button></div></td></tr>)}</tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E" }}>Add Staff Member</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>First Name</label><input value={form.firstName} onChange={e => setForm(p => ({ ...p, firstName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Last Name</label><input value={form.lastName} onChange={e => setForm(p => ({ ...p, lastName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Email</label><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="name@grandpalms.ng" className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Role</label><Sel options={roles.map(r => ({ value: r.id, label: r.name }))} value={form.role} onChange={v => setForm(p => ({ ...p, role: v }))} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Department</label><Sel options={HR_DEPARTMENTS} value={form.department} onChange={v => setForm(p => ({ ...p, department: v }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Phone</label><input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Monthly Pay (₦)</label><input type="number" value={form.payRate} onChange={e => setForm(p => ({ ...p, payRate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Contract Type</label><Sel options={["Full-time", "Part-time", "Contract"]} value={form.contractType} onChange={v => setForm(p => ({ ...p, contractType: v }))} /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={create} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Add Staff Member</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
