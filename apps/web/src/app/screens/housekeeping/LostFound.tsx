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

export function LostFound({ add }: { add: AddToast }) {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [filter, setFilter] = useState<"All" | LostFoundItem["status"]>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ description: "", locationFound: "" });
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimName, setClaimName] = useState("");

  const load = () => {
    setLoading(true); setError("");
    lostFoundApi.list().then(setItems).catch(() => setError("Couldn't load Lost & Found.")).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = filter === "All" ? items : items.filter(i => i.status === filter);
  const stC: Record<string, { bg: string; text: string }> = { held: { bg: "#FEF3C7", text: "#92400E" }, claimed: { bg: "#DCFCE7", text: "#166534" }, disposed: { bg: "#F3F4F6", text: "#374151" } };

  const logItem = async () => {
    if (!form.description.trim()) { add({ type: "warning", title: "Enter a description" }); return; }
    try {
      await lostFoundApi.create(form.description, form.locationFound || undefined);
      setShowNew(false); setForm({ description: "", locationFound: "" });
      add({ type: "success", title: "Item logged" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't log item" });
    }
  };

  const claim = async (id: string) => {
    if (!claimName.trim()) { add({ type: "warning", title: "Enter the claimant's name" }); return; }
    try {
      await lostFoundApi.claim(id, claimName);
      setClaimingId(null); setClaimName("");
      add({ type: "success", title: "Item marked claimed" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't mark claimed" });
    }
  };

  const dispose = async (id: string) => {
    try {
      await lostFoundApi.dispose(id, "Unclaimed / disposed by staff");
      add({ type: "info", title: "Item marked disposed" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't mark disposed" });
    }
  };

  if (loading) return <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Lost & Found" sub={error || `${items.length} items logged · ${items.filter(i => i.status === "held").length} currently held`} actions={<BtnP label="Log New Item" icon={Plus} onClick={() => setShowNew(true)} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          {(["All", "held", "claimed", "disposed"] as const).map(f => <button key={f} onClick={() => setFilter(f)} className="text-xs px-3 py-1.5 rounded-lg border capitalize" style={{ borderColor: filter === f ? PRIMARY : BORDER, backgroundColor: filter === f ? PRIMARY : "white", color: filter === f ? "white" : MUTED }}>{f}</button>)}
        </div>
        {filtered.length === 0 ? <EmptyState icon={Search} message="No items match this filter." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Description", "Location Found", "Date", "Logged By", "Claimed By", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(item => (
              <tr key={item.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
                <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{item.description}</td>
                <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{item.locationFound || "—"}</td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{new Date(item.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.loggedByFirstName} {item.loggedByLastName}</td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.claimedBy || "—"}</td>
                <td className="px-5 py-3"><Badge label={item.status} colors={stC[item.status]} /></td>
                <td className="px-5 py-3">
                  {item.status === "held" && (claimingId === item.id ? (
                    <div className="flex gap-1"><input autoFocus value={claimName} onChange={e => setClaimName(e.target.value)} placeholder="Claimant name" className="text-xs px-2 py-1 rounded border w-28" style={{ borderColor: BORDER }} /><button onClick={() => claim(item.id)} className="text-xs px-2 py-1 rounded border" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Save</button></div>
                  ) : (
                    <div className="flex gap-1"><button onClick={() => setClaimingId(item.id)} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Claim</button><button onClick={() => dispose(item.id)} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Dispose</button></div>
                  ))}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {showNew && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowNew(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5"><h3 className="text-base font-bold" style={{ color: TEXT }}>Log New Item</h3><button onClick={() => setShowNew(false)} style={{ color: SUBTLE }}><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Black leather wallet" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Location Found</label><input value={form.locationFound} onChange={e => setForm(p => ({ ...p, locationFound: e.target.value }))} placeholder="e.g. Room 204, under the bed" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} /></div>
            </div>
            <div className="flex gap-3 mt-5"><BtnO label="Cancel" onClick={() => setShowNew(false)} /><BtnP label="Log Item" icon={Plus} onClick={logItem} /></div>
          </div>
        </>
      )}
    </div>
  );
}
