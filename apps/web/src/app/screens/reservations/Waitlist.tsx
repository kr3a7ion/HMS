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

export function Waitlist({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Waitlist" sub={`${WAITLIST_DATA.length} guests waiting for a room`} actions={<BtnP label="Add to Waitlist" icon={Plus} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Priority", "Ref", "Guest", "Room Type", "Requested Dates", "Waiting", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{WAITLIST_DATA.map(w => (
            <tr key={w.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3"><div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm" style={{ backgroundColor: w.priority === 1 ? ERROR : w.priority === 2 ? ORANGE : MUTED }}>{w.priority}</div></td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{w.id}</td>
              <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{w.guest}</td>
              <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{w.type}</span></td>
              <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{w.dates}</td>
              <td className="px-5 py-3 text-xs font-semibold" style={{ color: ORANGE }}>{w.waiting}</td>
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Not available yet — the waitlist needs B12. ${w.guest} promoted to reservation` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Promote</button><button onClick={() => add({ type: "info", title: `Contacted ${w.guest}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Contact</button><button onClick={() => add({ type: "warning", title: `${w.guest} removed from waitlist` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Remove</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
