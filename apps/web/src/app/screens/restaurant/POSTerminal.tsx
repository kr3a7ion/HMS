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

export function POSTerminal({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [inHouse, setInHouse] = useState<ReservationListItem[]>([]);
  const [activeOrder, setActiveOrder] = useState<RestaurantOrder | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "transfer">("cash");

  const loadStatic = () => {
    setLoading(true);
    Promise.all([restaurantApi.getMenu(), restaurantApi.listTables(), reservationsApi.list()])
      .then(([m, t, res]) => { setMenu(m); setActiveCat(c => c ?? m[0]?.id ?? null); setTables(t); setInHouse(res.filter(r => r.status === "checked_in")); })
      .catch(() => add({ type: "error", title: "Couldn't load POS data" }))
      .finally(() => setLoading(false));
  };
  useEffect(loadStatic, []);

  const refreshOrder = (id: string) => restaurantApi.getOrder(id).then(setActiveOrder).catch(() => add({ type: "error", title: "Couldn't load order" }));

  const orderIdParam = searchParams.get("orderId");
  useEffect(() => { if (orderIdParam) refreshOrder(orderIdParam); }, [orderIdParam]);

  const startTableOrder = async (table: RestaurantTable) => {
    if (table.status !== "available") { add({ type: "warning", title: "Table isn't available" }); return; }
    setStarting(true);
    try {
      const { id } = await restaurantApi.createOrder({ tableId: table.id });
      navigate(`/restaurant/pos?orderId=${id}`);
      await refreshOrder(id);
      loadStatic();
    } catch {
      add({ type: "error", title: "Couldn't start order" });
    } finally {
      setStarting(false);
    }
  };

  const startRoomOrder = async (reservationId: string) => {
    setStarting(true);
    try {
      const { id } = await restaurantApi.createOrder({ roomReservationId: reservationId });
      navigate(`/restaurant/pos?orderId=${id}`);
      await refreshOrder(id);
    } catch {
      add({ type: "error", title: "Couldn't start order" });
    } finally {
      setStarting(false);
    }
  };

  const addItem = async (menuItemId: string) => {
    if (!activeOrder) return;
    try {
      await restaurantApi.addItem(activeOrder.id, menuItemId, 1);
      refreshOrder(activeOrder.id);
    } catch (err: any) {
      add({ type: "error", title: err?.code === "ITEM_86D" ? "Item is 86'd — unavailable" : "Couldn't add item" });
    }
  };

  const sendToKitchen = async () => {
    if (!activeOrder) return;
    try {
      await restaurantApi.sendToKitchen(activeOrder.id);
      add({ type: "success", title: "Order sent to kitchen" });
      refreshOrder(activeOrder.id);
    } catch {
      add({ type: "error", title: "Couldn't send to kitchen" });
    }
  };

  const closeOrder = async (postToRoom: boolean) => {
    if (!activeOrder) return;
    setClosing(true);
    try {
      await restaurantApi.closeOrder(activeOrder.id, postToRoom ? { postToRoom: true } : { postToRoom: false, paymentMethod: payMethod });
      add({ type: "success", title: postToRoom ? "Posted to room folio" : "Payment accepted" });
      navigate("/restaurant/pos");
      setActiveOrder(null);
      loadStatic();
    } catch (err: any) {
      add({ type: "error", title: err?.code === "ORDER_EMPTY" ? "Add items before closing" : "Couldn't close order" });
    } finally {
      setClosing(false);
    }
  };

  if (loading) return <div className="p-5"><div className="h-96 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  // No active order: pick a table or start room service.
  if (!activeOrder) {
    return (
      <div>
        <PageHeader title="POS Terminal" sub="Select a table to start an order, or start Room Service" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Tables</h3>
            <div className="grid grid-cols-3 gap-3">
              {tables.map(t => (
                <button key={t.id} disabled={starting || t.status !== "available"} onClick={() => startTableOrder(t)}
                  className="p-4 rounded-xl border-2 text-center disabled:opacity-60" style={{ borderColor: t.status === "available" ? SUCCESS : BORDER, backgroundColor: t.status === "available" ? "#F0FDF4" : "#F8FAFC" }}>
                  <div className="text-base font-bold" style={{ color: TEXT }}>{t.label}</div>
                  <div className="text-xs mt-0.5 capitalize" style={{ color: MUTED }}>{t.status} · {t.seats}p</div>
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Room Service</h3>
            {inHouse.length === 0 ? <p className="text-xs" style={{ color: MUTED }}>No guests currently checked in.</p> : (
              <div className="space-y-1">{inHouse.map(r => (
                <button key={r.id} disabled={starting} onClick={() => startRoomOrder(r.id)} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[#F8FAFC]" style={{ color: TEXT }}>
                  Room {r.roomNumber} — {r.guestFirstName} {r.guestLastName}
                </button>
              ))}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const category = menu.find(c => c.id === activeCat) ?? menu[0];
  const target = activeOrder.tableLabel ? `Table ${activeOrder.tableLabel}` : "Room Service";

  return (
    <div>
      <PageHeader title="POS Terminal" sub={`${target} · Order ${activeOrder.status}`} actions={<BtnO label="Back to Tables" icon={Layers} onClick={() => { navigate("/restaurant/pos"); setActiveOrder(null); }} />} />
      <div className="flex gap-4 h-[580px]">
        <div className="flex-1 flex flex-col bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b overflow-x-auto" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>{menu.map(c => <button key={c.id} onClick={() => setActiveCat(c.id)} className="flex-shrink-0 px-5 py-3 text-sm font-medium transition-colors" style={{ color: activeCat === c.id ? PRIMARY : MUTED, borderBottom: activeCat === c.id ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{c.name}</button>)}</div>
          <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {(category?.items ?? []).map(item => {
                const inOrder = activeOrder.items.filter(i => i.menuItemId === item.id).reduce((s, i) => s + i.quantity, 0);
                return (
                  <button key={item.id} disabled={!item.available || activeOrder.status === "closed"} onClick={() => addItem(item.id)}
                    className="p-4 rounded-xl border-2 text-left transition-all hover:shadow-sm disabled:opacity-40" style={{ borderColor: inOrder ? PRIMARY : BORDER, backgroundColor: inOrder ? "#EFF6FF" : "white" }}>
                    <div className="text-sm font-semibold mb-1" style={{ color: TEXT }}>{item.name}{!item.available && " (86'd)"}</div>
                    <div className="text-base font-bold" style={{ color: PRIMARY }}>₦{item.price.toLocaleString()}</div>
                    {inOrder > 0 && <div className="mt-1 text-xs font-medium" style={{ color: TEAL }}>×{inOrder} added</div>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="w-80 flex-shrink-0 bg-white rounded-xl border flex flex-col" style={{ borderColor: BORDER }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}><div className="text-sm font-semibold" style={{ color: TEXT }}>Current Order</div><div className="text-xs" style={{ color: SUBTLE }}>{activeOrder.items.length === 0 ? "No items yet" : `${activeOrder.items.reduce((s, o) => s + o.quantity, 0)} items`}</div></div>
          <div className="flex-1 overflow-y-auto px-4 py-2" style={{ scrollbarWidth: "none" }}>
            {activeOrder.items.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-center"><ShoppingCart size={28} style={{ color: SUBTLE }} /><p className="text-xs mt-2" style={{ color: SUBTLE }}>Tap menu items to add</p></div>
              : activeOrder.items.map(o => <div key={o.id} className="flex items-center gap-2 py-2.5 border-b" style={{ borderColor: "#F8FAFC" }}><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate" style={{ color: TEXT }}>{o.name} ×{o.quantity}</div><div className="text-xs capitalize" style={{ color: MUTED }}>{o.status}</div></div><div className="text-sm font-semibold w-16 text-right" style={{ color: TEXT }}>₦{(o.unitPrice * o.quantity).toLocaleString()}</div></div>)}
          </div>
          {activeOrder.items.length > 0 && <div className="px-4 py-4 border-t" style={{ borderColor: BORDER }}>
            <div className="flex justify-between font-bold text-base mb-3" style={{ color: TEXT }}><span>Total</span><span>₦{activeOrder.total.toLocaleString()}</span></div>
            {activeOrder.status === "open" && <BtnP label="Send to Kitchen" icon={UtensilsCrossed} onClick={sendToKitchen} />}
            {activeOrder.status !== "closed" && activeOrder.status !== "open" && (
              <div className="space-y-2 mt-2">
                {activeOrder.roomReservationId
                  ? <BtnP label={closing ? "Posting…" : "Post to Room Folio"} icon={FileText} onClick={() => closeOrder(true)} />
                  : (<>
                      <select value={payMethod} onChange={e => setPayMethod(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                        <option value="cash">Cash</option><option value="card">POS / Card</option><option value="transfer">Bank Transfer</option>
                      </select>
                      <BtnP label={closing ? "Processing…" : "Accept Payment & Close"} icon={CheckCircle2} onClick={() => closeOrder(false)} />
                    </>)}
              </div>
            )}
          </div>}
        </div>
      </div>
    </div>
  );
}
