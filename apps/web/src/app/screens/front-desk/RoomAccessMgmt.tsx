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

// FD-12. Real data via GET /door-lock/credentials?status=active, grouped by
// room client-side. "Revoke All" below is the same Emergency Revoke flow
// as Blueprint 6.8 (parallel TTLock calls, not sequential -- see
// revokeCredentialsForRoom in server/src/services/locks/access.ts).
interface RoomGroup { roomId: string; roomNumber: string; guestName: string; reservationId: string; validTo: string; cards: AccessCredential[]; pin: AccessCredential | null }

export function RoomAccessMgmt({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [creds, setCreds] = useState<AccessCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeRoom, setRevokeRoom] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [busyRoom, setBusyRoom] = useState<string | null>(null);
  const [newPin, setNewPin] = useState<{ room: string; pin: string } | null>(null);

  const load = () => doorLockApi.credentials("active").then(setCreds).catch(() => add({ type: "error", title: "Couldn't load access credentials" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const groups: RoomGroup[] = Array.from(
    creds.reduce((map, c) => {
      if (!map.has(c.roomId)) map.set(c.roomId, { roomId: c.roomId, roomNumber: c.roomNumber, guestName: c.guestName, reservationId: c.reservationId, validTo: c.validTo, cards: [], pin: null });
      const g = map.get(c.roomId)!;
      if (c.credentialType === "card") g.cards.push(c);
      else if (c.credentialType === "pin") g.pin = c;
      return map;
    }, new Map<string, RoomGroup>()).values()
  );

  const issueReplacementCard = async (g: RoomGroup) => {
    setBusyRoom(g.roomId);
    try {
      const result = await doorLockApi.issue({ reservationId: g.reservationId, credentialType: "card", isDuplicate: true });
      add({ type: result.status === "active" ? "success" : "warning", title: result.status === "active" ? `Replacement card encoded — Room ${g.roomNumber}` : `Card queued — Room ${g.roomNumber}`, body: result.status === "pending_sync" ? "TTLock unreachable; will activate once connectivity returns." : undefined });
      load();
    } catch { add({ type: "error", title: "Couldn't issue replacement card" }); }
    finally { setBusyRoom(null); }
  };

  const newPinFor = async (g: RoomGroup) => {
    setBusyRoom(g.roomId);
    try {
      if (g.pin) await doorLockApi.revoke(g.pin.id, "manual");
      const result = await doorLockApi.issue({ reservationId: g.reservationId, credentialType: "pin" });
      if (result.pin) setNewPin({ room: g.roomNumber, pin: result.pin });
      add({ type: result.status === "active" ? "success" : "warning", title: result.status === "active" ? `New PIN activated — Room ${g.roomNumber}` : `New PIN queued — Room ${g.roomNumber}` });
      load();
    } catch { add({ type: "error", title: "Couldn't generate new PIN" }); }
    finally { setBusyRoom(null); }
  };

  const confirmEmergencyRevoke = async () => {
    if (!revokeRoom || !revokeReason) return;
    setRevoking(true);
    try {
      const result = await doorLockApi.revokeRoom(revokeRoom, revokeReason);
      add({ type: "error", title: `Emergency revoke — Room ${groups.find(g => g.roomId === revokeRoom)?.roomNumber}`, body: `${result.revoked} revoked, ${result.queued} queued for retry, ${result.failed} failed.` });
      setRevokeRoom(null); setRevokeReason(""); load();
    } catch { add({ type: "error", title: "Emergency revoke failed" }); }
    finally { setRevoking(false); }
  };

  return (
    <div>
      <PageHeader title="Room Access Management" sub="All active access credentials across the property · Door Lock" actions={<BtnO label="Key Card Log" icon={ClipboardList} onClick={() => navigate("/front-desk/key-card-log")} />} />
      {loading ? <div className="p-5"><div className="h-40 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : groups.length === 0 ? (
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={Lock} message="No active access credentials right now." /></div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.roomId} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <div className="flex items-start justify-between mb-4">
                <div><div className="flex items-center gap-3"><span className="text-xl font-bold" style={{ color: TEXT }}>Room {g.roomNumber}</span><Badge label="Active" colors={{ bg: "#DCFCE7", text: "#166534" }} /></div><div className="text-sm mt-0.5" style={{ color: MUTED }}>{g.guestName} · Valid until {new Date(g.validTo).toLocaleString()}</div></div>
                <button onClick={() => setRevokeRoom(g.roomId)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: ERROR }}><Lock size={14} />Revoke All</button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ backgroundColor: "#F8FAFC" }}>
                  <div className="flex items-center gap-2 mb-2"><CreditCard size={15} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>Key Cards ×{g.cards.length}</span></div>
                  {g.cards.length === 0 ? <p className="text-xs" style={{ color: SUBTLE }}>No key cards issued</p> : g.cards.map(c => <div key={c.id} className="flex items-center justify-between text-xs mb-1"><span style={{ color: MUTED, fontFamily: mono }}>{c.credentialReference}</span><span style={{ color: SUBTLE }}>Issued {new Date(c.issuedAt).toLocaleString()} by {c.issuedByName}</span></div>)}
                  <button onClick={() => issueReplacementCard(g)} disabled={busyRoom === g.roomId} className="mt-2 text-xs font-medium flex items-center gap-1 disabled:opacity-50" style={{ color: TEAL }}><Plus size={11} />Issue Replacement Card</button>
                </div>
                <div className="rounded-xl p-4" style={{ backgroundColor: "#F8FAFC" }}>
                  <div className="flex items-center gap-2 mb-2"><Hash size={15} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>PIN Code</span></div>
                  {!g.pin ? <p className="text-xs" style={{ color: SUBTLE }}>No PIN issued</p> : <><div className="flex items-center justify-between text-xs mb-1"><span className="font-mono text-lg font-bold" style={{ color: TEXT, letterSpacing: "0.15em" }}>{g.pin.credentialReference}</span><Badge label="Active" colors={{ bg: "#DCFCE7", text: "#166534" }} /></div><div className="text-xs" style={{ color: SUBTLE }}>Issued {new Date(g.pin.issuedAt).toLocaleString()} by {g.pin.issuedByName}</div></>}
                  <button onClick={() => newPinFor(g)} disabled={busyRoom === g.roomId} className="mt-2 text-xs font-medium flex items-center gap-1 disabled:opacity-50" style={{ color: TEAL }}><Plus size={11} />New PIN</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {revokeRoom && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <h2 className="text-base font-bold mb-1" style={{ color: ERROR }}>🚨 Emergency Room Access Revocation</h2>
            <p className="text-sm mb-4" style={{ color: MUTED }}>Room {groups.find(g => g.roomId === revokeRoom)?.roomNumber} — All active credentials will be deactivated immediately. Logged against your account.</p>
            <div className="space-y-2 mb-4">
              {["Security concern / suspected theft", "Guest dispute", "Incorrect room assigned", "Other"].map(r => <label key={r} className="flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer" style={{ borderColor: revokeReason === r ? ERROR : BORDER, backgroundColor: revokeReason === r ? "#FEF2F2" : "white" }}><div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: revokeReason === r ? ERROR : "#CBD5E1" }}>{revokeReason === r && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ERROR }} />}</div><input type="radio" className="hidden" onChange={() => setRevokeReason(r)} /><span className="text-sm" style={{ color: TEXT }}>{r}</span></label>)}
            </div>
            <p className="text-xs mb-4" style={{ color: ERROR }}>⚠ This action cannot be undone. All key cards and PINs will stop working immediately.</p>
            <div className="flex gap-3"><button onClick={() => { setRevokeRoom(null); setRevokeReason(""); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button><button onClick={confirmEmergencyRevoke} disabled={!revokeReason || revoking} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: ERROR }}>{revoking ? "Revoking…" : "Confirm Emergency Revoke"}</button></div>
          </div>
        </>
      )}
      {newPin && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" style={{ border: `1px solid ${BORDER}` }}>
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: SUCCESS }} />
            <h2 className="text-base font-bold mb-1" style={{ color: TEXT }}>PIN generated — Room {newPin.room}</h2>
            <p className="text-xs mb-4" style={{ color: MUTED }}>Show to guest now. Cannot be retrieved after this screen.</p>
            <div className="text-3xl font-bold py-4 rounded-xl mb-4" style={{ fontFamily: mono, color: TEXT, letterSpacing: "0.3em", backgroundColor: "#F8FAFC" }}>{newPin.pin}</div>
            <button onClick={() => setNewPin(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}
