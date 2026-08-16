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

// HK-01. Real rooms with real housekeepingStatus; cycling to Clean/Inspected
// while the room's booking status is "cleaning" (set by FD-02 checkout)
// flips it back to "available" server-side -- Front Desk actually depends
// on this now (check-in requires Clean/Inspected, see reservations.ts).
const HK_LABELS: Record<HkRoom["housekeepingStatus"], string> = { dirty: "Dirty", in_progress: "In Progress", clean: "Clean", inspected: "Inspected" };
const HK_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  dirty: { bg: "#FEE2E2", text: "#991B1B" }, in_progress: { bg: "#FEF3C7", text: "#92400E" },
  clean: { bg: "#FEF9C3", text: "#713F12" }, inspected: { bg: "#DCFCE7", text: "#166534" },
};

export function HKBoard({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"All" | HkRoom["housekeepingStatus"]>("All");
  const [rooms, setRooms] = useState<HkRoom[]>([]);
  const [attendants, setAttendants] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assigningRoom, setAssigningRoom] = useState<string | null>(null);

  const load = () => {
    setLoading(true); setError("");
    Promise.all([housekeepingApi.listRooms(), usersApi.list("HK")])
      .then(([r, a]) => { setRooms(r); setAttendants(a); })
      .catch(() => setError("Couldn't load the housekeeping board from the local server."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const visible = filter === "All" ? rooms : rooms.filter(r => r.housekeepingStatus === filter);
  const counts = {
    dirty: rooms.filter(r => r.housekeepingStatus === "dirty").length,
    in_progress: rooms.filter(r => r.housekeepingStatus === "in_progress").length,
    clean: rooms.filter(r => r.housekeepingStatus === "clean").length,
    inspected: rooms.filter(r => r.housekeepingStatus === "inspected").length,
  };

  const cycle = async (room: HkRoom) => {
    const order: HkRoom["housekeepingStatus"][] = ["dirty", "in_progress", "clean", "inspected"];
    const next = order[(order.indexOf(room.housekeepingStatus) + 1) % order.length];
    try {
      const updated = await housekeepingApi.setStatus(room.id, next);
      setRooms(rs => rs.map(r => r.id === room.id ? updated : r));
      add({ type: "success", title: `Room ${room.number} → ${HK_LABELS[next]}`, body: next === "inspected" ? "Room ready for check-in" : undefined });
    } catch {
      add({ type: "error", title: "Couldn't update room status" });
    }
  };

  const assign = async (roomId: string, attendantId: string | null) => {
    try {
      const updated = await housekeepingApi.assign(roomId, attendantId);
      setRooms(rs => rs.map(r => r.id === roomId ? updated : r));
      setAssigningRoom(null);
    } catch {
      add({ type: "error", title: "Couldn't assign attendant" });
    }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Housekeeping Board" sub={error || "Master room status — click Update to cycle status for real"}
        actions={<BtnO label="Schedule" icon={CalendarDays} onClick={() => navigate("/housekeeping/schedule")} />} />
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[{ l: "To Clean", v: counts.dirty, c: ERROR, bg: "#FEF2F2" }, { l: "In Progress", v: counts.in_progress, c: ORANGE, bg: "#FFF7ED" }, { l: "Clean", v: counts.clean, c: "#F59E0B", bg: "#FFFBEB" }, { l: "Inspected / Ready", v: counts.inspected, c: SUCCESS, bg: "#F0FDF4" }].map(s => (
          <div key={s.l} className="rounded-2xl p-4 border text-center transition-all" style={{ backgroundColor: s.bg, borderColor: `${s.c}25`, boxShadow: "0 2px 8px rgba(13,27,46,0.05)" }}>
            <div className="text-3xl font-bold" style={{ color: s.c, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>{s.v}</div>
            <div className="text-xs font-semibold mt-1" style={{ color: s.c, opacity: 0.8 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["All", "dirty", "in_progress", "clean", "inspected"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={{ backgroundColor: filter === s ? PRIMARY : "white", color: filter === s ? "white" : MUTED, borderColor: filter === s ? PRIMARY : BORDER, boxShadow: filter === s ? `0 2px 8px ${PRIMARY}40` : undefined }}>
            {s === "All" ? "All" : HK_LABELS[s]}
          </button>
        ))}
      </div>
      {rooms.length === 0 ? <EmptyState icon={BedDouble} message="No rooms configured for this branch yet." /> : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visible.map(r => {
            const nextLabel = HK_LABELS[(["dirty", "in_progress", "clean", "inspected"] as const)[(["dirty", "in_progress", "clean", "inspected"].indexOf(r.housekeepingStatus) + 1) % 4]];
            return (
              <div key={r.id} className="bg-white rounded-2xl border p-4 hover:shadow-md transition-all duration-200" style={{ borderColor: r.priority ? `${ORANGE}50` : BORDER, borderWidth: r.priority ? 2 : 1 }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>{r.number}</span>
                      {r.priority && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>PRIORITY</span>}
                      {r.dnd && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#374151" }}>DND</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>{r.type} · Floor {r.floor}</div>
                  </div>
                  <Badge label={HK_LABELS[r.housekeepingStatus]} colors={HK_BADGE_COLORS[r.housekeepingStatus]} />
                </div>
                <div className="text-xs mb-3 font-medium" style={{ color: r.assignedAttendantId ? MUTED : ERROR }}>
                  {r.assignedAttendantId ? `${r.attendantFirstName} ${r.attendantLastName}` : "⚠ Unassigned"}
                </div>
                {assigningRoom === r.id ? (
                  <select autoFocus defaultValue={r.assignedAttendantId ?? ""} onChange={e => assign(r.id, e.target.value || null)} onBlur={() => setAssigningRoom(null)}
                    className="w-full px-2 py-2 rounded-xl text-xs border" style={{ borderColor: BORDER, color: TEXT }}>
                    <option value="">Unassigned</option>
                    {attendants.map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>)}
                  </select>
                ) : (
                  <div className="flex gap-1.5">
                    <button onClick={() => cycle(r)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all hover:shadow-sm"
                      style={{ color: PRIMARY, borderColor: `${PRIMARY}30`, backgroundColor: "#F0F6FF" }}>
                      → {nextLabel}
                    </button>
                    <button onClick={() => setAssigningRoom(r.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all hover:bg-[#F8FAFC]"
                      style={{ color: MUTED, borderColor: BORDER }}>
                      Assign
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
