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
  UserCheck, BookOpen, Inbox, Zap, ArrowUpDown,
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
import { toKobo, formatNaira } from "../../lib/money";

export function ProductsScreen({ add }: { add: AddToast }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("All Categories");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newItem, setNewItem] = useState({ itemCode: "", name: "", category: "Linen", unit: "pcs", parLevel: "", reorderThreshold: "", unitCost: "", initialStock: "" });
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: "adjustment" as "in" | "out" | "adjustment", quantity: "", reference: "" });

  const load = () => inventoryApi.listProducts().then(setProducts).catch(() => add({ type: "error", title: "Couldn't load products" })).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const createItem = async () => {
    if (!newItem.itemCode.trim() || !newItem.name.trim() || !newItem.parLevel || !newItem.reorderThreshold || !newItem.unitCost) {
      add({ type: "error", title: "Fill in code, name, par level, reorder point, and unit cost" });
      return;
    }
    try {
      await inventoryApi.createProduct({
        itemCode: newItem.itemCode, name: newItem.name, category: newItem.category, unit: newItem.unit,
        parLevel: Number(newItem.parLevel), reorderThreshold: Number(newItem.reorderThreshold), unitCostKobo: toKobo(Number(newItem.unitCost)),
        initialStock: newItem.initialStock ? Number(newItem.initialStock) : undefined,
      });
      add({ type: "success", title: `${newItem.name} added` });
      setShowCreate(false);
      setNewItem({ itemCode: "", name: "", category: "Linen", unit: "pcs", parLevel: "", reorderThreshold: "", unitCost: "", initialStock: "" });
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Couldn't add item" }); }
  };

  const submitAdjust = async () => {
    if (!adjustTarget || !adjustForm.quantity) return;
    try {
      await inventoryApi.adjustProduct(adjustTarget.id, { type: adjustForm.type, quantity: Number(adjustForm.quantity), reference: adjustForm.reference || undefined });
      add({ type: "success", title: `${adjustTarget.name} stock updated` });
      setAdjustTarget(null);
      setAdjustForm({ type: "adjustment", quantity: "", reference: "" });
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Adjustment failed" }); }
  };

  const filtered = products.filter(p => (category === "All Categories" || p.category === category) && (search === "" || p.name.toLowerCase().includes(search.toLowerCase()) || p.itemCode.toLowerCase().includes(search.toLowerCase())));

  return (
    <div>
      <PageHeader title="Products / Items" sub="All inventory items with par levels and reorder thresholds" actions={<BtnP label="Add Item" icon={Plus} onClick={() => setShowCreate(true)} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Categories", "Linen", "Toiletries", "F&B", "Kitchen", "Cleaning"]} value={category} onChange={setCategory} />
        </div>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : filtered.length === 0 ? <EmptyState icon={Package} message="No items match." /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Code", "Name", "Category", "Unit", "Stock", "Par Level", "Reorder Point", "Unit Cost", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{filtered.map(p => {
              const low = p.currentStock <= p.reorderThreshold;
              return <tr key={p.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{p.itemCode}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{p.name}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.category}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.unit}</td><td className="px-5 py-3"><span className="text-sm font-bold" style={{ color: low ? ERROR : TEXT }}>{p.currentStock}</span>{low && <span className="ml-1 text-xs" style={{ color: ERROR }}>↓ low</span>}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{p.parLevel}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{p.reorderThreshold}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{formatNaira(p.unitCostKobo)}</td><td className="px-5 py-3"><button onClick={() => { setAdjustTarget(p); setAdjustForm({ type: "adjustment", quantity: String(p.currentStock), reference: "" }); }} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Adjust</button></td></tr>;
            })}</tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E" }}>Add Item</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Item Code</label><input value={newItem.itemCode} onChange={e => setNewItem(p => ({ ...p, itemCode: e.target.value }))} placeholder="LIN-004" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Unit</label><input value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} placeholder="pcs" className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Name</label><input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Hand Towels" className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Category</label><Sel options={["Linen", "Toiletries", "F&B", "Kitchen", "Cleaning"]} value={newItem.category} onChange={v => setNewItem(p => ({ ...p, category: v }))} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Par Level</label><input type="number" value={newItem.parLevel} onChange={e => setNewItem(p => ({ ...p, parLevel: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Reorder Pt</label><input type="number" value={newItem.reorderThreshold} onChange={e => setNewItem(p => ({ ...p, reorderThreshold: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Init. Stock</label><input type="number" value={newItem.initialStock} onChange={e => setNewItem(p => ({ ...p, initialStock: e.target.value }))} className="w-full px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Unit Cost (₦)</label><input type="number" value={newItem.unitCost} onChange={e => setNewItem(p => ({ ...p, unitCost: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={createItem} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Add Item</button>
            </div>
          </div>
        </>
      )}

      {adjustTarget && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setAdjustTarget(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#0D1B2E" }}>Adjust Stock — {adjustTarget.name}</h3>
            <p className="text-xs mb-5" style={{ color: MUTED }}>Current: {adjustTarget.currentStock} {adjustTarget.unit}</p>
            <div className="space-y-4">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Type</label><Sel options={["adjustment", "in", "out"]} value={adjustForm.type} onChange={v => setAdjustForm(p => ({ ...p, type: v as "in" | "out" | "adjustment" }))} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>{adjustForm.type === "adjustment" ? "New Stock Count" : "Quantity"}</label><input type="number" value={adjustForm.quantity} onChange={e => setAdjustForm(p => ({ ...p, quantity: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Reference (optional)</label><input value={adjustForm.reference} onChange={e => setAdjustForm(p => ({ ...p, reference: e.target.value }))} placeholder="e.g. Manual recount" className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setAdjustTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={submitAdjust} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
