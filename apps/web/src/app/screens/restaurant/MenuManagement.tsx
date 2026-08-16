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
import { formatNaira } from "../../lib/money";

export function MenuManagement({ add }: { add: AddToast }) {
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", price: "" });

  const load = () => {
    setLoading(true);
    restaurantApi.getMenu().then(m => { setMenu(m); setActiveCat(c => c ?? m[0]?.id ?? null); }).catch(() => add({ type: "error", title: "Couldn't load menu" })).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    try { await restaurantApi.createCategory(newCatName.trim()); setShowNewCat(false); setNewCatName(""); load(); }
    catch { add({ type: "error", title: "Couldn't add category" }); }
  };

  const addItem = async () => {
    if (!activeCat || !newItem.name.trim() || !newItem.price) return;
    try { await restaurantApi.createItem(activeCat, newItem.name.trim(), Number(newItem.price)); setShowNewItem(false); setNewItem({ name: "", price: "" }); load(); }
    catch { add({ type: "error", title: "Couldn't add item" }); }
  };

  const toggleAvailability = async (id: string, available: boolean) => {
    try { await restaurantApi.setItemAvailability(id, available); load(); }
    catch { add({ type: "error", title: "Couldn't update item" }); }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  const category = menu.find(c => c.id === activeCat);

  return (
    <div>
      <PageHeader title="Menu Management" sub="Configure menu items, pricing, and availability" actions={<><BtnO label="Add Category" icon={Plus} onClick={() => setShowNewCat(true)} /><BtnP label="Add Item" icon={Plus} onClick={() => setShowNewItem(true)} /></>} />
      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0 bg-white rounded-xl border p-2" style={{ borderColor: BORDER }}>
          {menu.length === 0 ? <p className="text-xs p-3" style={{ color: MUTED }}>No categories yet.</p> : menu.map(c => <button key={c.id} onClick={() => setActiveCat(c.id)} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1" style={{ backgroundColor: activeCat === c.id ? PRIMARY : "transparent", color: activeCat === c.id ? "white" : MUTED }}>{c.name}<span className="ml-2 text-xs opacity-70">({c.items.length})</span></button>)}
        </div>
        <div className="flex-1 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>{category?.name ?? "—"}</h3><span className="text-xs" style={{ color: SUBTLE }}>{category?.items.length ?? 0} items</span></div>
          {!category || category.items.length === 0 ? <EmptyState icon={UtensilsCrossed} message="No items in this category yet." /> : (
            <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Name", "Price", "Available", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
              <tbody>{category.items.map(item => <tr key={item.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-4 text-sm font-medium" style={{ color: TEXT }}>{item.name}</td><td className="px-5 py-4 text-sm font-semibold" style={{ color: PRIMARY }}>{formatNaira(item.priceKobo)}</td><td className="px-5 py-4"><label className="cursor-pointer" onClick={() => toggleAvailability(item.id, !item.available)}><div className="w-10 h-5 rounded-full relative" style={{ backgroundColor: item.available ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow" style={{ left: item.available ? 22 : 2 }} /></div></label></td><td className="px-5 py-4">{item.available && <button onClick={() => toggleAvailability(item.id, false)} className="text-xs px-2 py-1 rounded border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>86'd</button>}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>

      {showNewCat && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowNewCat(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: `1px solid ${BORDER}` }}>
            <h3 className="text-base font-bold mb-4" style={{ color: TEXT }}>Add Category</h3>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Starters" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-4" style={{ borderColor: BORDER }} />
            <div className="flex gap-3"><BtnO label="Cancel" onClick={() => setShowNewCat(false)} /><BtnP label="Add" icon={Plus} onClick={addCategory} /></div>
          </div>
        </>
      )}
      {showNewItem && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowNewItem(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: `1px solid ${BORDER}` }}>
            <h3 className="text-base font-bold mb-4" style={{ color: TEXT }}>Add Item to {category?.name}</h3>
            <input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} placeholder="Item name" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-3" style={{ borderColor: BORDER }} />
            <input type="number" value={newItem.price} onChange={e => setNewItem(p => ({ ...p, price: e.target.value }))} placeholder="Price (₦)" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none mb-4" style={{ borderColor: BORDER }} />
            <div className="flex gap-3"><BtnO label="Cancel" onClick={() => setShowNewItem(false)} /><BtnP label="Add" icon={Plus} onClick={addItem} /></div>
          </div>
        </>
      )}
    </div>
  );
}
