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

export function ReservationDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Folio", "History", "Notes"];
  const res = ALL_RES[0];
  return (
    <div>
      <PageHeader title={`Reservation ${res.id}`} sub={`${res.guest} · Room ${res.room} ${res.type}`}
        actions={<><BtnO label="Modify" icon={Edit3} /><BtnO label="Cancel" /><BtnP label="Check In" icon={KeyRound} onClick={() => add({ type: "info", title: "Not available yet — this screen is not wired to check-in", body: res.guest })} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {/* Status banner */}
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" }}>
          <Badge label={res.status} colors={resStC[res.status] ?? { bg: "#F1F5F9", text: "#374151" }} />
          <span className="text-sm" style={{ color: SUCCESS }}>Arriving today at 14:00 · Suite 501 prepped and ready</span>
        </div>
        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: BORDER }}>
          {tabs.map(t => <button key={t} onClick={() => setTab(t)} className="px-6 py-3 text-sm font-medium transition-colors" style={{ color: tab === t ? PRIMARY : MUTED, borderBottom: tab === t ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{t}</button>)}
        </div>
        <div className="p-6">
          {tab === "Overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Booking Details</h3>
                <div className="space-y-2">{[["Reservation ID", res.id], ["Booking Type", "Individual"], ["Source", res.source], ["Room Type", res.type], ["Room Number", `Room ${res.room}`], ["Check-in", `${res.checkin} 2025, 14:00`], ["Check-out", `${res.checkout} 2025, 11:00`], ["Nights", `${res.nights}`], ["Rate Plan", "Standard Rate"], ["Nightly Rate", `₦${res.rate.toLocaleString()}`], ["Total", `₦${(res.rate * res.nights * 1.075).toLocaleString()} incl. VAT`]].map(([k, v]) => <div key={k} className="flex gap-4 text-sm"><span className="w-32 flex-shrink-0" style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v as string}</span></div>)}</div>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Guest Details</h3>
                <div className="flex items-center gap-3 p-4 rounded-xl mb-3" style={{ backgroundColor: "#F8FAFC" }}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: PRIMARY }}>CB</div>
                  <div><div className="flex items-center gap-2"><span className="text-sm font-semibold" style={{ color: TEXT }}>{res.guest}</span><Star size={13} fill={ORANGE} style={{ color: ORANGE }} /></div><div className="text-xs mt-0.5" style={{ color: MUTED }}>VIP · 15 previous stays</div></div>
                </div>
                <div className="space-y-2">{[["Phone", "+234 803 555 6666"], ["Email", "c.bello@example.com"], ["ID", "Passport · A12345678"], ["Special Requests", "Champagne, high floor, fruit basket"]].map(([k, v]) => <div key={k} className="flex gap-4 text-sm"><span className="w-32 flex-shrink-0" style={{ color: MUTED }}>{k}</span><span style={{ color: TEXT }}>{v as string}</span></div>)}</div>
              </div>
            </div>
          )}
          {tab === "Folio" && (
            <div>
              <div className="flex items-center justify-between mb-4"><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Folio Charges</h3><BtnP label="Post Charge" icon={Plus} /></div>
              <div className="text-sm text-center py-8" style={{ color: MUTED }}>No charges posted yet — guest has not checked in.</div>
            </div>
          )}
          {tab === "History" && (
            <div className="space-y-3">
              {[["24 Jun 09:15", "Reservation created via phone", "Fatima Al-Hassan"], ["24 Jun 09:20", "Room 501 pre-assigned", "System"], ["24 Jun 09:22", "Confirmation email sent", "System"], ["24 Jun 11:00", "Special request noted: Champagne + fruit basket", "Grace Mensah"]].map(([ts, action, by], i) => <div key={i} className="flex gap-3 text-sm"><span className="text-xs w-36 flex-shrink-0 pt-0.5" style={{ color: SUBTLE, fontFamily: mono }}>{ts as string}</span><div><div style={{ color: TEXT }}>{action as string}</div><div className="text-xs mt-0.5" style={{ color: MUTED }}>by {by as string}</div></div></div>)}
            </div>
          )}
          {tab === "Notes" && (
            <div>
              <div className="space-y-3 mb-4">{[{ note: "VIP guest — champagne on arrival, fruit basket, high floor preferred. Previous stays: always Suite.", by: "Grace Mensah", ts: "24 Jun 09:22" }].map((n, i) => <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><p className="text-sm" style={{ color: TEXT }}>{n.note}</p><div className="text-xs mt-2" style={{ color: MUTED }}>{n.by} · {n.ts}</div></div>)}</div>
              <div><textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} placeholder="Add an internal note…" style={{ borderColor: BORDER }} /><div className="mt-2"><BtnP label="Add Note" icon={Plus} onClick={() => add({ type: "info", title: "Not available yet — the note was not saved" })} /></div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
