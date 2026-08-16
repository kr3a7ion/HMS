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
import { toKobo, formatNaira } from "../../lib/money";

export function NewReservation({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [guestQuery, setGuestQuery] = useState("");
  const [guestResults, setGuestResults] = useState<ApiGuest[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<ApiGuest | null>(null);
  const [newGuestMode, setNewGuestMode] = useState(false);
  const [newGuest, setNewGuest] = useState({ firstName: "", lastName: "", phone: "" });
  const [roomId, setRoomId] = useState("");
  const [checkInDate, setCheckInDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [checkOutDate, setCheckOutDate] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [rate, setRate] = useState("55000");
  const [adults, setAdults] = useState("1");
  const [children, setChildren] = useState("0");
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => { roomsApi.list().then(setRooms).catch(() => {}); }, []);
  useEffect(() => {
    if (!guestQuery.trim()) { setGuestResults([]); return; }
    const t = setTimeout(() => { guestsApi.search(guestQuery).then(setGuestResults).catch(() => {}); }, 250);
    return () => clearTimeout(t);
  }, [guestQuery]);

  const nights = Math.max(1, Math.round((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / 86400000));
  const total = Number(rate) * nights;

  const submit = async () => {
    setFormError("");
    if (!selectedGuest && !(newGuestMode && newGuest.firstName && newGuest.lastName)) {
      setFormError("Select an existing guest or fill in the new guest's name."); return;
    }
    if (!rate || Number(rate) <= 0) { setFormError("Enter a valid nightly rate."); return; }
    setSubmitting(true);
    try {
      const created = await reservationsApi.create({
        guestId: selectedGuest?.id,
        newGuest: !selectedGuest ? { firstName: newGuest.firstName, lastName: newGuest.lastName, phone: newGuest.phone || undefined } : undefined,
        roomId: roomId || undefined,
        checkInDate: new Date(checkInDate).toISOString(),
        checkOutDate: new Date(checkOutDate).toISOString(),
        rateKobo: toKobo(Number(rate)),
        adults: Number(adults),
        children: Number(children),
        specialRequests: specialRequests || undefined,
      });
      add({ type: "success", title: "Reservation confirmed!", body: `${selectedGuest ? selectedGuest.firstName + " " + selectedGuest.lastName : newGuest.firstName + " " + newGuest.lastName} · ${nights} night(s)` });
      navigate(`/reservations/grid`);
      void created;
    } catch (err: any) {
      if (err?.code === "ROOM_CONFLICT") setFormError("That room is already booked for an overlapping date range. Pick a different room or date.");
      else setFormError("Couldn't create the reservation. Please check the form and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Reservation" sub="Create a reservation for an individual guest" />
      {formError && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: ERROR }}>{formError}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Guest</h3>
            {selectedGuest ? (
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: "#EFF6FF" }}>
                <span className="text-sm font-medium" style={{ color: TEXT }}>{selectedGuest.firstName} {selectedGuest.lastName} {selectedGuest.phone && <span style={{ color: MUTED }}>· {selectedGuest.phone}</span>}</span>
                <button onClick={() => setSelectedGuest(null)} className="text-xs" style={{ color: TEAL }}>Change</button>
              </div>
            ) : newGuestMode ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <input value={newGuest.firstName} onChange={e => setNewGuest(p => ({ ...p, firstName: e.target.value }))} placeholder="First name" className="px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} />
                  <input value={newGuest.lastName} onChange={e => setNewGuest(p => ({ ...p, lastName: e.target.value }))} placeholder="Last name" className="px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} />
                </div>
                <input value={newGuest.phone} onChange={e => setNewGuest(p => ({ ...p, phone: e.target.value }))} placeholder="Phone (optional)" className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} />
                <button onClick={() => setNewGuestMode(false)} className="text-xs" style={{ color: MUTED }}>Search existing guest instead</button>
              </div>
            ) : (
              <>
                <div className="relative mb-2"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={guestQuery} onChange={e => setGuestQuery(e.target.value)} placeholder="Search existing guests by name or phone…" className="pl-9 pr-4 py-2.5 w-full border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                {guestResults.length > 0 && (
                  <div className="space-y-1 mb-2">{guestResults.map(g => (
                    <button key={g.id} onClick={() => { setSelectedGuest(g); setGuestResults([]); setGuestQuery(""); }} className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[#F8FAFC]" style={{ color: TEXT }}>{g.firstName} {g.lastName} {g.phone && <span style={{ color: MUTED }}>· {g.phone}</span>}</button>
                  ))}</div>
                )}
                <button onClick={() => setNewGuestMode(true)} className="text-xs font-medium flex items-center gap-1" style={{ color: TEAL }}><Plus size={12} />Create new guest profile</button>
              </>
            )}
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Dates &amp; Room</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Check-In Date</label><input type="date" value={checkInDate} onChange={e => setCheckInDate(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Check-Out Date</label><input type="date" value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            </div>
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Room (optional — can assign at check-in)</label>
              <select value={roomId} onChange={e => setRoomId(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                <option value="">Auto-assign later</option>
                {rooms.map(r => <option key={r.id} value={r.id}>Room {r.number} — {r.type} ({r.status})</option>)}
              </select>
            </div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Rate &amp; Details</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Nightly Rate (₦)</label><input type="number" value={rate} onChange={e => setRate(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Adults</label><select value={adults} onChange={e => setAdults(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>{["1", "2", "3", "4"].map(n => <option key={n}>{n}</option>)}</select></div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Children</label><select value={children} onChange={e => setChildren(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>{["0", "1", "2"].map(n => <option key={n}>{n}</option>)}</select></div>
            </div>
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Special Requests</label><textarea value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={2} placeholder="High floor, extra pillows…" style={{ borderColor: BORDER }} /></div>
          </div>
        </div>
        <div>
          <div className="bg-white rounded-xl border p-5 sticky top-4" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Reservation Summary</h3>
            <div className="space-y-2 text-sm mb-4">
              {[["Check-In", checkInDate], ["Check-Out", checkOutDate], ["Nights", String(nights)], ["Rate", `₦${Number(rate || 0).toLocaleString()} / night`]].map(([k, v]) => <div key={k} className="flex justify-between"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}
              <div className="pt-2 mt-2 border-t flex justify-between font-bold text-base" style={{ borderColor: BORDER, color: TEXT }}><span>Total</span><span>₦{total.toLocaleString()}</span></div>
            </div>
            <BtnP label={submitting ? "Creating…" : "Confirm Reservation"} icon={CheckCircle2} onClick={submit} />
          </div>
        </div>
      </div>
    </div>
  );
}
