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

// ST-01 Hotel Configuration
const MODULE_META: Record<ModuleKey, { name: string; desc: string }> = {
  restaurant: { name: "Restaurant / POS", desc: "POS terminal, kitchen display, menu management" },
  inventory: { name: "Inventory", desc: "Stock management and purchase orders" },
  multiBranch: { name: "Multi-Branch Dashboard", desc: "Cross-branch comparison and central sync" },
  doorLock: { name: "Door Lock Integration", desc: "TTLock API integration for smart locks" },
};

// ST-01. Real branch-scoped config, backed by GET/POST /settings/branch.
// Enabled Modules genuinely drives sidebar visibility -- see NexuraApp's
// NAV filtering in App.tsx, not just a toggle that looks functional.

export function HotelConfig({ add }: { add: AddToast }) {
  const [settings, setSettings] = useState<BranchSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: "", address: "", contactPhone: "", contactEmail: "", currency: "NGN", timezone: "Africa/Lagos", checkInTime: "14:00", checkOutTime: "11:00" });
  const [tax, setTax] = useState({ taxName: "VAT", taxRate: "7.5", taxInclusive: false });
  const [pricing, setPricing] = useState({ rateRounding: "0", discountApprovalThreshold: "0" });

  const load = () => settingsApi.getBranch().then(s => {
    setSettings(s);
    setProfile({ name: s.name, address: s.address ?? "", contactPhone: s.contactPhone ?? "", contactEmail: s.contactEmail ?? "", currency: s.currency, timezone: s.timezone, checkInTime: s.checkInTime, checkOutTime: s.checkOutTime });
    setTax({ taxName: s.taxName, taxRate: String(s.taxRate), taxInclusive: s.taxInclusive });
    setPricing({ rateRounding: String(s.rateRounding), discountApprovalThreshold: String(s.discountApprovalThreshold) });
  }).catch(() => add({ type: "error", title: "Couldn't load hotel configuration" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
    try { const s = await settingsApi.updateBranch(profile); setSettings(s); add({ type: "success", title: "Property profile saved" }); }
    catch { add({ type: "error", title: "Couldn't save property profile" }); }
  };
  const saveTax = async () => {
    try { const s = await settingsApi.updateBranch({ taxName: tax.taxName, taxRate: Number(tax.taxRate), taxInclusive: tax.taxInclusive }); setSettings(s); add({ type: "success", title: "Tax settings saved" }); }
    catch { add({ type: "error", title: "Couldn't save tax settings" }); }
  };
  const savePricing = async () => {
    try { const s = await settingsApi.updateBranch({ rateRounding: Number(pricing.rateRounding), discountApprovalThreshold: Number(pricing.discountApprovalThreshold) }); setSettings(s); add({ type: "success", title: "Pricing rules saved" }); }
    catch { add({ type: "error", title: "Couldn't save pricing rules" }); }
  };
  const toggleModule = async (key: ModuleKey) => {
    if (!settings) return;
    const next = settings.enabledModules.includes(key) ? settings.enabledModules.filter(k => k !== key) : [...settings.enabledModules, key];
    try { const s = await settingsApi.updateBranch({ enabledModules: next }); setSettings(s); add({ type: "success", title: `${MODULE_META[key].name} ${next.includes(key) ? "enabled" : "disabled"}` }); }
    catch { add({ type: "error", title: "Couldn't update module" }); }
  };

  if (loading || !settings) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Hotel Configuration" sub="Property profile, enabled modules, and tax settings" />
      <div className="space-y-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Property Profile</h3>
          <div className="grid grid-cols-2 gap-4">
            <Inp label="Property Name" value={profile.name} onChange={(v: string) => setProfile(p => ({ ...p, name: v }))} />
            <Inp label="Phone" value={profile.contactPhone} onChange={(v: string) => setProfile(p => ({ ...p, contactPhone: v }))} />
            <Inp label="Address" value={profile.address} onChange={(v: string) => setProfile(p => ({ ...p, address: v }))} />
            <Inp label="Email" value={profile.contactEmail} onChange={(v: string) => setProfile(p => ({ ...p, contactEmail: v }))} />
            <Sel label="Currency" options={["NGN", "USD", "GBP"]} value={profile.currency} onChange={v => setProfile(p => ({ ...p, currency: v }))} />
            <Sel label="Timezone" options={["Africa/Lagos", "UTC"]} value={profile.timezone} onChange={v => setProfile(p => ({ ...p, timezone: v }))} />
            <Inp label="Check-in Time" value={profile.checkInTime} onChange={(v: string) => setProfile(p => ({ ...p, checkInTime: v }))} />
            <Inp label="Check-out Time" value={profile.checkOutTime} onChange={(v: string) => setProfile(p => ({ ...p, checkOutTime: v }))} />
          </div>
          <div className="mt-4"><BtnP label="Save Profile" icon={CheckCircle2} onClick={saveProfile} /></div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Enabled Modules</h3>
          <p className="text-xs mb-4" style={{ color: MUTED }}>Toggling a module hides it from the sidebar for every user at this branch. Reservations, Front Desk, Housekeeping, and Maintenance are core and can't be disabled.</p>
          <div className="space-y-3">{(Object.keys(MODULE_META) as ModuleKey[]).map(key => { const on = settings.enabledModules.includes(key); return <div key={key} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div><div className="text-sm font-medium" style={{ color: TEXT }}>{MODULE_META[key].name}</div><div className="text-xs mt-0.5" style={{ color: MUTED }}>{MODULE_META[key].desc}</div></div><button onClick={() => toggleModule(key)} className="w-10 h-5 rounded-full relative flex-shrink-0 ml-4" style={{ backgroundColor: on ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: on ? 22 : 2 }} /></button></div>; })}</div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Tax Configuration</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Inp label="Tax Name" value={tax.taxName} onChange={(v: string) => setTax(p => ({ ...p, taxName: v }))} />
            <Inp label="Rate (%)" value={tax.taxRate} onChange={(v: string) => setTax(p => ({ ...p, taxRate: v }))} />
            <Sel label="Application" options={["Exclusive", "Inclusive"]} value={tax.taxInclusive ? "Inclusive" : "Exclusive"} onChange={v => setTax(p => ({ ...p, taxInclusive: v === "Inclusive" }))} />
          </div>
          <BtnP label="Save Tax Settings" icon={CheckCircle2} onClick={saveTax} />
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Pricing Rules</h3>
          <div className="grid grid-cols-2 gap-4"><Inp label="Rate Rounding (₦, 0 = off)" value={pricing.rateRounding} onChange={(v: string) => setPricing(p => ({ ...p, rateRounding: v }))} /><Inp label="Discount Approval Threshold (₦)" value={pricing.discountApprovalThreshold} onChange={(v: string) => setPricing(p => ({ ...p, discountApprovalThreshold: v }))} /></div>
          <p className="text-xs mt-2" style={{ color: MUTED }}>Stored and available to other modules; no discount workflow reads this threshold yet — Rate Management doesn't have a discount/approval flow built.</p>
          <div className="mt-3"><BtnP label="Save Rules" icon={CheckCircle2} onClick={savePricing} /></div>
        </div>
      </div>
    </div>
  );
}
