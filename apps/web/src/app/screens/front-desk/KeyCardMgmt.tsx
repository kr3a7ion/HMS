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
  doorLockApi, type AccessCredential,
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

// FD-09 ("the basic hardware management screen; the full access credential
// tracking lives in FD-12 and FD-13" -- Blueprint). Real data via GET
// /door-lock/credentials, grouped by room. The encoder status banner is
// honest about what's real here: there's no physical USB card encoder in
// this environment (see readCardSerialFromEncoder() in
// server/src/services/locks/access.ts) -- shown as a real "not connected"
// state rather than a fake green "Connected" dot, since claiming hardware
// presence that doesn't exist would be exactly the kind of thing this
// codebase has been careful not to do elsewhere. Encoding itself still
// works end-to-end against the real TTLock API using a placeholder serial
// in the encoder's place. Per-card "Deactivate Lost" lives in Room Access
// Management (FD-12), which already has it correctly scoped to one card
// at a time -- this screen links there rather than guessing which of a
// room's cards a room-level click should target.
interface RoomCardGroup { roomId: string; roomNumber: string; guestName: string; reservationId: string; count: number; lastIssued: string; lastIssuedBy: string }

export function KeyCardMgmt({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [creds, setCreds] = useState<AccessCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRoom, setBusyRoom] = useState<string | null>(null);

  const load = () => doorLockApi.credentials("active").then(rows => setCreds(rows.filter(r => r.credentialType === "card"))).catch(() => add({ type: "error", title: "Couldn't load key cards" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const groups: RoomCardGroup[] = Array.from(
    creds.reduce((map, c) => {
      const existing = map.get(c.roomId);
      if (!existing || new Date(c.issuedAt) > new Date(existing.lastIssued)) {
        map.set(c.roomId, { roomId: c.roomId, roomNumber: c.roomNumber, guestName: c.guestName, reservationId: c.reservationId, count: (existing?.count ?? 0) + 1, lastIssued: c.issuedAt, lastIssuedBy: c.issuedByName });
      } else {
        map.set(c.roomId, { ...existing, count: existing.count + 1 });
      }
      return map;
    }, new Map<string, RoomCardGroup>()).values()
  );

  const encodeNew = async (g: RoomCardGroup) => {
    setBusyRoom(g.roomId);
    try {
      const result = await doorLockApi.issue({ reservationId: g.reservationId, credentialType: "card", isDuplicate: true });
      add({ type: result.status === "active" ? "success" : "warning", title: result.status === "active" ? `Card encoded — Room ${g.roomNumber}` : `Card queued — Room ${g.roomNumber}`, body: result.status === "pending_sync" ? "TTLock unreachable; will activate once connectivity returns." : undefined });
      load();
    } catch { add({ type: "error", title: "Couldn't encode card" }); }
    finally { setBusyRoom(null); }
  };

  return (
    <div>
      <PageHeader title="Key Card Management" sub="Issue, re-encode, and deactivate physical room key cards" />
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: WARNING }} /><span className="text-sm font-medium" style={{ color: "#92400E" }}>No USB card encoder detected</span></div>
        <span className="text-xs" style={{ color: "#92400E" }}>Card Encoder Agent hardware isn't installed in this environment — encoding still registers a real card with TTLock using a placeholder serial.</span>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Active Key Cards</h3></div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : groups.length === 0 ? <EmptyState icon={CreditCard} message="No key cards issued right now." /> : (
          <table className="w-full">
            <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "Cards Issued", "Last Issued", "By", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{groups.map(g => (
              <tr key={g.roomId} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
                <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{g.roomNumber}</td>
                <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{g.guestName}</td>
                <td className="px-5 py-3"><span className="text-xl font-bold" style={{ color: TEXT }}>{g.count}</span></td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{new Date(g.lastIssued).toLocaleString()}</td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{g.lastIssuedBy}</td>
                <td className="px-5 py-3"><div className="flex gap-1">
                  <button onClick={() => encodeNew(g)} disabled={busyRoom === g.roomId} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium disabled:opacity-40" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Encode New</button>
                  <button onClick={() => navigate("/front-desk/room-access")} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Deactivate…</button>
                  <button onClick={() => navigate("/front-desk/key-card-log")} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>History</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
