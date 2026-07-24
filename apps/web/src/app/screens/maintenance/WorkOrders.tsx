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

// MX-01, MX-03. Priority/status color maps (priC/woC from data.tsx) use
// Title Case keys ("Reported", "High") — real data comes back lowercase
// from the API, so map through WO_STATUS_LABEL/WO_PRIORITY_LABEL below
// rather than changing the shared color maps other mock screens still use.
const WO_STATUS_LABEL: Record<WorkOrderStatus, string> = { reported: "Reported", assigned: "Assigned", in_progress: "In Progress", completed: "Completed" };
const WO_PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export function WorkOrders({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<WorkOrderListItem[]>([]);
  const [filter, setFilter] = useState<"All" | WorkOrderStatus>("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newWO, setNewWO] = useState({ location: "", category: "Electrical", priority: "medium" as const, desc: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true); setError("");
    maintenanceApi.list().then(setOrders).catch(() => setError("Couldn't load work orders.")).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const visible = filter === "All" ? orders : orders.filter(w => w.status === filter);

  const submitWO = async () => {
    if (!newWO.location || !newWO.desc) { add({ type: "warning", title: "Fill in location and description" }); return; }
    setSubmitting(true);
    try {
      await maintenanceApi.create({ location: newWO.location, category: newWO.category, priority: newWO.priority, description: newWO.desc });
      setShowNew(false);
      add({ type: "success", title: "Work order created", body: `${newWO.location} — ${newWO.category} · ${WO_PRIORITY_LABEL[newWO.priority]} priority` });
      setNewWO({ location: "", category: "Electrical", priority: "medium", desc: "" });
      load();
    } catch {
      add({ type: "error", title: "Couldn't create work order" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Work Orders" sub={error || "All maintenance requests across the property"}
        actions={<BtnP label="New Work Order" icon={Plus} onClick={() => setShowNew(true)} />} />
      <div className="flex gap-2.5 mb-5 flex-wrap">
        {(["All", "reported", "assigned", "in_progress", "completed"] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} className="px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
            style={{ borderColor: filter === s ? PRIMARY : BORDER, backgroundColor: filter === s ? "#EFF6FF" : "white", color: filter === s ? PRIMARY : MUTED }}>
            {s === "All" ? "All" : WO_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
        {visible.length === 0 ? <EmptyState icon={Wrench} message="No work orders match this filter." cta="New Work Order" onCta={() => setShowNew(true)} /> : (
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>
                {["Location", "Category", "Priority", "Status", "Technician", "Created", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED, letterSpacing: "0.07em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((w, i) => (
                <tr key={w.id} className="border-t hover:bg-[#F8FAFC] transition-colors cursor-pointer" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}
                  onClick={() => navigate(`/maintenance/work-orders/${w.id}`)}>
                  <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{w.location}</td>
                  <td className="px-4 py-3.5 text-sm" style={{ color: MUTED }}>{w.category}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ color: priC[WO_PRIORITY_LABEL[w.priority]], backgroundColor: `${priC[WO_PRIORITY_LABEL[w.priority]]}12` }}>
                      {WO_PRIORITY_LABEL[w.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3.5"><Badge label={WO_STATUS_LABEL[w.status]} colors={woC[WO_STATUS_LABEL[w.status]] ?? { bg: "#F1F5F9", text: "#374151" }} /></td>
                  <td className="px-4 py-3.5 text-sm" style={{ color: MUTED }}>{w.technicianFirstName ? `${w.technicianFirstName} ${w.technicianLastName}` : "Unassigned"}</td>
                  <td className="px-4 py-3.5 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{new Date(w.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3.5"><ChevronRight size={14} style={{ color: SUBTLE }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowNew(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>New Work Order</h3>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>Report a maintenance issue across the property</p>
              </div>
              <button onClick={() => setShowNew(false)} style={{ color: SUBTLE }}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Location</label>
                <input value={newWO.location} onChange={e => setNewWO(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Room 207, Restaurant Kitchen, Pool Area"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}
                  onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Category</label>
                  <select value={newWO.category} onChange={e => setNewWO(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                    {["Electrical", "HVAC", "Plumbing", "Furniture", "Equipment", "General"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Priority</label>
                  <select value={newWO.priority} onChange={e => setNewWO(p => ({ ...p, priority: e.target.value as any }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                    {(["low", "medium", "high"] as const).map(c => <option key={c} value={c}>{WO_PRIORITY_LABEL[c]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Description</label>
                <textarea value={newWO.desc} onChange={e => setNewWO(p => ({ ...p, desc: e.target.value }))} placeholder="Describe the issue clearly. Include what's broken, how long it's been a problem, and any safety concerns." rows={3} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: BORDER, color: TEXT }}
                  onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <BtnO label="Cancel" onClick={() => setShowNew(false)} />
              <BtnP label={submitting ? "Creating…" : "Create Work Order"} icon={CheckCircle2} onClick={submitWO} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
