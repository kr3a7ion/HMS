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

export function ReservationGrid({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [reservations, setReservations] = useState<ReservationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true); setError("");
    Promise.all([roomsApi.list(), reservationsApi.list()])
      .then(([r, res]) => { setRooms(r); setReservations(res); })
      .catch(() => setError("Couldn't load rooms and reservations from the local server."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const resForRoom = (roomId: string) => reservations.find(r => r.roomId === roomId && (r.status === "confirmed" || r.status === "checked_in"));

  return (
    <div>
      <PageHeader title="Reservation Grid" sub={loading ? "Loading…" : `${rooms.length} rooms · ${reservations.length} active reservations`}
        actions={<BtnP label="New Reservation" icon={Plus} onClick={() => navigate("/reservations/new")} />} />
      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>{error} <button onClick={load} className="underline font-medium">Retry</button></div>}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        {loading ? (
          <div className="p-5 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-lg animate-pulse" style={{ backgroundColor: "#F1F5F9" }} />)}</div>
        ) : rooms.length === 0 ? (
          <EmptyState icon={BedDouble} message="No rooms configured for this branch yet." />
        ) : (
          <table className="w-full">
            <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Type", "Status", "Current / Next Reservation", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{rooms.map(room => {
              const res = resForRoom(room.id);
              const c = roomStC[room.status === "available" ? "Available" : room.status === "occupied" ? "Occupied" : room.status === "cleaning" ? "Cleaning" : room.status === "maintenance" ? "Maintenance" : "Available"] ?? { bg: "#F3F4F6", text: "#374151" };
              return (
                <tr key={room.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
                  <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{room.number}</div><span className="text-sm font-semibold" style={{ color: TEXT }}>Room {room.number}</span></div></td>
                  <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{room.type}</td>
                  <td className="px-5 py-3"><span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: c.bg, color: c.text }}>{room.status}</span></td>
                  <td className="px-5 py-3 text-sm">
                    {res ? (
                      <span style={{ color: TEXT }}>{res.guestFirstName} {res.guestLastName} · {new Date(res.checkInDate).toLocaleDateString()} → {new Date(res.checkOutDate).toLocaleDateString()} <Badge label={res.status} colors={resStC[res.status === "confirmed" ? "Confirmed" : "Checked In"] ?? { bg: "#F1F5F9", text: MUTED }} /></span>
                    ) : <span style={{ color: SUBTLE }}>—</span>}
                  </td>
                  <td className="px-5 py-3">
                    {res && res.status === "confirmed" && <button onClick={() => navigate(`/front-desk/check-in?reservationId=${res.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Check In</button>}
                    {res && res.status === "checked_in" && <button onClick={() => navigate(`/front-desk/folio/${res.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Folio</button>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
