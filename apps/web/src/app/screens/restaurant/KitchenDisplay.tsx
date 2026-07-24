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

export function KitchenDisplay() {
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = () => { restaurantApi.listOrders("sent_to_kitchen").then(setOrders).catch(() => {}); };
  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, []);

  const ageC = (mins: number) => mins > 15 ? { bg: "#FEE2E2", border: ERROR, text: ERROR, label: "URGENT" } : mins > 8 ? { bg: "#FEF3C7", border: WARNING, text: WARNING, label: "RUSH" } : { bg: "#DCFCE7", border: SUCCESS, text: SUCCESS, label: "NEW" };

  // No `add` (toast) prop on this screen -- KDS is meant to run as a
  // wall-mounted display, not an interactive workstation with popups.
  // Success is the order dropping off the board; failure leaves it in
  // place for staff to retry.
  const bump = async (order: RestaurantOrder) => {
    try {
      await Promise.all(order.items.map(i => restaurantApi.setItemStatus(order.id, i.id, "served")));
      load();
    } catch { /* stays in queue, staff can retry */ }
  };

  const markItem = async (order: RestaurantOrder, itemId: string, status: "pending" | "ready" | "served") => {
    try { await restaurantApi.setItemStatus(order.id, itemId, status); load(); } catch { /* stays as-is, staff can retry */ }
  };

  return (
    <div>
      <PageHeader title="Kitchen Display Screen" sub="Live order queue · Polling every 15s" actions={<div className="flex items-center gap-2 text-sm" style={{ color: MUTED }}><span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: SUCCESS }} />Live</div>} />
      {orders.length === 0 ? <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={UtensilsCrossed} message="No active orders in queue." /></div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {orders.map(o => {
            const mins = Math.max(0, Math.round((now - new Date(o.createdAt).getTime()) / 60000));
            const ac = ageC(mins);
            return (
              <div key={o.id} className="rounded-xl border-2 p-4 flex flex-col" style={{ backgroundColor: ac.bg, borderColor: ac.border }}>
                <div className="flex items-start justify-between mb-3">
                  <div><div className="text-lg font-bold" style={{ color: TEXT }}>{o.tableLabel ?? "Room Service"}</div><div className="text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.id.slice(0, 8)}</div></div>
                  <div className="text-right"><div className="text-2xl font-bold" style={{ color: ac.text, fontFamily: mono }}>{mins}m</div><span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: ac.border, color: "white" }}>{ac.label}</span></div>
                </div>
                <div className="flex-1 space-y-2 mb-4">
                  {o.items.map(item => (
                    <button key={item.id} onClick={() => markItem(o, item.id, item.status === "pending" ? "ready" : item.status === "ready" ? "served" : "pending")} className="w-full flex items-start gap-2 text-left">
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2" style={{ borderColor: ac.border, backgroundColor: item.status === "served" ? ac.border : "transparent" }}>{item.status === "served" && <CheckCircle2 size={12} color="white" />}</div>
                      <div><div className="text-sm font-medium" style={{ color: TEXT, textDecoration: item.status === "served" ? "line-through" : "none" }}>{item.name} ×{item.quantity}</div><div className="text-xs capitalize" style={{ color: MUTED }}>{item.status}</div></div>
                    </button>
                  ))}
                </div>
                <button onClick={() => bump(o)} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: ac.border }}>BUMP ✓</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
