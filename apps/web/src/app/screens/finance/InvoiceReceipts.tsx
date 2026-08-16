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

export function InvoiceReceipts({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { Paid: { bg: "#DCFCE7", text: "#166534" }, Outstanding: { bg: "#FEF3C7", text: "#92400E" }, Refunded: { bg: "#EEF2FF", text: "#4338CA" }, Cancelled: { bg: "#F3F4F6", text: "#374151" } };
  return (
    <div>
      <PageHeader title="Invoice & Receipts" sub="All guest invoices and receipts" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Create Invoice" icon={Plus} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Invoiced", v: "₦687,100", c: TEXT }, { l: "Paid", v: "₦220,000", c: SUCCESS }, { l: "Outstanding", v: "₦467,100", c: ERROR }, { l: "Refunded", v: "₦55,000", c: "#6366F1" }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search invoice, guest…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} /></div>
          {["All", "Paid", "Outstanding", "Refunded"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "All" ? PRIMARY : BORDER, backgroundColor: f === "All" ? PRIMARY : "white", color: f === "All" ? "white" : MUTED }}>{f}</button>)}
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Invoice #", "Guest", "Room", "Date", "Amount", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{INVOICES_DATA.map(inv => <tr key={inv.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{inv.id}</td><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{inv.av}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{inv.guest}</span></div></td><td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>{inv.room}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{inv.date}</td><td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>₦{inv.amount.toLocaleString()}</td><td className="px-5 py-3"><Badge label={inv.status} colors={stC[inv.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button><button onClick={() => add({ type: "info", title: `Not available yet — this screen is not wired to the invoicing API. Invoice ${inv.id} sent` })} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Send</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
