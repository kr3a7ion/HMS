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

export function RoomServiceOrders({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { "In Kitchen": { bg: "#DBEAFE", text: "#1E40AF" }, "Delivered": { bg: "#DCFCE7", text: "#166534" }, "Assigned": { bg: "#FEF3C7", text: "#92400E" } };
  return (
    <div>
      <PageHeader title="Room Service Orders" sub="Manage and track room service from placement to delivery" />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Active Orders", v: "1", c: ORANGE }, { l: "In Kitchen", v: "1", c: PRIMARY }, { l: "Delivered Today", v: "3", c: SUCCESS }, { l: "Avg Delivery", v: "22 min", c: TEAL }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Order ID", "Room", "Guest", "Items", "Ordered", "Promised", "Status", "Assigned To", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{ROOM_SERVICE_ORDERS.map(o => <tr key={o.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.id}</td><td className="px-4 py-3 font-bold" style={{ color: PRIMARY }}>{o.room}</td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{o.guest}</td><td className="px-4 py-3 text-xs max-w-36" style={{ color: MUTED }}>{o.items}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.ordered}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.promised}</td><td className="px-4 py-3"><Badge label={o.status} colors={stC[o.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{o.assigned}</td><td className="px-4 py-3"><button onClick={() => add({ type: "success", title: `${o.id} marked delivered` })} className="text-xs px-2 py-1 rounded border" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Delivered</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
