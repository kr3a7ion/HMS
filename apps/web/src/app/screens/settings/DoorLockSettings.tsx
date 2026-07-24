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
  doorLockApi, type DoorLockConfig, type RoomLockMapping,
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

// ST-04. Real config against GET/POST /door-lock/config,
// server/src/services/locks/ttlockAdapter.ts. Provider dropdown still only
// offers ZKTeco/Dormakaba as "coming soon" -- TTLock is the only adapter
// that's actually implemented (Lock Provider Interface makes adding a
// second one a new adapter file, not a rewrite, when that's ever needed).
// clientSecret/password fields stay blank on load (server never echoes
// them back, same discipline as PIN codes) -- leaving them blank on save
// means "keep the existing value", only overwrite if the user types a new one.
export function DoorLockSettings({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [config, setConfig] = useState<DoorLockConfig | null>(null);
  const [mapping, setMapping] = useState<RoomLockMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ clientId: "", clientSecret: "", username: "", password: "" });
  const [tested, setTested] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [testResult, setTestResult] = useState("");
  const [autoMapping, setAutoMapping] = useState(false);
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [editLockId, setEditLockId] = useState("");
  const [editLockName, setEditLockName] = useState("");

  const load = () => Promise.all([settingsApi.getBranch(), doorLockApi.getConfig(), doorLockApi.roomMapping()])
    .then(([s, c, m]) => {
      setSettings(s); setConfig(c); setMapping(m);
      setForm({ clientId: c.clientId ?? "", clientSecret: "", username: c.username ?? "", password: "" });
    })
    .catch(() => add({ type: "error", title: "Couldn't load door lock settings" }))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const toggleModule = async () => {
    if (!settings) return;
    const key: ModuleKey = "doorLock";
    const next = settings.enabledModules.includes(key) ? settings.enabledModules.filter(k => k !== key) : [...settings.enabledModules, key];
    try { const s = await settingsApi.updateBranch({ enabledModules: next }); setSettings(s); add({ type: "success", title: `Door Lock module ${next.includes(key) ? "enabled" : "disabled"}` }); }
    catch { add({ type: "error", title: "Couldn't update module" }); }
  };

  const saveCredentials = async () => {
    try {
      const c = await doorLockApi.saveConfig({ clientId: form.clientId, clientSecret: form.clientSecret, username: form.username, password: form.password });
      setConfig(c);
      setForm(f => ({ ...f, clientSecret: "", password: "" }));
      add({ type: "success", title: "Door lock credentials saved" });
    } catch { add({ type: "error", title: "Couldn't save credentials" }); }
  };

  const testConnection = async () => {
    setTested("testing"); setTestResult("");
    try {
      const result = await doorLockApi.testConnection();
      setTested(result.ok ? "ok" : "fail");
      setTestResult(result.ok ? `Connected · ${result.lockCount} lock${result.lockCount === 1 ? "" : "s"} found` : (result.error ?? "Connection failed"));
    } catch { setTested("fail"); setTestResult("Couldn't reach the local server"); }
  };

  const autoMap = async () => {
    setAutoMapping(true);
    try {
      const result = await doorLockApi.autoMap();
      await load();
      add({ type: result.unmatched.length === 0 ? "success" : "warning", title: `Auto-mapped ${result.matched.length} room(s)`, body: result.unmatched.length > 0 ? `Unmatched: ${result.unmatched.join(", ")}` : undefined });
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Auto-map failed — check TTLock connection first" }); }
    finally { setAutoMapping(false); }
  };

  const saveMapping = async () => {
    if (!editingRoom || !editLockId.trim() || !editLockName.trim()) return;
    try {
      await doorLockApi.saveRoomMapping(editingRoom, editLockId.trim(), editLockName.trim());
      setEditingRoom(null); setEditLockId(""); setEditLockName("");
      load();
      add({ type: "success", title: "Room → lock mapping saved" });
    } catch { add({ type: "error", title: "Couldn't save mapping" }); }
  };

  const saveIntegrationSettings = async (patch: Partial<{ autoRevokeOnCheckout: boolean; queueWhenOffline: boolean; notifyMgtOnOfflineRevoke: boolean; maxCardsPerCheckIn: number; queueExpiryBufferHours: number }>) => {
    try { const c = await doorLockApi.saveConfig(patch); setConfig(c); add({ type: "success", title: "Integration settings saved" }); }
    catch { add({ type: "error", title: "Couldn't save settings" }); }
  };

  if (loading || !settings || !config) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;
  const enabled = settings.enabledModules.includes("doorLock");

  return (
    <div>
      <PageHeader title="Door Lock Integration" sub={`TTLock Cloud API configuration · ${settings.name}`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Master Enable</h3>
            <label className="cursor-pointer flex items-center gap-2"><span className="text-sm" style={{ color: MUTED }}>Door Lock Module</span><div onClick={toggleModule} className="w-12 h-6 rounded-full relative cursor-pointer" style={{ backgroundColor: enabled ? TEAL : "#CBD5E1" }}><div className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: enabled ? 26 : 2 }} /></div></label>
          </div>
          {!enabled && <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>⚠ Door Lock module disabled. Step 7 hidden in check-in wizard. All door lock screens hidden from sidebar.</div>}
          <div className="mt-4"><Sel label="Lock Provider" options={["TTLock Cloud API", "ZKTeco (coming soon)", "Dormakaba (coming soon)"]} value="TTLock Cloud API" /></div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>TTLock API Credentials</h3>
          <div className="space-y-3">
            <Inp label="Client ID" value={form.clientId} onChange={v => setForm(f => ({ ...f, clientId: v }))} />
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Client Secret</label><input type="password" value={form.clientSecret} onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))} placeholder={config.hasClientSecret ? "•••••••••• (unchanged)" : "Not set"} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            <Inp label="Username" value={form.username} onChange={v => setForm(f => ({ ...f, username: v }))} />
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={config.hasPassword ? "•••••••••• (unchanged)" : "Not set"} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          </div>
          <div className="flex items-center gap-2 mt-4"><BtnO label="Save Credentials" onClick={saveCredentials} /></div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={testConnection} disabled={tested === "testing"} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-60" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>
              {tested === "testing" ? <span className="animate-spin">↻</span> : <Wifi size={14} />}Test Connection
            </button>
            {tested === "ok" && <span className="text-xs font-medium flex items-center gap-1" style={{ color: SUCCESS }}><CheckCircle2 size={13} />{testResult}</span>}
            {tested === "fail" && <span className="text-xs font-medium" style={{ color: ERROR }}>{testResult}</span>}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden mb-5" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Room → Lock Mapping</h3><BtnO label={autoMapping ? "Mapping…" : "Auto-Map by Name"} icon={RefreshCw} onClick={autoMap} /></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "TTLock Lock ID", "Lock Name", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{mapping.map(r => (
            <tr key={r.roomId} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>Room {r.roomNumber}</td>
              {editingRoom === r.roomId ? (
                <>
                  <td className="px-5 py-3"><input value={editLockId} onChange={e => setEditLockId(e.target.value)} placeholder="Lock ID" className="w-28 px-2 py-1 text-xs border rounded" style={{ borderColor: BORDER }} /></td>
                  <td className="px-5 py-3"><input value={editLockName} onChange={e => setEditLockName(e.target.value)} placeholder="Lock name" className="w-32 px-2 py-1 text-sm border rounded" style={{ borderColor: BORDER }} /></td>
                  <td className="px-5 py-3"><div className="flex gap-1"><button onClick={saveMapping} className="text-xs px-2 py-1 rounded border" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Save</button><button onClick={() => setEditingRoom(null)} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button></div></td>
                </>
              ) : (
                <>
                  <td className="px-5 py-3 text-xs" style={{ color: r.ttlockLockId ? MUTED : SUBTLE, fontFamily: mono }}>{r.ttlockLockId ?? "Not mapped"}</td>
                  <td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{r.lockName ?? "—"}</td>
                  <td className="px-5 py-3"><button onClick={() => { setEditingRoom(r.roomId); setEditLockId(r.ttlockLockId ?? ""); setEditLockName(r.lockName ?? ""); }} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Edit</button></td>
                </>
              )}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Integration Settings</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {([
            { l: "Auto-revoke access on check-out", key: "autoRevokeOnCheckout" as const },
            { l: "Queue commands when offline", key: "queueWhenOffline" as const },
            { l: "Notify MGT on offline revoke", key: "notifyMgtOnOfflineRevoke" as const },
          ]).map(s => <div key={s.key} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: TEXT }}>{s.l}</span><div onClick={() => saveIntegrationSettings({ [s.key]: !config[s.key] })} className="w-10 h-5 rounded-full relative cursor-pointer" style={{ backgroundColor: config[s.key] ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: config[s.key] ? 22 : 2 }} /></div></div>)}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Max cards per check-in</label><input value={config.maxCardsPerCheckIn} onChange={e => setConfig(c => c && { ...c, maxCardsPerCheckIn: Number(e.target.value) })} onBlur={e => saveIntegrationSettings({ maxCardsPerCheckIn: Number(e.target.value) })} type="number" min={1} max={10} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Queue expiry buffer (hours)</label><input value={config.queueExpiryBufferHours} onChange={e => setConfig(c => c && { ...c, queueExpiryBufferHours: Number(e.target.value) })} onBlur={e => saveIntegrationSettings({ queueExpiryBufferHours: Number(e.target.value) })} type="number" min={0} max={24} className="w-full px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
        </div>
      </div>
    </div>
  );
}
