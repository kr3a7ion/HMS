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

// MX-01, MX-03. Priority/status color maps (priC/woC from data.tsx) use
// Title Case keys ("Reported", "High") — real data comes back lowercase
// from the API, so map through WO_STATUS_LABEL/WO_PRIORITY_LABEL below
// rather than changing the shared color maps other mock screens still use.
const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = { reported: "Reported", assigned: "Assigned", in_progress: "In Progress", completed: "Completed" };
const WO_PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export function WorkOrderDetail({ add }: { add: AddToast }) {
  const params = useParams();
  const navigate = useNavigate();
  const [wo, setWo] = useState<ApiWorkOrderDetail | null>(null);
  const [technicians, setTechnicians] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);

  const load = () => {
    if (!params.id) return;
    setLoading(true); setError("");
    Promise.all([maintenanceApi.get(params.id), usersApi.list("MX")])
      .then(([w, techs]) => { setWo(w); setTechnicians(techs); })
      .catch(() => setError("Couldn't load this work order."))
      .finally(() => setLoading(false));
  };
  useEffect(load, [params.id]);

  const setStatus = async (status: WorkOrderStatus) => {
    if (!wo) return;
    try {
      await maintenanceApi.setStatus(wo.id, status);
      add({ type: "success", title: `Status → ${WO_STATUS_LABEL[status]}` });
      load();
    } catch {
      add({ type: "error", title: "Couldn't update status" });
    }
  };

  const assign = async (technicianId: string) => {
    if (!wo || !technicianId) return;
    try {
      await maintenanceApi.assign(wo.id, technicianId);
      add({ type: "success", title: "Technician assigned" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't assign technician" });
    }
  };

  const postNote = async () => {
    if (!wo || !note.trim()) return;
    setPosting(true);
    try {
      await maintenanceApi.addNote(wo.id, note.trim());
      setNote("");
      add({ type: "success", title: "Update posted" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't post update" });
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;
  if (error || !wo) return <div className="p-5"><EmptyState icon={AlertCircle} message={error || "Work order not found."} /></div>;

  return (
    <div>
      <PageHeader title={`Work Order — ${wo.location}`} sub={`${wo.category} · Created ${new Date(wo.createdAt).toLocaleString()}`}
        actions={wo.status !== "completed" ? <BtnP label="Close Order" icon={CheckCircle2} onClick={() => setStatus("completed")} /> : undefined} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[["Location", wo.location], ["Category", wo.category], ["Priority", WO_PRIORITY_LABEL[wo.priority]], ["Status", WO_STATUS_LABEL[wo.status]], ["Assigned To", wo.technician ? `${wo.technician.firstName} ${wo.technician.lastName}` : "Unassigned"], ["Closed", wo.closedAt ? new Date(wo.closedAt).toLocaleString() : "—"]].map(([k, v]) => <div key={k}><div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: MUTED }}>{k}</div><div className="text-sm font-semibold" style={{ color: k === "Priority" ? priC[v as string] : TEXT }}>{v as string}</div></div>)}
            </div>
            <div><div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: MUTED }}>Description</div><p className="text-sm" style={{ color: TEXT }}>{wo.description}</p></div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Activity Log</h3>
            <div className="space-y-4">{wo.events.map((t, i) => <div key={t.id} className="flex gap-3"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: PRIMARY }} />{i < wo.events.length - 1 && <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: BORDER }} />}</div><div className="pb-4 flex-1"><div className="flex items-baseline gap-2"><span className="text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{new Date(t.createdAt).toLocaleString()}</span><span className="text-xs font-semibold" style={{ color: PRIMARY }}>{t.eventType.replace("_", " ")}</span></div>{t.note && <p className="text-sm mt-0.5" style={{ color: TEXT }}>{t.note}</p>}<div className="text-xs mt-0.5" style={{ color: MUTED }}>by {t.performedByFirstName} {t.performedByLastName}</div></div></div>)}
            </div>
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
              <textarea value={note} onChange={e => setNote(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none mb-2" rows={2} placeholder="Add note or update…" style={{ borderColor: BORDER }} />
              <BtnP label={posting ? "Posting…" : "Post Update"} icon={Send} onClick={postNote} />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Update Status</h3>
            <div className="space-y-2">{(["reported", "assigned", "in_progress", "completed"] as const).map(s => <button key={s} onClick={() => setStatus(s)} className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-sm font-medium" style={{ borderColor: s === wo.status ? PRIMARY : BORDER, backgroundColor: s === wo.status ? "#EFF6FF" : "white", color: s === wo.status ? PRIMARY : MUTED }}><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: woC[WO_STATUS_LABEL[s]]?.text ?? SUBTLE }} />{WO_STATUS_LABEL[s]}</button>)}</div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Technician</h3>
            <select defaultValue={wo.assignedTechnicianId ?? ""} onChange={e => assign(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
              <option value="">Unassigned</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
