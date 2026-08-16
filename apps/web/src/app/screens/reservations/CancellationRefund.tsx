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

export function CancellationRefund({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [waived, setWaived] = useState(false);
  const res = ALL_RES[6]; // BK-2840 Tunde Bakare
  const cancFee = 17500;
  const deposit = 35000;
  const refund = waived ? deposit : deposit - cancFee;
  return (
    <div>
      <PageHeader title="Cancellation & Refund" sub="Process reservation cancellation with policy enforcement" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Reservation to Cancel</h3>
          <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: "#F8FAFC" }}>
            <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: PRIMARY }}>TB</div><div><div className="text-sm font-semibold" style={{ color: TEXT }}>{res.guest}</div><div className="text-xs" style={{ color: MUTED }}>{res.id} · {res.type} · {res.checkin}–{res.checkout}</div></div></div>
            {[["Rate Plan", "Standard Rate"], ["Total Value", `₦${(res.rate * res.nights * 1.075).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`], ["Deposit Paid", `₦${deposit.toLocaleString()}`]].map(([k, v]) => <div key={k} className="flex justify-between text-sm mb-1"><span style={{ color: MUTED }}>{k}</span><span style={{ color: TEXT }}>{v as string}</span></div>)}
          </div>
          <div className="border-l-4 p-4 rounded-r-xl mb-4" style={{ borderColor: WARNING, backgroundColor: "#FFFBEB" }}>
            <div className="text-sm font-semibold mb-1" style={{ color: "#92400E" }}>Cancellation Policy</div>
            <ul className="text-xs space-y-1" style={{ color: "#92400E" }}>
              <li>• Free cancellation up to 48 hours before check-in</li>
              <li>• Within 48 hours: 50% of first night charged (₦{cancFee.toLocaleString()})</li>
              <li>• No-show: 100% of first night charged</li>
            </ul>
          </div>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><span style={{ color: MUTED }}>Cancellation fee owed</span><span className="font-bold" style={{ color: ERROR }}>₦{cancFee.toLocaleString()}</span></div>
            <div className="flex justify-between"><span style={{ color: MUTED }}>Deposit paid</span><span style={{ color: TEXT }}>₦{deposit.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold border-t pt-2" style={{ borderColor: BORDER }}><span style={{ color: TEXT }}>Refundable amount</span><span style={{ color: refund > 0 ? SUCCESS : ERROR }}>₦{refund.toLocaleString()}</span></div>
          </div>
          <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-4" style={{ borderColor: waived ? WARNING : BORDER, backgroundColor: waived ? "#FFFBEB" : "white" }}>
            <div className="w-4 h-4 rounded border-2 flex items-center justify-center" style={{ borderColor: waived ? WARNING : "#CBD5E1", backgroundColor: waived ? WARNING : "transparent" }}>{waived && <CheckCircle2 size={10} color="white" />}</div>
            <input type="checkbox" className="hidden" checked={waived} onChange={e => setWaived(e.target.checked)} />
            <div><div className="text-sm font-medium" style={{ color: TEXT }}>Waive cancellation fee</div><div className="text-xs" style={{ color: MUTED }}>Requires manager authorisation and reason</div></div>
          </label>
          {waived && <div className="mb-4"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Reason for waiver</label><textarea className="w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none" rows={2} placeholder="e.g. Guest experienced medical emergency…" style={{ borderColor: BORDER }} /></div>}
          <div className="flex gap-3">
            <BtnO label="Cancel & Keep Fee" onClick={() => add({ type: "warning", title: "Reservation cancelled", body: `₦${(deposit - cancFee).toLocaleString()} refund queued` })} />
            <button onClick={() => add({ type: "error", title: "Reservation cancelled", body: `Full refund ₦${deposit.toLocaleString()} processed` })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: ERROR }}>Confirm Cancellation</button>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Process Refund</h3>
          <Sel label="Refund Method" options={["Original payment method", "Cash", "Bank Transfer"]} />
          <div className="mt-3"><Inp label="Refund Amount (₦)" defaultValue={refund.toLocaleString()} /></div>
          <div className="mt-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Notes for guest</label><textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} placeholder="Optional message to include with refund notification…" style={{ borderColor: BORDER }} /></div>
          <div className="mt-4"><BtnP label="Process Refund" icon={DollarSign} onClick={() => add({ type: "info", title: "Not available yet — no refund was issued", body: `Would be ₦${refund.toLocaleString()} → ${res.guest}` })} /></div>
        </div>
      </div>
    </div>
  );
}
