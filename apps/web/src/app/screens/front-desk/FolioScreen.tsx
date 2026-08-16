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
import { toKobo, formatNaira } from "../../lib/money";

export function FolioScreen({ add }: { add: AddToast }) {
  const params = useParams();
  const navigate = useNavigate();
  const reservationId = params.reservationId;

  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [checkedIn, setCheckedIn] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCharge, setShowCharge] = useState(false);
  const [charge, setCharge] = useState({ category: "Restaurant", description: "", amount: "" });
  const [posting, setPosting] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    if (reservationId) {
      reservationsApi.get(reservationId).then(setDetail).catch(() => setError("Couldn't load this reservation.")).finally(() => setLoading(false));
    } else {
      reservationsApi.list().then(rows => setCheckedIn(rows.filter(r => r.status === "checked_in"))).catch(() => setError("Couldn't load in-house guests.")).finally(() => setLoading(false));
    }
  };
  useEffect(load, [reservationId]);

  const postCharge = async () => {
    if (!reservationId || !charge.description || !charge.amount) { add({ type: "warning", title: "Fill in description and amount" }); return; }
    setPosting(true);
    try {
      const folio = await reservationsApi.postCharge(reservationId, { category: charge.category, description: charge.description, unitPriceKobo: toKobo(Number(charge.amount)) });
      setDetail(d => d ? { ...d, folio } : d);
      setShowCharge(false);
      add({ type: "success", title: "Charge posted", body: `${charge.category} · ₦${Number(charge.amount).toLocaleString()}` });
      setCharge({ category: "Restaurant", description: "", amount: "" });
    } catch {
      add({ type: "error", title: "Couldn't post charge" });
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  if (!reservationId) {
    return (
      <div>
        <PageHeader title="Folio Management" sub="Select an in-house guest to view their folio" />
        {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: ERROR }}>{error}</div>}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          {checkedIn.length === 0 ? <EmptyState icon={FileText} message="No open folios — no guests currently checked in." /> : checkedIn.map(r => (
            <button key={r.id} onClick={() => navigate(`/front-desk/folio/${r.id}`)} className="w-full flex items-center justify-between px-5 py-3 border-b hover:bg-[#FAFBFD] text-left" style={{ borderColor: "#F1F5F9" }}>
              <span className="text-sm font-medium" style={{ color: TEXT }}>{r.guestFirstName} {r.guestLastName} · Room {r.roomNumber}</span>
              <span className="text-xs" style={{ color: MUTED }}>{new Date(r.checkInDate).toLocaleDateString()} → {new Date(r.checkOutDate).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (error || !detail) return <div className="p-5"><EmptyState icon={AlertCircle} message={error || "Reservation not found."} /></div>;
  const { folio } = detail;

  return (
    <div>
      <PageHeader title="Folio Management" sub={`${detail.guest.firstName} ${detail.guest.lastName} · Room ${detail.room?.number ?? "—"}`}
        actions={<><BtnO label="Proceed to Check-Out" icon={ArrowRight} onClick={() => navigate(`/front-desk/check-out/${detail.id}`)} /><BtnP label="Post Charge" icon={Plus} onClick={() => setShowCharge(true)} /></>} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Category", "Description", "Qty", "Unit", "Amount", "Posted"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>
            {folio.charges.length === 0 ? (
              <tr><td colSpan={6}><EmptyState icon={FileText} message="No charges posted yet — use Post Charge to add one." /></td></tr>
            ) : folio.charges.map(c => (
              <tr key={c.id} className="border-t hover:bg-[#F8FAFC]" style={{ borderColor: "#F1F5F9" }}>
                <td className="px-4 py-3.5"><span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: MUTED }}>{c.category}</span></td>
                <td className="px-4 py-3.5 text-sm" style={{ color: TEXT }}>{c.description}</td>
                <td className="px-4 py-3.5 text-sm" style={{ color: MUTED }}>{c.quantity}</td>
                <td className="px-4 py-3.5 text-sm" style={{ color: MUTED }}>{formatNaira(c.unitPriceKobo)}</td>
                <td className="px-4 py-3.5 text-sm font-bold" style={{ color: TEXT }}>{formatNaira(c.amountKobo)}</td>
                <td className="px-4 py-3.5 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{new Date(c.postedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-4 border-t flex justify-end" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
          <div className="w-64 space-y-1.5 text-sm">
            <div className="flex justify-between"><span style={{ color: MUTED }}>Total charges</span><span>{formatNaira(folio.totalChargesKobo)}</span></div>
            <div className="flex justify-between"><span style={{ color: MUTED }}>Paid</span><span style={{ color: SUCCESS }}>{formatNaira(folio.totalPaidKobo)}</span></div>
            <div className="flex justify-between font-bold text-base pt-2 border-t" style={{ borderColor: BORDER, color: TEXT }}><span>Balance</span><span>{formatNaira(folio.balanceKobo)}</span></div>
          </div>
        </div>
      </div>

      {showCharge && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCharge(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold" style={{ color: TEXT }}>Post Manual Charge</h3>
              <button onClick={() => setShowCharge(false)} style={{ color: SUBTLE }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Category</label>
                <select value={charge.category} onChange={e => setCharge(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                  {["Restaurant", "Bar", "Laundry", "Room Service", "Minibar", "Telephone", "Other"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Amount (₦)</label>
                <input type="number" value={charge.amount} onChange={e => setCharge(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Description</label>
                <input value={charge.description} onChange={e => setCharge(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Dinner for 2 — Table T06"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <BtnO label="Cancel" onClick={() => setShowCharge(false)} />
              <BtnP label={posting ? "Posting…" : "Post Charge"} icon={DollarSign} onClick={postCharge} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
