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
  type GuestDetail,
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
import { AsyncBoundary } from "../../components/AsyncBoundary";
import { MoneyText } from "../../components/Money";

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed", pending: "Pending", checked_in: "Checked In",
  checked_out: "Checked Out", no_show: "No Show", cancelled: "Cancelled",
};

// FD-06 Guest Profile Detail — wired to GET /guests/:id.
//
// This screen had NOWHERE TO READ FROM: there was no single-guest endpoint,
// so it rendered one hardcoded guest ("Dr. Chukwuemeka Bello") regardless of
// which row you clicked. GET /guests/:id was added for it (routes/guests.ts),
// returning the guest with stay history and totals.
//
// TWO OF THE FIVE TABS STILL HAVE NO DATA, and both keep their tab rather
// than being quietly removed:
//
//   Preferences  — `guests` has no preferences column at all. The mock's
//                  pillow type, wake-up call and newspaper were invented.
//                  Recording them is a schema change nobody has specified.
//   Complaints   — needs B28 (complaints & SLA engine), not built.
//
// Folios links out per stay rather than duplicating the folio screen.
export function GuestProfileDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [guest, setGuest] = useState<GuestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const tabs = ["Overview", "Stay History", "Preferences", "Folios", "Complaints & Feedback"];

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    guestsApi.get(id)
      .then(setGuest)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  if (loading || error || !guest) {
    return (
      <div>
        <PageHeader title="Guest Profile" sub="" />
        <AsyncBoundary loading={loading} error={error ?? (id ? null : new Error("No guest selected"))} onRetry={load} skeletonRows={6}>
          <EmptyState icon={Users} message="Guest not found." />
        </AsyncBoundary>
      </div>
    );
  }

  const name = `${guest.firstName} ${guest.lastName}`.trim();
  const currentStay = guest.stays.find(s => s.status === "checked_in") ?? null;
  const memberSince = new Date(guest.createdAt).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
  const idLabel = guest.idNumber ? `${guest.idType ?? "ID"} ${guest.idNumber}` : "—";

  return (
    <div>
      <PageHeader title={`Guest Profile — ${name}`}
        sub={`${guest.id} · ${guest.vip ? "VIP · " : ""}${guest.totalStays} stay${guest.totalStays === 1 ? "" : "s"}`}
        actions={<>
          <BtnO label="Create Reservation" icon={Plus} onClick={() => navigate(`/reservations/new?guestId=${guest.id}`)} />
          <BtnP label="Edit Profile" icon={Edit3} onClick={() => add({ type: "info", title: "Not available yet — editing a guest record needs a server-side endpoint" })} />
        </>} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-2" style={{ backgroundColor: guest.vip ? ORANGE : PRIMARY }}>{initials(name)}</div>
            <div className="flex items-center justify-center gap-1 mb-1"><span className="text-base font-bold" style={{ color: TEXT }}>{name}</span></div>
            {guest.vip && <><Star size={14} fill={ORANGE} style={{ color: ORANGE, display: "inline" }} /><span className="text-xs ml-1" style={{ color: MUTED }}>VIP Guest</span></>}
            {guest.blacklisted && <div className="text-xs mt-1 font-semibold" style={{ color: ERROR }}>Blacklisted</div>}
          </div>
          <div className="space-y-2 text-xs border-t pt-3" style={{ borderColor: "#F1F5F9" }}>
            {([
              ["Phone", guest.phone ?? "—"],
              ["Email", guest.email ?? "—"],
              ["ID", idLabel],
              ["Nationality", guest.nationality ?? "—"],
              ["Member Since", memberSince],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex flex-col"><span style={{ color: MUTED }}>{k}</span><span className="font-medium break-words" style={{ color: TEXT }}>{v}</span></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t text-center" style={{ borderColor: "#F1F5F9" }}>
            <div><div className="text-xl font-bold" style={{ color: PRIMARY }}>{guest.totalStays}</div><div className="text-xs" style={{ color: MUTED }}>Total Stays</div></div>
            <div><div className="text-xl font-bold" style={{ color: PRIMARY }}><MoneyText kobo={guest.lifetimeValueKobo} compact tabular={false} /></div><div className="text-xs" style={{ color: MUTED }}>Lifetime Value</div></div>
          </div>
        </div>

        {/* Main */}
        <div className="lg:col-span-3 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b overflow-x-auto" style={{ borderColor: BORDER }}>
            {tabs.map(t => <button key={t} onClick={() => setTab(t)} className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: tab === t ? PRIMARY : MUTED, borderBottom: tab === t ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{t}</button>)}
          </div>
          <div className="p-5">
            {tab === "Overview" && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}>
                  <div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Current Stay</div>
                  {currentStay ? (
                    <div className="text-sm" style={{ color: MUTED }}>
                      <span style={{ fontFamily: mono }}>{currentStay.id}</span>
                      {currentStay.roomNumber ? ` · Room ${currentStay.roomNumber}` : ""}
                      {` · ${currentStay.checkInDate.slice(0, 10)} – ${currentStay.checkOutDate.slice(0, 10)}`}
                      {` · ${STATUS_LABEL[currentStay.status] ?? currentStay.status}`}
                    </div>
                  ) : (
                    <div className="text-sm" style={{ color: MUTED }}>Not currently staying.</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Internal Notes</div>
                  <p className="text-sm" style={{ color: MUTED }}>{guest.notes ?? "No notes recorded for this guest."}</p>
                </div>
              </div>
            )}

            {tab === "Stay History" && (
              guest.stays.length === 0
                ? <EmptyState icon={CalendarCheck} message="No stays on record." />
                : <div className="space-y-2">{guest.stays.map(st => {
                    const label = STATUS_LABEL[st.status] ?? st.status;
                    return (
                      <div key={st.id} onClick={() => navigate(`/reservations/${st.id}`)} className="flex items-center gap-4 p-3 rounded-xl cursor-pointer hover:bg-[#F1F5F9]" style={{ backgroundColor: "#F8FAFC" }}>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium" style={{ color: TEXT }}>{st.checkInDate.slice(0, 10)} – {st.checkOutDate.slice(0, 10)}</div>
                          <div className="text-xs" style={{ color: MUTED }}>{st.roomNumber ? `Room ${st.roomNumber}` : "Unassigned"} · <span style={{ fontFamily: mono }}>{st.id}</span></div>
                        </div>
                        {/* The nightly rate, not a stay total — the folio is
                            the only thing that knows what was actually
                            charged, and it is one click away under Folios. */}
                        <div className="text-sm font-bold whitespace-nowrap" style={{ color: TEXT }}><MoneyText kobo={st.rateKobo} />/night</div>
                        <Badge label={label} colors={resStC[label] ?? { bg: "#F1F5F9", text: "#374151" }} />
                      </div>
                    );
                  })}</div>
            )}

            {tab === "Preferences" && (
              <EmptyState icon={Star}
                message="Guest preferences aren't recorded yet. Room, pillow, wake-up call and dietary preferences need a schema change before this tab can show anything." />
            )}

            {tab === "Folios" && (
              guest.stays.length === 0
                ? <div className="text-sm" style={{ color: MUTED }}>No folios — this guest has no stays.</div>
                : <div className="space-y-2">{guest.stays.map(st => (
                    <button key={st.id} onClick={() => navigate(`/front-desk/folio/${st.id}`)}
                      className="flex items-center gap-4 p-3 rounded-xl w-full text-left hover:bg-[#F1F5F9]" style={{ backgroundColor: "#F8FAFC" }}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: TEXT }}>{st.checkInDate.slice(0, 10)} – {st.checkOutDate.slice(0, 10)}</div>
                        <div className="text-xs" style={{ color: MUTED }}>{st.roomNumber ? `Room ${st.roomNumber}` : "Unassigned"}</div>
                      </div>
                      <span className="text-xs" style={{ color: TEAL }}>Open folio →</span>
                    </button>
                  ))}</div>
            )}

            {tab === "Complaints & Feedback" && (
              <EmptyState icon={MessageSquare}
                message="Complaints and feedback aren't tracked yet — this needs the complaints module (backend batch B28)." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
