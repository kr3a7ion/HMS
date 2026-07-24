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

export function HousekeepingSchedule({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const attendants = ["Grace Achebe", "Amaka Osei", "Ngozi Ike"];
  const roomGroups = [["101", "102", "103", "104"], ["201", "202", "203", "204"], ["301", "302", "303", "304"]];
  const assigned: Record<string, string> = { "101": "Grace Achebe", "102": "Grace Achebe", "103": "Amaka Osei", "104": "Grace Achebe", "201": "Ngozi Ike", "202": "Ngozi Ike", "203": "", "204": "", "301": "Amaka Osei", "302": "Ngozi Ike", "303": "", "304": "" };
  return (
    <div>
      <PageHeader title="Housekeeping Schedule" sub="24 Jun 2025 · Room assignments per attendant" actions={<><BtnO label="Balance Workload" icon={RefreshCw} /><BtnP label="Print Assignments" icon={FileText} /></>} />
      <div className="grid grid-cols-3 gap-4 mb-5">{attendants.map(a => { const count = Object.values(assigned).filter(v => v === a).length; return <div key={a} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white mx-auto mb-2" style={{ backgroundColor: PRIMARY }}>{a.split(" ").map(n => n[0]).join("")}</div><div className="text-sm font-semibold" style={{ color: TEXT }}>{a}</div><div className="text-2xl font-bold mt-1" style={{ color: PRIMARY }}>{count}</div><div className="text-xs" style={{ color: MUTED }}>rooms assigned</div></div>; })}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex" style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: "#F8FAFC" }}>
          <div className="w-20 flex-shrink-0 px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Room</div>
          {attendants.map(a => <div key={a} className="flex-1 text-center py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{a.split(" ")[0]}</div>)}
        </div>
        {roomGroups.flatMap(g => g).map(room => <div key={room} className="flex items-center border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9", minHeight: 44 }}><div className="w-20 flex-shrink-0 px-4 py-2 font-bold" style={{ color: PRIMARY }}>{room}</div>{attendants.map(a => <div key={a} className="flex-1 flex justify-center py-2"><div onClick={() => add({ type: "info", title: assigned[room] === a ? `Unassign ${a} from ${room}` : `Assign ${a} to ${room}` })} className="w-6 h-6 rounded border-2 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform" style={{ borderColor: assigned[room] === a ? PRIMARY : "#CBD5E1", backgroundColor: assigned[room] === a ? PRIMARY : "transparent" }}>{assigned[room] === a && <CheckCircle2 size={12} color="white" />}</div></div>)}</div>)}
      </div>
    </div>
  );
}
