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

export function GuestMessaging({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [active, setActive] = useState("Adaeze Okonkwo");
  const [msg, setMsg] = useState("");
  const convos: Record<string, { room: string; msgs: Array<{ text: string; from: string; time: string }> }> = {
    "Adaeze Okonkwo": { room: "101", msgs: [{ text: "Hello, could I get extra towels in my room please?", from: "guest", time: "09:12" }, { text: "Of course! I'll have housekeeping bring them up right away.", from: "staff", time: "09:14" }, { text: "Thank you so much! 😊", from: "guest", time: "09:15" }] },
    "Emmanuel Adeyemi": { room: "202", msgs: [{ text: "What time does the restaurant open for dinner?", from: "guest", time: "08:45" }, { text: "The restaurant opens for dinner at 18:00. Would you like a reservation?", from: "staff", time: "08:47" }] },
    "Dr. Chukwuemeka Bello": { room: "501", msgs: [{ text: "I'll be arriving at approximately 18:30. Please ensure the champagne is ready.", from: "guest", time: "11:00" }, { text: "Absolutely, Doctor. Suite 501 is fully prepared. We look forward to welcoming you!", from: "staff", time: "11:03" }] },
  };
  const current = convos[active] ?? { room: "—", msgs: [] };
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active]);
  return (
    <div>
      <PageHeader title="Guest Messaging" sub="Message in-house guests via WhatsApp, SMS, or internal portal" />
      <div className="bg-white rounded-xl border flex overflow-hidden" style={{ borderColor: BORDER, height: 560 }}>
        <div className="w-64 flex-shrink-0 border-r flex flex-col" style={{ borderColor: BORDER }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}><div className="relative"><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search guests…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-full" style={{ borderColor: BORDER }} /></div></div>
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            {Object.entries(convos).map(([name, c]) => <button key={name} onClick={() => setActive(name)} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b hover:bg-[#F8FAFC] transition-colors" style={{ borderColor: "#F8FAFC", backgroundColor: active === name ? "#EFF6FF" : "transparent", borderLeft: active === name ? `3px solid ${PRIMARY}` : "3px solid transparent" }}><div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><div className="min-w-0"><div className="text-xs font-semibold truncate" style={{ color: TEXT }}>{name}</div><div className="text-xs" style={{ color: SUBTLE }}>Room {c.room}</div></div></button>)}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
            <div><div className="text-sm font-semibold" style={{ color: TEXT }}>{active}</div><div className="text-xs" style={{ color: SUBTLE }}>Room {current.room} · via WhatsApp</div></div>
            <div className="flex gap-2 text-xs" style={{ color: MUTED }}><button className="flex items-center gap-1 px-2 py-1 rounded border hover:bg-white" style={{ borderColor: BORDER }}><Phone size={11} />Call</button></div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: "none" }}>
            {current.msgs.map((m, i) => <div key={i} className={`flex ${m.from === "staff" ? "justify-end" : "justify-start"}`}><div className="max-w-xs"><div className="px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: m.from === "staff" ? PRIMARY : "#F1F5F9", color: m.from === "staff" ? "white" : TEXT }}>{m.text}</div><div className="text-xs mt-1" style={{ color: SUBTLE, textAlign: m.from === "staff" ? "right" : "left", fontFamily: mono }}>{m.time}</div></div></div>)}
            <div ref={endRef} />
          </div>
          <div className="px-5 py-3 border-t" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-3"><input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && msg.trim() && (add({ type: "success", title: "Message sent" }), setMsg(""))} placeholder="Type a message…" className="flex-1 px-4 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} /><button onClick={() => { if (msg.trim()) { add({ type: "success", title: "Message sent" }); setMsg(""); } }} className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: PRIMARY }}><Send size={16} /></button></div>
            <div className="flex gap-2 mt-2">{["WhatsApp", "SMS", "In-App"].map(c => <button key={c} className="text-xs px-2 py-1 rounded border" style={{ color: c === "WhatsApp" ? SUCCESS : MUTED, borderColor: c === "WhatsApp" ? `${SUCCESS}50` : BORDER }}>{c}</button>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
