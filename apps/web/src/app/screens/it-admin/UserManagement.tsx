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
  adminApi, type AdminUser, type SystemHealth as SystemHealthData, type DiagnosticsResult, type RoleSummary,
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

const staffStatusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "#DCFCE7", text: "#166534" }, suspended: { bg: "#FEF3C7", text: "#92400E" }, deactivated: { bg: "#FEE2E2", text: "#991B1B" },
};

export function UserManagement({ add }: { add: AddToast }) {
  const [userList, setUserList] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: "", firstName: "", lastName: "", role: "FD" });
  const [roleEdit, setRoleEdit] = useState<AdminUser | null>(null);
  const [newRole, setNewRole] = useState("FD");
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const roleName = (id: string) => roles.find(r => r.id === id)?.name ?? id;

  const load = () => adminApi.listUsers().then(setUserList).catch(() => add({ type: "error", title: "Couldn't load users" })).finally(() => setLoading(false));
  useEffect(() => { load(); hrApi.listRoles().then(setRoles).catch(() => {}); }, []);

  const sendInvite = async () => {
    if (!invite.email.trim() || !invite.firstName.trim() || !invite.lastName.trim()) { add({ type: "error", title: "Email, first name, and last name are required" }); return; }
    try {
      const res = await adminApi.inviteUser(invite);
      add({ type: "success", title: `${invite.firstName} ${invite.lastName} invited — ${res.employeeId}`, body: `Temp password: ${res.tempPassword}` });
      setShowInvite(false);
      setInvite({ email: "", firstName: "", lastName: "", role: "FD" });
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Couldn't invite user" }); }
  };

  const resetPw = async (u: AdminUser) => {
    try {
      const res = await adminApi.resetPassword(u.id);
      add({ type: "success", title: `Password reset for ${u.firstName} ${u.lastName}`, body: `Temp password: ${res.tempPassword}` });
    } catch { add({ type: "error", title: "Couldn't reset password" }); }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      if (u.status === "active") { await adminApi.deactivateUser(u.id); add({ type: "warning", title: `${u.firstName} ${u.lastName} deactivated` }); }
      else { await adminApi.reactivateUser(u.id); add({ type: "success", title: `${u.firstName} ${u.lastName} reactivated` }); }
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't update account status" }); }
  };

  const saveRole = async () => {
    if (!roleEdit) return;
    try {
      await adminApi.changeRole(roleEdit.id, newRole);
      add({ type: "success", title: "Role updated" });
      setRoleEdit(null);
      setLoading(true); load();
    } catch { add({ type: "error", title: "Couldn't change role" }); }
  };

  const filtered = userList.filter(u =>
    (roleFilter === "All Roles" || u.role === roleFilter) &&
    (statusFilter === "All Status" || u.status === statusFilter.toLowerCase()) &&
    (search === "" || `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())));

  const exportCsv = () => {
    const header = "First Name,Last Name,Email,Role,Department,Status,Last Login";
    const rows = filtered.map(u => [u.firstName, u.lastName, u.email, roleName(u.role), u.department ?? "", u.status, u.lastLogin ? new Date(u.lastLogin).toISOString() : ""].join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `user-accounts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="User Management" sub={loading ? "Loading…" : `${userList.length} accounts`} actions={<><BtnO label="Export" icon={Download} onClick={exportCsv} /><BtnP label="Invite New User" icon={Plus} onClick={() => setShowInvite(true)} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative flex-1 max-w-xs"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-full" style={{ borderColor: BORDER }} /></div>
          <Sel options={[{ value: "All Roles", label: "All Roles" }, ...roles.map(r => ({ value: r.id, label: r.name }))]} value={roleFilter} onChange={setRoleFilter} />
          <Sel options={["All Status", "Active", "Suspended", "Deactivated"]} value={statusFilter} onChange={setStatusFilter} />
        </div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : filtered.length === 0 ? <EmptyState icon={Users} message="No accounts match." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["User", "Email", "Role", "Department", "Status", "Last Login", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(u => <tr key={u.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{u.firstName[0]}{u.lastName[0]}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{u.firstName} {u.lastName}</span></div></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{u.email}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{roleName(u.role)}</span></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{u.department ?? "—"}</td><td className="px-5 py-3"><Badge label={u.status} colors={staffStatusColors[u.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "Never"}</td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => { setRoleEdit(u); setNewRole(u.role); }} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Edit Role</button><button onClick={() => resetPw(u)} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Reset PW</button><button onClick={() => toggleActive(u)} className="text-xs px-2 py-1 rounded border" style={u.status === "active" ? { color: ERROR, borderColor: `${ERROR}20` } : { color: SUCCESS, borderColor: `${SUCCESS}30` }}>{u.status === "active" ? "Deactivate" : "Reactivate"}</button></div></td></tr>)}</tbody>
          </table>
        )}
      </div>

      {showInvite && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowInvite(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E" }}>Invite New User</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>First Name</label><input value={invite.firstName} onChange={e => setInvite(p => ({ ...p, firstName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Last Name</label><input value={invite.lastName} onChange={e => setInvite(p => ({ ...p, lastName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Email</label><input type="email" value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))} placeholder="name@grandpalms.ng" className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Role</label><Sel options={roles.map(r => ({ value: r.id, label: r.name }))} value={invite.role} onChange={v => setInvite(p => ({ ...p, role: v }))} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={sendInvite} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Send Invite</button>
            </div>
          </div>
        </>
      )}

      {roleEdit && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setRoleEdit(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-4" style={{ color: "#0D1B2E" }}>Edit Role — {roleEdit.firstName} {roleEdit.lastName}</h3>
            <Sel options={roles.map(r => ({ value: r.id, label: r.name }))} value={newRole} onChange={setNewRole} />
            <div className="flex gap-3 mt-5">
              <button onClick={() => setRoleEdit(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={saveRole} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
