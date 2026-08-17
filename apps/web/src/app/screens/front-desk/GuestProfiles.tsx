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
  type GuestWithStats,
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

/** Initials for the avatar chip. */
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

// FD-06 Guest Profiles — wired to GET /guests?withStats=true.
//
// The list was seven hardcoded guests declared inside the component. The
// endpoint returned only the guest record, so the stay counts, last-stay
// dates and balances this screen displays had nowhere to come from; that
// enrichment was added server-side alongside this (see routes/guests.ts) and
// is opt-in so the type-ahead picker does not pay for it.
//
// "Merge Duplicates" and "New Guest Profile" had no handlers. New Guest
// Profile now opens the booking flow, which is where a guest record is
// actually created. Merge has no endpoint and says so rather than pretending.
//
// THE "TAGS" COLUMN HAS NO BACKING FIELD. The mock carried "Regular",
// "Corporate", "VIP" strings; `guests` has a `vip` boolean and nothing else.
// The column stays and shows the VIP tag it can prove, rather than being
// dropped or filled with invented segments.
export function GuestProfiles({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("All");
  const [guests, setGuests] = useState<GuestWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    guestsApi.listWithStats({ limit: 200 })
      .then(setGuests)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const nameOf = (g: GuestWithStats) => `${g.firstName} ${g.lastName}`.trim();

  const counts = {
    vip: guests.filter(g => g.vip).length,
    active: guests.filter(g => g.activeStay).length,
    balance: guests.filter(g => g.balanceKobo > 0).length,
    blacklisted: guests.filter(g => g.blacklisted).length,
  };

  const filtered = guests.filter(g => {
    if (search) {
      const q = search.toLowerCase();
      const hit = nameOf(g).toLowerCase().includes(q)
        || g.id.toLowerCase().includes(q)
        || (g.phone ?? "").includes(search);
      if (!hit) return false;
    }
    if (filterTab === "VIP") return g.vip;
    if (filterTab === "Active Stay") return g.activeStay;
    if (filterTab === "Has Balance") return g.balanceKobo > 0;
    // Blacklisted is a real column on `guests`, so this tab is real now — it
    // returned a hardcoded false in the mock.
    if (filterTab === "Blacklisted") return g.blacklisted;
    return true;
  });

  return (
    <div>
      <PageHeader title="Guest Profiles"
        sub={loading ? "Loading…" : `${filtered.length} of ${guests.length} profiles shown`}
        actions={<>
          <BtnO label="Merge Duplicates" icon={Layers} onClick={() => add({ type: "info", title: "Not available yet — merging guest records needs a server-side endpoint" })} />
          <BtnP label="New Guest Profile" icon={Plus} onClick={() => navigate("/reservations/new")} />
        </>} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b flex-wrap" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, or ID…" className="pl-7 pr-3 py-1.5 text-xs rounded-xl border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          {["All", "VIP", "Active Stay", "Has Balance", "Blacklisted"].map(f => (
            <button key={f} onClick={() => setFilterTab(f)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all"
              style={{ borderColor: filterTab === f ? PRIMARY : BORDER, backgroundColor: filterTab === f ? PRIMARY : "white", color: filterTab === f ? "white" : MUTED }}>
              {f}
              {f === "VIP" && <span className="ml-1 opacity-70">{counts.vip}</span>}
              {f === "Active Stay" && <span className="ml-1 opacity-70">{counts.active}</span>}
              {f === "Has Balance" && <span className="ml-1 opacity-70">{counts.balance}</span>}
              {f === "Blacklisted" && counts.blacklisted > 0 && <span className="ml-1 opacity-70">{counts.blacklisted}</span>}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: SUBTLE }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="p-1">
          <AsyncBoundary loading={loading} error={error} onRetry={load} skeletonRows={6}>
            <table className="w-full">
              <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Guest", "Phone", "Total Stays", "Last Stay", "Balance", "Tags", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={Users} message={filterTab === "Blacklisted" ? "No blacklisted guests on record." : `No guests match “${search || filterTab}”`} /></td></tr>
                ) : filtered.map((g, i) => (
                  <tr key={g.id} onClick={() => navigate(`/front-desk/guests/${g.id}`)} className="border-t hover:bg-[#F8FAFC] cursor-pointer transition-colors" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: g.vip ? ORANGE : PRIMARY }}>{initials(nameOf(g))}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold" style={{ color: TEXT }}>{nameOf(g)}</span>
                            {g.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}
                            {g.activeStay && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "#DCFCE7", color: "#166534" }}>In-house</span>}
                            {g.blacklisted && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>Blacklisted</span>}
                          </div>
                          <span className="text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{g.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: MUTED }}>{g.phone ?? "—"}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{g.totalStays}</td>
                    <td className="px-5 py-3.5 text-sm" style={{ color: MUTED }}>{g.lastStayAt ? g.lastStayAt.slice(0, 10) : "—"}</td>
                    <td className="px-5 py-3.5">{g.balanceKobo > 0 ? <MoneyText kobo={g.balanceKobo} className="text-sm font-bold" /> : <span className="text-xs" style={{ color: SUBTLE }}>—</span>}</td>
                    {/* No segment/tag field exists on `guests` — only `vip`. */}
                    <td className="px-5 py-3.5">{g.vip ? <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "#FFF7ED", color: ORANGE }}>VIP</span> : <span className="text-xs" style={{ color: SUBTLE }} title="Guest segments aren't recorded yet">—</span>}</td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/front-desk/guests/${g.id}`)} className="text-xs px-2.5 py-1.5 rounded-xl border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button>
                        <button onClick={() => navigate(`/reservations/new?guestId=${g.id}`)} className="text-xs px-2.5 py-1.5 rounded-xl border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Reserve</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AsyncBoundary>
        </div>
      </div>
    </div>
  );
}
