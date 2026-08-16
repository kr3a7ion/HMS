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

export function PurchaseOrders({ add }: { add: AddToast }) {
  const [pos, setPos] = useState<PurchaseOrderListItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Array<{ productId: string; quantity: string; unitCost: string }>>([{ productId: "", quantity: "", unitCost: "" }]);
  const stC: Record<string, { bg: string; text: string }> = { draft: { bg: "#F3F4F6", text: "#374151" }, sent: { bg: "#DBEAFE", text: "#1E40AF" }, received: { bg: "#DCFCE7", text: "#166534" }, cancelled: { bg: "#FEE2E2", text: "#991B1B" } };

  const load = () => Promise.all([inventoryApi.listPurchaseOrders(), inventoryApi.listProducts(), inventoryApi.listSuppliers()])
    .then(([p, prod, sup]) => { setPos(p); setProducts(prod); setSuppliers(sup); })
    .catch(() => add({ type: "error", title: "Couldn't load purchase orders" }))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setSupplierId(suppliers[0]?.id ?? "");
    setLines([{ productId: products[0]?.id ?? "", quantity: "", unitCost: "" }]);
    setShowCreate(true);
  };

  const create = async () => {
    const items = lines.filter(l => l.productId && l.quantity).map(l => ({ productId: l.productId, quantity: Number(l.quantity), unitCostKobo: l.unitCost ? toKobo(Number(l.unitCost)) : (products.find(p => p.id === l.productId)?.unitCostKobo ?? 0) }));
    if (!supplierId || items.length === 0) { add({ type: "error", title: "Pick a supplier and at least one item" }); return; }
    try {
      const res = await inventoryApi.createPurchaseOrder({ supplierId, items });
      add({ type: "success", title: `${res.poNumber} created as draft` });
      setShowCreate(false);
      setLoading(true); load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Couldn't create PO" }); }
  };

  const act = async (id: string, action: "send" | "receive" | "cancel") => {
    setBusyId(id);
    try {
      if (action === "send") { await inventoryApi.sendPurchaseOrder(id); add({ type: "success", title: "PO sent to supplier" }); }
      if (action === "receive") { await inventoryApi.receivePurchaseOrder(id); add({ type: "success", title: "PO marked received — stock updated" }); }
      if (action === "cancel") { await inventoryApi.cancelPurchaseOrder(id); add({ type: "warning", title: "PO cancelled" }); }
      load();
    } catch (e) { add({ type: "error", title: e instanceof Error ? e.message : "Action failed" }); }
    finally { setBusyId(null); }
  };

  return (
    <div>
      <PageHeader title="Purchase Orders" sub="Manage POs from draft through receipt" actions={<BtnP label="Create PO" icon={Plus} onClick={openCreate} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {loading ? <div className="p-5"><div className="h-40 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div> : pos.length === 0 ? <EmptyState icon={FileText} message="No purchase orders yet." cta="Create PO" onCta={openCreate} /> : (
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["PO Number", "Supplier", "Date", "Items", "Total Value", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{pos.map(po => <tr key={po.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs font-semibold" style={{ color: PRIMARY, fontFamily: mono }}>{po.poNumber}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{po.supplierName ?? "—"}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{new Date(po.createdAt).toLocaleDateString()}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{po.itemCount} items</td><td className="px-5 py-3 text-sm font-bold" style={{ color: TEXT }}>₦{po.total.toLocaleString()}</td><td className="px-5 py-3"><Badge label={po.status} colors={stC[po.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1">{po.status === "draft" && <button disabled={busyId === po.id} onClick={() => act(po.id, "send")} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium disabled:opacity-50" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Send</button>}{po.status === "sent" && <button disabled={busyId === po.id} onClick={() => act(po.id, "receive")} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium disabled:opacity-50" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Mark Received</button>}{(po.status === "draft" || po.status === "sent") && <button disabled={busyId === po.id} onClick={() => act(po.id, "cancel")} className="text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-50" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Cancel</button>}</div></td></tr>)}</tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E" }}>Create Purchase Order</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Supplier</label><Sel options={suppliers.map(s => s.name)} value={suppliers.find(s => s.id === supplierId)?.name ?? ""} onChange={name => setSupplierId(suppliers.find(s => s.name === name)?.id ?? "")} /></div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Items</label>
                <div className="space-y-2">
                  {lines.map((l, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select value={l.productId} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, productId: e.target.value } : x))} className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }}>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="number" placeholder="Qty" value={l.quantity} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} className="w-20 px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} />
                      <input type="number" placeholder="Unit ₦" value={l.unitCost} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, unitCost: e.target.value } : x))} className="w-24 px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} />
                      <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-xs px-2 py-1" style={{ color: ERROR }}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setLines(ls => [...ls, { productId: products[0]?.id ?? "", quantity: "", unitCost: "" }])} className="mt-2 text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>+ Add Line</button>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={create} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>Create as Draft</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
