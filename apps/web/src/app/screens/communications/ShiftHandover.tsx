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

export function ShiftHandover({ add }: { add: AddToast }) {
  const SECTION_FIELDS = [
    ["outstandingTasks", "Outstanding Tasks"], ["vipGuests", "VIP Guests In-House"],
    ["maintenanceIssues", "Maintenance Issues Open"], ["guestComplaints", "Guest Complaints in Progress"],
    ["pendingPayments", "Pending Payments"], ["generalNotes", "General Notes"],
  ] as const;

  const [history, setHistory] = useState<ShiftHandoverListItem[]>([]);
  const [viewing, setViewing] = useState<ShiftHandoverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [shiftName, setShiftName] = useState("Morning");
  const [form, setForm] = useState<Record<string, string>>({});

  const load = () => {
    setLoading(true);
    shiftHandoverApi.list().then(setHistory).catch(() => add({ type: "error", title: "Couldn't load handover history" })).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const submit = async () => {
    setCreating(true);
    try {
      await shiftHandoverApi.create({ shiftName, ...form });
      add({ type: "success", title: "Shift handover submitted" });
      setForm({});
      load();
    } catch {
      add({ type: "error", title: "Couldn't submit handover" });
    } finally {
      setCreating(false);
    }
  };

  const view = (id: string) => shiftHandoverApi.get(id).then(setViewing).catch(() => add({ type: "error", title: "Couldn't load handover" }));

  const acknowledge = async (id: string) => {
    try {
      await shiftHandoverApi.acknowledge(id);
      add({ type: "success", title: "Handover acknowledged" });
      view(id);
      load();
    } catch {
      add({ type: "error", title: "Couldn't acknowledge" });
    }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  if (viewing) {
    return (
      <div>
        <PageHeader title={`${viewing.shiftName} Shift Handover`} sub={`${viewing.outgoing?.firstName} ${viewing.outgoing?.lastName} · ${new Date(viewing.createdAt).toLocaleString()}`} actions={<BtnO label="Back to Handovers" icon={ArrowRight} onClick={() => setViewing(null)} />} />
        {viewing.acknowledgedAt ? (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5 text-sm font-medium" style={{ backgroundColor: "#DCFCE7", color: SUCCESS, border: `1px solid #BBF7D0` }}><CheckCircle2 size={15} />Acknowledged by {viewing.acknowledgedByUser?.firstName} {viewing.acknowledgedByUser?.lastName} · {new Date(viewing.acknowledgedAt).toLocaleString()}</div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl mb-5 text-sm font-medium" style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: `1px solid #FDE68A` }}>
            <span className="flex items-center gap-2"><Clock size={15} />Pending acknowledgement</span>
            <BtnP label="Acknowledge" icon={CheckCircle2} onClick={() => acknowledge(viewing.id)} />
          </div>
        )}
        <div className="space-y-4">
          {SECTION_FIELDS.map(([key, label]) => (
            <div key={key} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: TEXT }}>{label}</h3>
              <p className="text-sm" style={{ color: MUTED }}>{(viewing as any)[key] || "—"}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Shift Handover" sub="Structured handover notes between shift changes" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Shift</h3>
            <select value={shiftName} onChange={e => setShiftName(e.target.value)} className="px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
              <option>Morning</option><option>Evening</option><option>Night</option>
            </select>
          </div>
          {SECTION_FIELDS.map(([key, label]) => (
            <div key={key} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: TEXT }}>{label}</h3>
              <textarea value={form[key] ?? ""} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} style={{ borderColor: BORDER, color: TEXT }} />
            </div>
          ))}
          <BtnP label={creating ? "Submitting…" : "Submit Handover"} icon={CheckCircle2} onClick={submit} />
        </div>
        <div>
          <div className="bg-white rounded-xl border p-5 sticky top-4" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Previous Handovers</h3>
            {history.length === 0 ? <p className="text-xs" style={{ color: MUTED }}>No handovers logged yet.</p> : history.map(h => (
              <button key={h.id} onClick={() => view(h.id)} className="w-full flex items-center justify-between py-2 text-xs hover:text-[#0F172A] border-b" style={{ color: MUTED, borderColor: "#F1F5F9" }}>
                <span>{h.shiftName} · {new Date(h.createdAt).toLocaleDateString()} — {h.outgoingFirstName}</span>
                {h.acknowledgedAt ? <CheckCircle2 size={12} style={{ color: SUCCESS }} /> : <Clock size={12} style={{ color: WARNING }} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
