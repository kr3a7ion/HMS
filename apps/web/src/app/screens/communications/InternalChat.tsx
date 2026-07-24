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

export function InternalChat({ add }: { add: AddToast }) {
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msg, setMsg] = useState("");
  const [showDmPicker, setShowDmPicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadChannels = () => chatApi.listChannels().then(chs => {
    setChannels(chs);
    setActiveId(id => id ?? chs.find(c => c.name === "All Staff")?.id ?? chs[0]?.id ?? null);
  }).catch(() => {});

  useEffect(() => {
    Promise.all([authApi.me(), usersApi.list()]).then(([m, s]) => { setMe(m); setStaff(s.filter(u => u.id !== m.id)); });
    loadChannels();
    const poll = setInterval(loadChannels, 15000);
    return () => clearInterval(poll);
  }, []);

  const loadMessages = () => { if (activeId) chatApi.listMessages(activeId).then(setMessages).catch(() => {}); };
  useEffect(() => {
    loadMessages();
    const poll = setInterval(loadMessages, 4000);
    return () => clearInterval(poll);
  }, [activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const send = async (emergency = false) => {
    if (!msg.trim() || !activeId) return;
    try {
      await chatApi.sendMessage(activeId, msg.trim(), emergency);
      setMsg("");
      loadMessages();
      if (emergency) add({ type: "warning", title: "Emergency broadcast sent to #All Staff" });
    } catch {
      add({ type: "error", title: "Couldn't send message" });
    }
  };

  const startDm = async (otherUserId: string) => {
    try {
      const { id } = await chatApi.startDm(otherUserId);
      setShowDmPicker(false);
      loadChannels();
      setActiveId(id);
    } catch {
      add({ type: "error", title: "Couldn't start conversation" });
    }
  };

  const active = channels.find(c => c.id === activeId);
  const activeName = active?.type === "dm" ? `${active.otherUser?.firstName ?? "Unknown"} ${active.otherUser?.lastName ?? ""}` : active?.name ?? "";
  const allStaffId = channels.find(c => c.name === "All Staff")?.id;

  return (
    <div>
      <PageHeader title="Internal Chat" sub="LAN-based staff messaging · Polling every 4s" actions={
        <button onClick={() => { if (allStaffId) { setActiveId(allStaffId); setMsg(m => m || "🚨 "); } }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: ERROR }}><AlertTriangle size={14} />Emergency Broadcast</button>
      } />
      <div className="bg-white rounded-xl border overflow-hidden flex" style={{ borderColor: BORDER, height: 560 }}>
        <div className="w-56 flex-shrink-0 border-r flex flex-col" style={{ borderColor: BORDER }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}><div className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Channels</div></div>
          <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "none" }}>
            {channels.filter(c => c.type === "department").map(ch => (
              <button key={ch.id} onClick={() => setActiveId(ch.id)} className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]" style={{ backgroundColor: activeId === ch.id ? "#EFF6FF" : "transparent", borderLeft: activeId === ch.id ? `3px solid ${PRIMARY}` : "3px solid transparent" }}>
                <span className="text-sm font-medium" style={{ color: activeId === ch.id ? PRIMARY : TEXT }}>#{ch.name}</span>
              </button>
            ))}
            <div className="px-4 py-2 mt-2 border-t flex items-center justify-between" style={{ borderColor: BORDER }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Direct Messages</div>
              <button onClick={() => setShowDmPicker(p => !p)} className="text-xs" style={{ color: TEAL }}><Plus size={12} /></button>
            </div>
            {showDmPicker && (
              <div className="px-2 pb-2 space-y-0.5">{staff.map(s => <button key={s.id} onClick={() => startDm(s.id)} className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-[#F8FAFC]" style={{ color: TEXT }}>{s.firstName} {s.lastName} <span style={{ color: SUBTLE }}>({s.role})</span></button>)}</div>
            )}
            {channels.filter(c => c.type === "dm").map(ch => (
              <button key={ch.id} onClick={() => setActiveId(ch.id)} className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-[#F8FAFC] rounded-lg px-4" style={{ backgroundColor: activeId === ch.id ? "#EFF6FF" : "transparent" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{(ch.otherUser?.firstName?.[0] ?? "") + (ch.otherUser?.lastName?.[0] ?? "")}</div>
                <div className="min-w-0"><div className="text-xs font-medium truncate" style={{ color: TEXT }}>{ch.otherUser?.firstName}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${PRIMARY}18` }}><MessageSquare size={16} style={{ color: PRIMARY }} /></div>
            <div><div className="text-sm font-semibold" style={{ color: TEXT }}>{active?.type === "dm" ? activeName : `#${activeName}`}</div><div className="text-xs" style={{ color: SUBTLE }}>{active?.type === "dm" ? "Direct message" : "Department channel"}</div></div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "none" }}>
            {messages.map(m => { const mine = m.senderId === me?.id; return (
              <div key={m.id} className={`flex items-end gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                {!mine && <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mb-1" style={{ backgroundColor: m.emergency ? ERROR : PRIMARY }}>{(m.senderFirstName?.[0] ?? "") + (m.senderLastName?.[0] ?? "")}</div>}
                <div className={`max-w-xs lg:max-w-md ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && <span className="text-xs font-medium mb-1" style={{ color: MUTED }}>{m.senderFirstName} {m.senderLastName}</span>}
                  <div className="px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: m.emergency ? "#FEE2E2" : mine ? PRIMARY : "#F1F5F9", color: m.emergency ? ERROR : mine ? "white" : TEXT, border: m.emergency ? `1px solid ${ERROR}40` : "none", fontWeight: m.emergency ? 600 : 400 }}>{m.body}</div>
                  <span className="text-xs mt-1" style={{ color: SUBTLE, fontFamily: mono }}>{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ); })}
            <div ref={endRef} />
          </div>
          <div className="px-5 py-3 border-t" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-3">
              <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`Message ${active?.type === "dm" ? activeName : `#${activeName}`}…`} className="flex-1 px-4 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} />
              <button onClick={() => send()} className="w-10 h-10 rounded-xl flex items-center justify-center text-white hover:opacity-90" style={{ backgroundColor: PRIMARY }}><Send size={16} /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
