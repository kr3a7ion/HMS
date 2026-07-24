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

export function CheckOut({ add }: { add: AddToast }) {
  const params = useParams();
  const navigate = useNavigate();
  const reservationId = params.reservationId;

  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [checkedIn, setCheckedIn] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cash, setCash] = useState("0");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [settling, setSettling] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    if (reservationId) {
      reservationsApi.get(reservationId).then(setDetail).catch(() => setError("Couldn't load this reservation.")).finally(() => setLoading(false));
    } else {
      reservationsApi.list().then(rows => setCheckedIn(rows.filter(r => r.status === "checked_in"))).catch(() => setError("Couldn't load in-house guests.")).finally(() => setLoading(false));
    }
  };
  useEffect(load, [reservationId]);

  if (loading) return <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  if (!reservationId) {
    return (
      <div>
        <PageHeader title="Check-Out & Settlement" sub="Select an in-house guest to check out" />
        {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: ERROR }}>{error}</div>}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          {checkedIn.length === 0 ? <EmptyState icon={KeyRound} message="No guests currently checked in." /> : checkedIn.map(r => (
            <button key={r.id} onClick={() => navigate(`/front-desk/check-out/${r.id}`)} className="w-full flex items-center justify-between px-5 py-3 border-b hover:bg-[#FAFBFD] text-left" style={{ borderColor: "#F1F5F9" }}>
              <span className="text-sm font-medium" style={{ color: TEXT }}>{r.guestFirstName} {r.guestLastName} · Room {r.roomNumber}</span>
              <span className="text-xs" style={{ color: MUTED }}>{new Date(r.checkOutDate).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (error || !detail) return <div className="p-5"><EmptyState icon={AlertCircle} message={error || "Reservation not found."} /></div>;

  const { folio } = detail;
  const settle = async () => {
    setSettling(true); setError("");
    try {
      await reservationsApi.checkOut(detail.id, Number(cash) > 0 ? { paymentAmount: Number(cash), paymentMethod: method } : undefined);
      add({ type: "success", title: "Check-out complete", body: `Room ${detail.room?.number} released to Housekeeping.` });
      navigate("/reservations/grid");
    } catch (err: any) {
      if (err?.code === "BALANCE_REMAINING") setError(`Balance of ₦${err.details?.balance?.toLocaleString?.() ?? err.details?.balance} still remains — collect payment before releasing the room.`);
      else setError("Couldn't complete check-out. Please try again.");
    } finally {
      setSettling(false);
    }
  };

  return (
    <div>
      <PageHeader title="Check-Out & Settlement" sub={`Room ${detail.room?.number ?? "—"} · ${detail.guest.firstName} ${detail.guest.lastName}`} />
      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: ERROR }}>{error}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Folio</h3></div>
            <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Category", "Description", "Qty", "Unit", "Amount"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
              <tbody>{folio.charges.length === 0
                ? <tr><td colSpan={5}><EmptyState icon={FileText} message="No charges posted yet." /></td></tr>
                : folio.charges.map(c => <tr key={c.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: MUTED }}>{c.category}</span></td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{c.description}</td><td className="px-4 py-3 text-sm text-center" style={{ color: MUTED }}>{c.quantity}</td><td className="px-4 py-3 text-sm" style={{ color: MUTED }}>₦{c.unitPrice.toLocaleString()}</td><td className="px-4 py-3 text-sm font-semibold" style={{ color: TEXT }}>₦{c.amount.toLocaleString()}</td></tr>)}
              </tbody>
            </table>
            <div className="px-5 py-4 border-t" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
              <div className="flex justify-end"><div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between"><span style={{ color: MUTED }}>Total charges</span><span>₦{folio.totalCharges.toLocaleString()}</span></div>
                <div className="flex justify-between"><span style={{ color: MUTED }}>Paid so far</span><span style={{ color: SUCCESS }}>−₦{folio.totalPaid.toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base pt-2 border-t" style={{ borderColor: BORDER, color: TEXT }}><span>Balance Due</span><span>₦{folio.balance.toLocaleString()}</span></div>
              </div></div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "#F0FDF4", border: `1px solid #BBF7D0` }}>
            <Lock size={16} style={{ color: SUCCESS, marginTop: 1 }} />
            <div><div className="text-sm font-semibold" style={{ color: SUCCESS }}>Room released to Housekeeping on settlement</div><div className="text-xs mt-0.5" style={{ color: "#065F46" }}>Door lock access revocation isn't wired yet — deferred to Phase 4.</div></div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Payment</h3>
            <div className="text-3xl font-bold mb-1" style={{ color: TEXT }}>₦{folio.balance.toLocaleString()}</div>
            <div className="text-xs mb-5" style={{ color: MUTED }}>Balance remaining</div>
            <div className="mb-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Amount Received (₦)</label><input type="number" value={cash} onChange={e => setCash(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            <div className="mb-4"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Method</label>
              <select value={method} onChange={e => setMethod(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                <option value="cash">Cash</option><option value="card">POS / Card</option><option value="transfer">Bank Transfer</option>
              </select>
            </div>
            <BtnP label={settling ? "Processing…" : "Settle & Release Room"} icon={CheckCircle2} onClick={settle} />
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Guest</h3>
            <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: PRIMARY }}>{detail.guest.firstName[0]}{detail.guest.lastName[0]}</div><div><div className="text-sm font-semibold" style={{ color: TEXT }}>{detail.guest.firstName} {detail.guest.lastName}</div><div className="text-xs" style={{ color: MUTED }}>Room {detail.room?.number} · {detail.guest.phone ?? "no phone on file"}</div></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
