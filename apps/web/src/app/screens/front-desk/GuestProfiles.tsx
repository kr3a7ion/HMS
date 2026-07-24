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

export function GuestProfiles({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("All");
  const ALL_GUESTS = [
    { name: "Adaeze Okonkwo", id: "G-001", phone: "+234 801 111 2222", stays: 8, lastStay: "24 Jun", vip: true, tag: "Regular", activeStay: true, balance: 0 },
    { name: "Dr. Chukwuemeka Bello", id: "G-002", phone: "+234 803 555 6666", stays: 15, lastStay: "24 Jun", vip: true, tag: "VIP", activeStay: true, balance: 0 },
    { name: "Emmanuel Adeyemi", id: "G-003", phone: "+234 802 333 4444", stays: 3, lastStay: "23 Jun", vip: false, tag: "", activeStay: true, balance: 45000 },
    { name: "Ibrahim Lawal", id: "G-004", phone: "+234 805 999 0000", stays: 5, lastStay: "23 Jun", vip: false, tag: "Corporate", activeStay: true, balance: 0 },
    { name: "Fatima Al-Hassan", id: "G-005", phone: "+234 804 777 8888", stays: 1, lastStay: "22 Jun", vip: false, tag: "", activeStay: false, balance: 0 },
    { name: "Tunde Bakare", id: "G-006", phone: "+234 809 123 4567", stays: 2, lastStay: "20 Jun", vip: false, tag: "Corporate", activeStay: false, balance: 18500 },
    { name: "Ngozi Adeyemi", id: "G-007", phone: "+234 807 654 3210", stays: 4, lastStay: "18 Jun", vip: false, tag: "", activeStay: false, balance: 0 },
  ];
  const filtered = ALL_GUESTS.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase()) && !g.id.includes(search) && !g.phone.includes(search)) return false;
    if (filterTab === "VIP") return g.vip;
    if (filterTab === "Active Stay") return g.activeStay;
    if (filterTab === "Has Balance") return g.balance > 0;
    if (filterTab === "Blacklisted") return false;
    return true;
  });
  return (
    <div>
      <PageHeader title="Guest Profiles" sub={`${filtered.length} of ${ALL_GUESTS.length} profiles shown`} actions={<><BtnO label="Merge Duplicates" icon={Layers} /><BtnP label="New Guest Profile" icon={Plus} /></>} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b flex-wrap" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, phone, or ID…" className="pl-7 pr-3 py-1.5 text-xs rounded-xl border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          {["All", "VIP", "Active Stay", "Has Balance", "Blacklisted"].map(f => (
            <button key={f} onClick={() => setFilterTab(f)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all"
              style={{ borderColor: filterTab === f ? PRIMARY : BORDER, backgroundColor: filterTab === f ? PRIMARY : "white", color: filterTab === f ? "white" : MUTED }}>
              {f}
              {f === "VIP" && <span className="ml-1 opacity-70">{ALL_GUESTS.filter(g => g.vip).length}</span>}
              {f === "Active Stay" && <span className="ml-1 opacity-70">{ALL_GUESTS.filter(g => g.activeStay).length}</span>}
              {f === "Has Balance" && <span className="ml-1 opacity-70">{ALL_GUESTS.filter(g => g.balance > 0).length}</span>}
            </button>
          ))}
          {search && <button onClick={() => setSearch("")} className="text-xs" style={{ color: MUTED }}>Clear</button>}
          <span className="ml-auto text-xs" style={{ color: SUBTLE }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Guest", "Phone", "Total Stays", "Last Stay", "Balance", "Tags", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}><EmptyState icon={Users} message={filterTab === "Blacklisted" ? "No blacklisted guests on record." : `No guests match "${search || filterTab}"`} /></td></tr>
            ) : filtered.map((g, i) => (
              <tr key={g.id} onClick={() => nav && nav("guest-profile-detail", g.name)} className="border-t hover:bg-[#F8FAFC] cursor-pointer transition-colors" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: g.vip ? ORANGE : PRIMARY }}>{g.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                    <div>
                      <div className="flex items-center gap-2"><span className="text-sm font-semibold" style={{ color: TEXT }}>{g.name}</span>{g.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}{g.activeStay && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "#DCFCE7", color: "#166534" }}>In-house</span>}</div>
                      <span className="text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{g.id}</span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm" style={{ color: MUTED }}>{g.phone}</td>
                <td className="px-5 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{g.stays}</td>
                <td className="px-5 py-3.5 text-sm" style={{ color: MUTED }}>{g.lastStay}</td>
                <td className="px-5 py-3.5">{g.balance > 0 ? <span className="text-sm font-bold" style={{ color: ERROR }}>₦{g.balance.toLocaleString()}</span> : <span className="text-xs" style={{ color: SUBTLE }}>—</span>}</td>
                <td className="px-5 py-3.5">{g.tag && <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{g.tag}</span>}</td>
                <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button onClick={() => nav && nav("guest-profile-detail", g.name)} className="text-xs px-2.5 py-1.5 rounded-xl border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button>
                    <button onClick={() => nav && nav("new-reservation", g.name)} className="text-xs px-2.5 py-1.5 rounded-xl border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Reserve</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
