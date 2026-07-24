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

export function WalkInReg({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [step, setStep] = useState(1);
  return (
    <div>
      <PageHeader title="Walk-In Registration" sub="Register a new guest and check in simultaneously" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {step === 1 && <>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Guest Information</h3>
              <div className="grid grid-cols-2 gap-3">
                <Inp label="First Name" placeholder="Chukwuemeka" />
                <Inp label="Last Name" placeholder="Okafor" />
                <Inp label="Phone" placeholder="+234 801 234 5678" />
                <Inp label="Email" placeholder="guest@email.com" />
                <Sel label="ID Type" options={["International Passport", "National ID", "Driver's License"]} />
                <Inp label="ID Number" placeholder="A12345678" />
              </div>
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Stay Details</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Inp label="Check-in Date" type="date" defaultValue="2025-06-24" />
                <Inp label="Check-out Date" type="date" defaultValue="2025-06-25" />
                <Sel label="Room Type" options={["Standard — ₦35,000/night", "Deluxe — ₦55,000/night", "Suite — ₦85,000/night"]} />
                <Sel label="Room" options={["Auto-assign", "Room 102 (Standard)", "Room 104 (Standard)"]} />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "#F0FDF4", color: SUCCESS }}><CheckCircle2 size={13} />18 rooms available for tonight</div>
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Payment</h3>
              <div className="grid grid-cols-2 gap-3"><Inp label="Deposit (₦)" defaultValue="35,000" /><Sel label="Method" options={["Cash", "POS / Card", "Bank Transfer"]} /></div>
            </div>
          </>}
          {step === 2 && (
            <div className="bg-white rounded-xl border p-10 text-center" style={{ borderColor: BORDER }}>
              <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: SUCCESS }} />
              <h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Guest Registered & Checked In</h2>
              <p className="text-sm mb-2" style={{ color: MUTED }}>Chukwuemeka Okafor · Room 102 · BK-2860 created</p>
              <p className="text-sm mb-5" style={{ color: TEAL }}>Deposit: ₦35,000 Cash received. Folio opened.</p>
              <div className="flex justify-center gap-3"><BtnO label="Print Receipt" icon={FileText} /><BtnO label="Activate Room Access" icon={Lock} /></div>
            </div>
          )}
          {step === 1 && <BtnP label="Register & Check In →" icon={CheckCircle2} onClick={() => { setStep(2); add({ type: "success", title: "Walk-in registered", body: "BK-2860 created · Room 102" }); }} />}
        </div>
        <div className="bg-white rounded-xl border p-5 h-fit" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Summary</h3>
          <div className="space-y-2 text-sm">{[["Guest", "—"], ["Room", "Standard (auto-assign)"], ["Check-in", "24 Jun 2025"], ["Check-out", "25 Jun 2025"], ["Nights", "1"], ["Rate", "₦35,000"], ["VAT", "₦2,625"], ["Total", "₦37,625"]].map(([k, v]) => <div key={k} className="flex justify-between"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v as string}</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}
