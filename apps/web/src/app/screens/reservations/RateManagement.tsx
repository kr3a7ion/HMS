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

export function RateManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [plans, setPlans] = useState(RATE_PLANS.map(r => ({ ...r })));
  const [editPlan, setEditPlan] = useState<(typeof RATE_PLANS)[0] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editValues, setEditValues] = useState({ name: "", base: "", dates: "" });

  const openEdit = (r: typeof RATE_PLANS[0]) => {
    setEditPlan(r);
    setEditValues({ name: r.name, base: r.base.toString(), dates: r.dates });
  };
  const saveEdit = () => {
    if (!editPlan) return;
    setPlans(p => p.map(r => r.id === editPlan.id ? { ...r, name: editValues.name, base: Number(editValues.base) || r.base, dates: editValues.dates } : r));
    setEditPlan(null);
    add({ type: "success", title: "Rate plan updated", body: editValues.name });
  };
  const toggleActive = (id: string) => {
    setPlans(p => p.map(r => r.id === id ? { ...r, active: !r.active } : r));
    const plan = plans.find(r => r.id === id);
    add({ type: plan?.active ? "warning" : "success", title: `${plan?.name} ${plan?.active ? "deactivated" : "activated"}` });
  };

  return (
    <div>
      <PageHeader title="Rate Management" sub="All rate plans, seasonal pricing, and corporate rates"
        actions={<BtnP label="Create Rate Plan" icon={Plus} onClick={() => setShowCreate(true)} />} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Plan ID", "Rate Plan Name", "Room Types", "Base Rate (₦)", "Applicable Dates", "Active", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{plans.map((r, i) => (
            <tr key={r.id} className="border-t hover:bg-[#F8FAFC] transition-colors" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}>
              <td className="px-5 py-3.5 text-xs font-mono" style={{ color: MUTED, fontFamily: mono }}>{r.id}</td>
              <td className="px-5 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{r.name}</td>
              <td className="px-5 py-3.5"><div className="flex gap-1 flex-wrap">{r.rooms.map(rt => <span key={rt} className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{rt}</span>)}</div></td>
              <td className="px-5 py-3.5 text-sm font-bold" style={{ color: PRIMARY }}>₦{r.base.toLocaleString()}</td>
              <td className="px-5 py-3.5 text-xs" style={{ color: MUTED }}>{r.dates}</td>
              <td className="px-5 py-3.5">
                <button onClick={() => toggleActive(r.id)} className="w-10 h-5 rounded-full relative transition-colors" style={{ backgroundColor: r.active ? TEAL : "#CBD5E1" }}>
                  <div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: r.active ? 22 : 2 }} />
                </button>
              </td>
              <td className="px-5 py-3.5">
                <button onClick={() => openEdit(r)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold hover:shadow-sm transition-all" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Edit</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Edit Rate Plan Modal */}
      {editPlan && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setEditPlan(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>Edit Rate Plan</h3>
            <p className="text-xs mb-5" style={{ color: MUTED }}>Changes apply immediately to all new reservations using this plan.</p>
            <div className="space-y-4">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Plan Name</label>
                <input value={editValues.name} onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Base Rate (₦ per night)</label>
                <input type="number" value={editValues.base} onChange={e => setEditValues(p => ({ ...p, base: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Applicable Dates</label>
                <input value={editValues.dates} onChange={e => setEditValues(p => ({ ...p, dates: e.target.value }))} placeholder="e.g. Year-round, Dec 20 – Jan 5, Fri–Sun" className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} /></div>
              <div className="p-3 rounded-xl text-xs" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                ⚠ Rate changes do not affect existing confirmed reservations — only new bookings made after this change.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditPlan(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={saveEdit} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Save Changes</button>
            </div>
          </div>
        </>
      )}

      {/* Create new rate plan */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>Create Rate Plan</h3>
            <div className="space-y-4">
              {[["Plan Name", "e.g. Early Bird Discount"], ["Base Rate (₦)", "e.g. 42000"], ["Applicable Dates", "e.g. Jul 1 – Aug 31"]].map(([label, placeholder]) => (
                <div key={label}><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>{label}</label><input placeholder={placeholder} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} /></div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={() => { setShowCreate(false); add({ type: "success", title: "Rate plan created" }); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Create Plan</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
