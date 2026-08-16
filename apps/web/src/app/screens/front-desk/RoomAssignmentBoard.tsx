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
  ApiError, type AssignmentBoard,
} from "../../lib/api";
import {
  type Role, type Toast, type ToastType, type AddToast, fmtN, uid,
  mono, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  hkC, woC, priC, tblC, stC, roomStC, resStC,
  RES_GRID, IN_HOUSE, WORK_ORDERS,
  HK_ROOMS, FOLIO_CHARGES, MENU_ITEMS, MENU_CATS, TABLE_LAYOUT, STOCK, CHAT_MSGS,
  ALL_RES, ACCESS_CREDS, KEY_LOG, ACTIVE_PINS, LOST_FOUND, DND_ROOMS,
  INVOICES_DATA, AP_DATA, DEPT_PERMS, KDS_ORDERS,
  ASSETS, SUPPLIERS_DATA, PRODUCTS_DATA, STOCK_TXN, PO_DATA,
  HK_TASK_ROOMS, RATE_PLANS, WAITLIST_DATA, ROOM_SERVICE_ORDERS,
  DINING_RES, ANNOUNCE_DATA,
} from "../../data";
import {
  Badge, EmptyState, ToastC, LiveClock, SyncPill, StatCard, PageHeader, BtnP, BtnO, Inp, Sel, PlaceholderScreen,
} from "../../Screens";
import { AsyncBoundary } from "../../components/AsyncBoundary";
import { formatNaira } from "../../lib/money";

/** Initials for the avatar chip. */
function initials(name: string | null): string {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// FD-11 Room Assignment Board — wired to GET /rooms/assignment-board and
// POST /reservations/:id/assign-room (B10).
//
// One request returns every room with today's arrival, departure and occupant
// already attached, plus the unassigned arrivals that make this a work queue
// rather than a status display.
//
// A ROOM TYPE CHANGE IS ALLOWED, NOT REFUSED. The server accepts assigning a
// guest to a different type and records it as an upgrade or downgrade,
// because "what the guest pays after an upgrade is a commercial decision".
// So the preview says plainly when the selected room differs from what was
// booked, rather than the button failing and leaving the clerk guessing.
//
// AUTO-ASSIGN IS STILL NOT WIRED, deliberately. There is no server endpoint
// for it, and doing it in the browser would mean this component inventing the
// allocation policy — which room a VIP gets, whether the accessible room is
// held back, how an upgrade is priced. That belongs on the server with the
// rest of the commercial rules. The button keeps saying so rather than
// performing a naive match and calling it success.
export function RoomAssignmentBoard({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [board, setBoard] = useState<AssignmentBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    roomsApi.assignmentBoard()
      .then(setBoard)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const unassigned = board?.unassignedArrivals ?? [];

  // ASSIGNING IS A PLAN, NOT AN OCCUPANCY. The first version of this filter
  // also required the room to be clean or inspected, and on real data that
  // showed zero assignable rooms — both free rooms were mid-clean. That is
  // backwards: a front desk assigns rooms in the MORNING, which is exactly
  // when most of them are still dirty. The guest arrives at 2pm and the room
  // is turned by noon.
  //
  // So every free room is offered, and its housekeeping state is shown
  // instead of being used to hide it. The clerk decides; they are the one
  // who knows whether housekeeping will get to it in time.
  const HK_ORDER: Record<string, number> = { inspected: 0, clean: 1, in_progress: 2, dirty: 3 };
  const available = (board?.rooms ?? [])
    .filter(r => r.status === "available")
    .sort((a, b) => (HK_ORDER[a.housekeepingStatus] ?? 9) - (HK_ORDER[b.housekeepingStatus] ?? 9));

  const HK_STYLE: Record<string, { label: string; color: string }> = {
    inspected: { label: "Inspected", color: SUCCESS },
    clean: { label: "Clean", color: SUCCESS },
    in_progress: { label: "Being cleaned", color: WARNING },
    dirty: { label: "Dirty", color: ERROR },
  };

  const selArrival = unassigned.find(a => a.reservationId === sel) ?? null;
  const selRoomObj = available.find(r => r.roomId === selRoom) ?? null;
  const typeChanged = selArrival != null && selRoomObj != null
    && selRoomObj.roomTypeId != null
    && selRoomObj.roomTypeId !== (selArrival as { roomTypeId: string | null }).roomTypeId;

  const roomNotReady = selRoomObj != null
    && selRoomObj.housekeepingStatus !== "clean" && selRoomObj.housekeepingStatus !== "inspected";
  const warn = typeChanged || roomNotReady;

  const confirm = async () => {
    if (!sel || !selRoom) return;
    setSaving(true);
    try {
      const result = await roomsApi.assignRoom(sel, selRoom);
      // The server reports the rate the assigned type indicates. Surfacing it
      // is the difference between a clerk knowing an upgrade has a price and
      // finding out at checkout. It is indicative only — nothing is charged
      // here, and whether the guest pays it is someone's decision to make.
      const upgradeNote = result.typeChanged && result.indicativeRateKobo != null
        ? ` Type changed — this room indicates ${formatNaira(result.indicativeRateKobo)}/night.`
        : "";
      add({
        type: "success",
        title: "Room assigned",
        body: `${selArrival?.guestName ?? "Guest"} → Room ${result.assignedRoomNumber ?? selRoomObj?.number ?? ""}.${upgradeNote}`,
      });
      setSel(null);
      setSelRoom(null);
      load();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "Couldn't assign the room";
      add({ type: "error", title: "Assignment failed", body: code });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Room Assignment Board" sub="Assign unassigned arrivals to available rooms"
        actions={<BtnP label="Auto-Assign All" icon={Zap} onClick={() => add({ type: "info", title: "Not available yet — auto-assignment needs a server-side allocation rule" })} />} />
      <AsyncBoundary loading={loading} error={error} onRetry={load} skeletonRows={6}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}>
              <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Unassigned Arrivals ({unassigned.length})</h3>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>Select an arrival, then a room to assign</p>
            </div>
            <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>{unassigned.map(a => (
              <div key={a.reservationId} onClick={() => setSel(a.reservationId)}
                className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors"
                style={{ backgroundColor: sel === a.reservationId ? "#EFF6FF" : "white", borderLeft: sel === a.reservationId ? `3px solid ${PRIMARY}` : "3px solid transparent" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{initials(a.guestName)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: TEXT }}>{a.guestName ?? "—"}</span>
                    {a.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}
                  </div>
                  {/* ETA has no backing field yet — see B10.1 in the blueprint. */}
                  <div className="text-xs" style={{ color: MUTED }} title="Expected arrival time isn't recorded yet">
                    {a.roomTypeName ?? "Any type"} · ETA —
                  </div>
                </div>
                {sel === a.reservationId && <CheckCircle2 size={16} style={{ color: PRIMARY }} />}
              </div>
            ))}</div>
            {unassigned.length === 0 && <EmptyState icon={CheckCircle2} message="All arrivals are assigned." />}
          </div>

          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}>
              <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Available Rooms ({available.length})</h3>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>Free rooms, cleanest first</p>
            </div>
            {available.length === 0 ? (
              <EmptyState icon={BedDouble} message="No rooms are free." />
            ) : (
              <div className="grid grid-cols-3 gap-2 p-4">{available.map(r => (
                <div key={r.roomId} onClick={() => setSelRoom(r.roomId)}
                  className="p-3 rounded-xl border-2 cursor-pointer text-center transition-all"
                  style={{ borderColor: selRoom === r.roomId ? PRIMARY : BORDER, backgroundColor: selRoom === r.roomId ? "#EFF6FF" : "white" }}>
                  <div className="text-lg font-bold" style={{ color: TEXT }}>{r.number}</div>
                  <div className="text-xs" style={{ color: MUTED }}>{r.roomTypeName ?? r.type}</div>
                  <div className="text-xs" style={{ color: SUBTLE }}>Floor {r.floor ?? "—"}</div>
                  {/* Shown, not used to hide the room — the clerk decides
                      whether housekeeping will reach it before the guest. */}
                  <div className="text-[10px] mt-1 font-semibold" style={{ color: (HK_STYLE[r.housekeepingStatus] ?? { color: SUBTLE }).color }}>
                    {(HK_STYLE[r.housekeepingStatus] ?? { label: r.housekeepingStatus }).label}
                  </div>
                </div>
              ))}</div>
            )}
            {sel && selRoom && (
              <div className="px-5 pb-5">
                <div className="p-3 rounded-xl mb-3" style={{ backgroundColor: warn ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${warn ? "#FDE68A" : "#BBF7D0"}` }}>
                  <div className="text-xs font-semibold" style={{ color: warn ? "#92400E" : SUCCESS }}>Assignment Preview</div>
                  <div className="text-sm mt-1" style={{ color: TEXT }}>
                    {selArrival?.guestName ?? "Guest"} → Room {selRoomObj?.number ?? ""}
                  </div>
                  {selRoomObj != null && selRoomObj.housekeepingStatus !== "clean" && selRoomObj.housekeepingStatus !== "inspected" && (
                    <div className="text-xs mt-1" style={{ color: "#92400E" }}>
                      Room {selRoomObj.number} is {(HK_STYLE[selRoomObj.housekeepingStatus] ?? { label: selRoomObj.housekeepingStatus }).label.toLowerCase()} — it needs to be turned before the guest arrives.
                    </div>
                  )}
                  {typeChanged && (
                    <div className="text-xs mt-1" style={{ color: "#92400E" }}>
                      Different room type from the booking ({selArrival?.roomTypeName ?? "unspecified"} → {selRoomObj?.roomTypeName ?? "unspecified"}).
                      This is recorded as an upgrade or downgrade; any rate change is decided separately.
                    </div>
                  )}
                </div>
                <BtnP label={saving ? "Assigning…" : "Confirm Assignment"} icon={CheckCircle2} onClick={confirm} />
              </div>
            )}
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
