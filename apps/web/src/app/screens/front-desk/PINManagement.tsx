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

// FD-14. Real data via GET /door-lock/credentials?status=active, filtered
// to PINs. The original mock's "Reveal" button showed a hardcoded PIN for
// any room -- removed, not just left broken, because the real system
// never stores a plaintext PIN to reveal (Blueprint 6.4: "cannot be
// retrieved after this screen"). "New PIN" shows the freshly-generated
// plaintext exactly once, in the modal below, then it's gone for good --
// same as Check-In Step 7's PIN panel.
function pinStatus(validTo: string): { label: string; colors: { bg: string; text: string } } {
  const hoursLeft = (new Date(validTo).getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursLeft <= 0) return { label: "Expired", colors: { bg: "#F3F4F6", text: "#374151" } };
  if (hoursLeft <= 2) return { label: "Expiring", colors: { bg: "#FEF3C7", text: "#92400E" } };
  return { label: "Active", colors: { bg: "#DCFCE7", text: "#166534" } };
}

export function PINManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const navigate = useNavigate();
  const [pins, setPins] = useState<AccessCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPin, setNewPin] = useState<{ room: string; pin: string } | null>(null);
  const [busyRoom, setBusyRoom] = useState<string | null>(null);

  const load = () => doorLockApi.credentials("active").then(rows => setPins(rows.filter(r => r.credentialType === "pin"))).catch(() => add({ type: "error", title: "Couldn't load PINs" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const newPinFor = async (cred: AccessCredential) => {
    setBusyRoom(cred.roomId);
    try {
      await doorLockApi.revoke(cred.id, "manual");
      const result = await doorLockApi.issue({ reservationId: cred.reservationId, credentialType: "pin" });
      if (result.pin) setNewPin({ room: cred.roomNumber, pin: result.pin });
      add({ type: result.status === "active" ? "success" : "warning", title: result.status === "active" ? `New PIN activated — Room ${cred.roomNumber}` : `New PIN queued — Room ${cred.roomNumber}`, body: result.status === "pending_sync" ? "TTLock unreachable; will activate once connectivity returns." : undefined });
      load();
    } catch { add({ type: "error", title: "Couldn't generate new PIN" }); }
    finally { setBusyRoom(null); }
  };

  const revoke = async (cred: AccessCredential) => {
    setBusyRoom(cred.roomId);
    try { await doorLockApi.revoke(cred.id, "manual"); add({ type: "warning", title: `PIN revoked — Room ${cred.roomNumber}` }); load(); }
    catch { add({ type: "error", title: "Couldn't revoke PIN" }); }
    finally { setBusyRoom(null); }
  };

  return (
    <div>
      <PageHeader title="PIN Management" sub="All active PINs across the property · Door Lock" actions={<BtnO label="Key Card Log" icon={ClipboardList} onClick={() => navigate("/front-desk/key-card-log")} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : pins.length === 0 ? <EmptyState icon={Hash} message="No active PINs right now." /> : (
          <table className="w-full">
            <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "PIN (masked)", "Valid From", "Valid To", "Status", "Issued By", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{pins.map(p => { const st = pinStatus(p.validTo); return (
              <tr key={p.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
                <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{p.roomNumber}</td>
                <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{p.guestName}</td>
                <td className="px-5 py-3"><span className="text-lg font-bold" style={{ fontFamily: mono, color: TEXT, letterSpacing: "0.15em" }}>{p.credentialReference ?? "—"}</span></td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{new Date(p.validFrom).toLocaleString()}</td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{new Date(p.validTo).toLocaleString()}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2"><Badge label={st.label} colors={st.colors} />{st.label === "Expiring" && <span className="text-xs" style={{ color: WARNING }}>⚠ &lt;2h left</span>}</div>
                </td>
                <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.issuedByName}</td>
                <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => newPinFor(p)} disabled={busyRoom === p.roomId} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium disabled:opacity-50" style={{ color: TEAL, borderColor: `${TEAL}30` }}>New PIN</button><button onClick={() => revoke(p)} disabled={busyRoom === p.roomId} className="text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50" style={{ color: ERROR, borderColor: `${ERROR}30` }}>Revoke</button></div></td>
              </tr>
            ); })}</tbody>
          </table>
        )}
      </div>
      {newPin && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" style={{ border: `1px solid ${BORDER}` }}>
            <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: SUCCESS }} />
            <h2 className="text-base font-bold mb-1" style={{ color: TEXT }}>PIN generated — Room {newPin.room}</h2>
            <p className="text-xs mb-4" style={{ color: MUTED }}>Show to guest now. Cannot be retrieved after this screen.</p>
            <div className="text-3xl font-bold py-4 rounded-xl mb-4" style={{ fontFamily: mono, color: TEXT, letterSpacing: "0.3em", backgroundColor: "#F8FAFC" }}>{newPin.pin}</div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => { navigator.clipboard?.writeText(newPin.pin); add({ type: "success", title: "PIN copied" }); }} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Copy PIN</button>
              <button onClick={() => window.print()} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Print</button>
            </div>
            <button onClick={() => setNewPin(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Done</button>
          </div>
        </>
      )}
    </div>
  );
}
