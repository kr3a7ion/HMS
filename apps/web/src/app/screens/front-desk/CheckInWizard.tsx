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
  doorLockApi, type IssueCredentialResult,
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
import { formatNaira } from "../../lib/money";

export function CheckInWizard({ add }: { add: AddToast }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedId = searchParams.get("reservationId");

  const [step, setStep] = useState(1);
  const [arrivals, setArrivals] = useState<ReservationListItem[]>([]);
  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [selRes, setSelRes] = useState<string | null>(preselectedId);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [doorLockEnabled, setDoorLockEnabled] = useState(false);
  // Step 7 (Blueprint 6.4). Credentials are issued against the reservation
  // BEFORE the actual check-in status flip -- /door-lock/issue only needs
  // a room assigned, not status="checked_in" yet -- so "Complete Check-In"
  // at the end of step 7 is the single moment the real status changes.
  const [issuedCard, setIssuedCard] = useState<IssueCredentialResult | null>(null);
  const [issuedPin, setIssuedPin] = useState<IssueCredentialResult & { pin?: string } | null>(null);
  const [issuingCard, setIssuingCard] = useState(false);
  const [issuingPin, setIssuingPin] = useState(false);
  const [physicalKeyLogged, setPhysicalKeyLogged] = useState(false);
  const STEPS = doorLockEnabled
    ? ["Select Reservation", "Verify Guest", "Assign Room", "Payment", "Receipt", "Confirm", "Activate Access"]
    : ["Select Reservation", "Verify Guest", "Assign Room", "Payment", "Receipt", "Confirm"];
  const LAST_STEP = STEPS.length;

  useEffect(() => {
    Promise.all([reservationsApi.list(), roomsApi.list(), settingsApi.getBranch()])
      .then(([res, rms, settings]) => {
        setArrivals(res.filter(r => r.status === "confirmed"));
        setRooms(rms.filter(r => r.status === "available"));
        setDoorLockEnabled(settings.enabledModules.includes("doorLock"));
      })
      .catch(() => setError("Couldn't load arrivals or rooms."))
      .finally(() => setLoading(false));
  }, []);

  const selData = arrivals.find(a => a.id === selRes);
  useEffect(() => { if (selData?.roomId) setSelRoom(selData.roomId); }, [selData]);

  const issueCard = async () => {
    if (!selRes) return;
    setIssuingCard(true);
    try {
      const result = await doorLockApi.issue({ reservationId: selRes, credentialType: "card" });
      setIssuedCard(result);
      if (result.status === "failed") add({ type: "error", title: "Couldn't encode card — room may not be mapped to a lock yet (Settings > Door Lock Integration)" });
    } catch { add({ type: "error", title: "Couldn't encode card" }); }
    finally { setIssuingCard(false); }
  };

  const issuePin = async () => {
    if (!selRes) return;
    setIssuingPin(true);
    try {
      const result = await doorLockApi.issue({ reservationId: selRes, credentialType: "pin" });
      setIssuedPin(result);
      if (result.status === "failed") add({ type: "error", title: "Couldn't generate PIN — room may not be mapped to a lock yet (Settings > Door Lock Integration)" });
    } catch { add({ type: "error", title: "Couldn't generate PIN" }); }
    finally { setIssuingPin(false); }
  };

  const logPhysicalKey = async () => {
    if (!selRes) return;
    try {
      await doorLockApi.physicalKey({ reservationId: selRes, keyReference: `Room ${rooms.find(r => r.id === selRoom)?.number ?? selRoom} - Key` });
      setPhysicalKeyLogged(true);
      add({ type: "info", title: "Physical key logged" });
    } catch { add({ type: "error", title: "Couldn't log physical key" }); }
  };

  const confirmCheckIn = async () => {
    if (!selRes) return;
    setConfirming(true); setError("");
    try {
      await reservationsApi.checkIn(selRes, selRoom ?? undefined);
      add({ type: "success", title: "Check-in complete!", body: `${selData?.guestFirstName ?? "Guest"} ${selData?.guestLastName ?? ""} checked in` });
      navigate(`/front-desk/folio/${selRes}`);
    } catch (err: any) {
      if (err?.code === "ROOM_NOT_AVAILABLE") setError("That room isn't available anymore — pick a different one.");
      else if (err?.code === "NO_ROOM_ASSIGNED") setError("Assign a room before confirming.");
      else setError("Couldn't complete check-in. Please try again.");
      setStep(3);
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <div className="p-5"><div className="h-64 rounded-xl animate-pulse" style={{ backgroundColor: "#F1F5F9" }} /></div>;

  return (
    <div>
      <PageHeader title="Guest Check-In" sub={`Real steps: Select Reservation, Assign Room, Confirm${doorLockEnabled ? ", Activate Access" : ""} — ID upload, payment intake, and receipt generation stay placeholder until those modules land`} />
      {error && <div className="px-4 py-3 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: ERROR }}>{error}</div>}
      <div className="bg-white rounded-xl border p-5 mb-4" style={{ borderColor: BORDER }}>
        <div className="flex items-center">{STEPS.map((s, i) => { const n = i + 1; const done = n < step; const active = n === step; return <div key={s} className="flex items-center flex-1"><div className="flex flex-col items-center flex-shrink-0"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: done ? SUCCESS : active ? PRIMARY : BORDER, color: done || active ? "white" : SUBTLE }}>{done ? <CheckCircle2 size={14} /> : n}</div><span className="text-xs mt-1 text-center w-16" style={{ color: active ? PRIMARY : done ? SUCCESS : SUBTLE, fontWeight: active ? 600 : 400 }}>{s}</span></div>{i < STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 mb-4" style={{ backgroundColor: done ? SUCCESS : BORDER }} />}</div>; })}</div>
      </div>
      <div className="bg-white rounded-xl border p-6" style={{ borderColor: BORDER }}>
        {step === 1 && <div><h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Select Reservation</h2><p className="text-sm mb-4" style={{ color: MUTED }}>Confirmed reservations awaiting check-in.</p>
          {arrivals.length === 0 ? <EmptyState icon={KeyRound} message="No confirmed reservations awaiting check-in." /> : (
            <div className="space-y-2">{arrivals.map(a => <div key={a.id} onClick={() => setSelRes(a.id)} className="flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all" style={{ borderColor: selRes === a.id ? PRIMARY : BORDER, backgroundColor: selRes === a.id ? "#EFF6FF" : "white" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{(a.guestFirstName?.[0] ?? "") + (a.guestLastName?.[0] ?? "")}</div>
              <div className="flex-1"><div className="text-sm font-semibold" style={{ color: TEXT }}>{a.guestFirstName} {a.guestLastName}</div><div className="text-xs mt-0.5" style={{ color: MUTED }}>{a.roomNumber ? `Room ${a.roomNumber} · ` : "No room assigned · "}{new Date(a.checkInDate).toLocaleDateString()} → {new Date(a.checkOutDate).toLocaleDateString()}</div></div>
              <div className="text-sm font-bold" style={{ color: TEXT }}>{formatNaira(a.rateKobo)}/night</div>
              {selRes === a.id && <CheckCircle2 size={20} style={{ color: PRIMARY }} />}
            </div>)}</div>
          )}
        </div>}
        {step === 2 && selData && <div><h2 className="text-base font-semibold mb-4" style={{ color: TEXT }}>Verify Guest</h2><div className="grid grid-cols-2 gap-4 mb-4"><Inp label="Full Name" defaultValue={`${selData.guestFirstName} ${selData.guestLastName}`} /><Sel label="ID Type" options={["International Passport", "National ID Card", "Driver's License"]} /></div><div className="border-2 border-dashed rounded-xl p-6 text-center" style={{ borderColor: BORDER }}><FileText size={24} className="mx-auto mb-2" style={{ color: SUBTLE }} /><p className="text-sm" style={{ color: MUTED }}>Upload or scan ID document</p><p className="text-xs mt-2" style={{ color: SUBTLE }}>(Not yet wired to storage — visual only)</p></div></div>}
        {step === 3 && <div><h2 className="text-base font-semibold mb-2" style={{ color: TEXT }}>Assign Room</h2><p className="text-sm mb-4" style={{ color: MUTED }}>Available rooms for this branch.</p>
          {rooms.length === 0 ? <EmptyState icon={BedDouble} message="No available rooms right now." /> : (
            <div className="grid grid-cols-3 gap-3">{rooms.map(r => <div key={r.id} onClick={() => setSelRoom(r.id)} className="p-4 rounded-xl border-2 cursor-pointer transition-all" style={{ borderColor: selRoom === r.id ? PRIMARY : BORDER, backgroundColor: selRoom === r.id ? "#EFF6FF" : "white" }}><div className="flex items-center justify-between mb-1"><span className="text-lg font-bold" style={{ color: TEXT }}>{r.number}</span>{selRoom === r.id && <CheckCircle2 size={16} style={{ color: PRIMARY }} />}</div><div className="text-xs" style={{ color: MUTED }}>{r.type} · F{r.floor}</div><Badge label="Available" colors={{ bg: "#DCFCE7", text: "#166534" }} /></div>)}</div>
          )}
        </div>}
        {step === 4 && selData && <div><h2 className="text-base font-semibold mb-4" style={{ color: TEXT }}>Collect Payment / Deposit</h2><p className="text-sm mb-3" style={{ color: MUTED }}>Payment intake isn't wired to a real endpoint yet — charges are posted for real once the guest is checked in, from the Folio screen.</p><div className="rounded-xl p-4" style={{ backgroundColor: "#F8FAFC" }}><div className="flex justify-between text-sm"><span style={{ color: MUTED }}>Rate</span><span style={{ color: TEXT }}>{formatNaira(selData.rateKobo)}/night</span></div></div></div>}
        {step === 5 && <div className="text-center py-4"><CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: SUCCESS }} /><h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Receipt</h2><p className="text-sm mb-5" style={{ color: MUTED }}>Receipt generation isn't wired yet — placeholder step.</p></div>}
        {step === 6 && <div className="text-center py-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#DCFCE7" }}><KeyRound size={32} style={{ color: SUCCESS }} /></div>
          <h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Ready to Confirm</h2>
          <p className="text-sm mb-1" style={{ color: MUTED }}>{selData ? `${selData.guestFirstName} ${selData.guestLastName}` : "Guest"} → Room {rooms.find(r => r.id === selRoom)?.number ?? "—"}</p>
          <p className="text-xs" style={{ color: SUBTLE }}>{doorLockEnabled ? "Continue to activate room access, then complete check-in." : "Confirming sets the room to Occupied and opens the folio for real."}</p>
        </div>}
        {step === 7 && doorLockEnabled && <div>
          <h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Activate Room Access</h2>
          <p className="text-sm mb-4" style={{ color: MUTED }}>{selData ? `${selData.guestFirstName} ${selData.guestLastName}` : "Guest"} · Room {rooms.find(r => r.id === selRoom)?.number ?? "—"} · Valid {selData && new Date(selData.checkInDate).toLocaleString()} → {selData && new Date(selData.checkOutDate).toLocaleString()}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div className="rounded-xl border p-4" style={{ borderColor: issuedCard?.status === "active" ? SUCCESS : BORDER, backgroundColor: issuedCard?.status === "active" ? "#F0FDF4" : "white" }}>
              <div className="flex items-center gap-2 mb-2"><CreditCard size={16} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>Key Card</span></div>
              {!issuedCard ? (
                <button onClick={issueCard} disabled={issuingCard} className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{issuingCard ? "Encoding…" : "Encode Card"}</button>
              ) : issuedCard.status === "active" ? (
                <div className="text-xs" style={{ color: SUCCESS }}>✅ Card encoded, active</div>
              ) : issuedCard.status === "pending_sync" ? (
                <div className="text-xs" style={{ color: WARNING }}>⚠ TTLock unreachable — queued, will activate automatically</div>
              ) : (
                <div className="text-xs" style={{ color: ERROR }}>✗ Encoding failed — see toast for why</div>
              )}
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: issuedPin?.status === "active" || issuedPin?.pin ? SUCCESS : BORDER, backgroundColor: issuedPin?.pin ? "#F0FDF4" : "white" }}>
              <div className="flex items-center gap-2 mb-2"><Hash size={16} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>PIN Code</span></div>
              {!issuedPin ? (
                <button onClick={issuePin} disabled={issuingPin} className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{issuingPin ? "Generating…" : "Generate PIN"}</button>
              ) : issuedPin.pin ? (
                <div>
                  <div className="text-2xl font-bold text-center py-2 rounded-lg mb-1" style={{ fontFamily: mono, letterSpacing: "0.2em", backgroundColor: "#F8FAFC", color: TEXT }}>{issuedPin.pin}</div>
                  <div className="text-xs text-center" style={{ color: WARNING }}>⚠ Show to guest now — cannot be retrieved again</div>
                  {issuedPin.status === "pending_sync" && <div className="text-xs text-center mt-1" style={{ color: WARNING }}>TTLock unreachable — queued</div>}
                </div>
              ) : (
                <div className="text-xs" style={{ color: ERROR }}>✗ Generation failed — see toast for why</div>
              )}
            </div>
          </div>

          {!issuedCard && !issuedPin && !physicalKeyLogged && (
            <button onClick={logPhysicalKey} className="text-xs font-medium flex items-center gap-1.5 mb-2" style={{ color: MUTED }}><Lock size={12} />No lock configured for this room? Issue a physical key instead</button>
          )}
          {physicalKeyLogged && <div className="text-xs p-2 rounded-lg mb-2" style={{ backgroundColor: "#F8FAFC", color: MUTED }}>🗝 Physical key logged — flagged in Room Access Management until digital access is activated.</div>}

          {(issuedCard || issuedPin || physicalKeyLogged) && (
            <div className="rounded-xl p-4 mt-2" style={{ backgroundColor: "#F8FAFC" }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Access Summary</div>
              <div className="space-y-1 text-sm">
                {issuedCard && <div style={{ color: TEXT }}>{issuedCard.status === "active" ? "✅" : issuedCard.status === "pending_sync" ? "⚠" : "✗"} Key Card — {issuedCard.status === "active" ? "encoded, active" : issuedCard.status === "pending_sync" ? "queued" : "failed"}</div>}
                {issuedPin && <div style={{ color: TEXT }}>{issuedPin.status === "active" ? "✅" : issuedPin.status === "pending_sync" ? "⚠" : "✗"} PIN Code — {issuedPin.status === "active" ? "activated, shown to guest" : issuedPin.status === "pending_sync" ? "queued" : "failed"}</div>}
                {physicalKeyLogged && <div style={{ color: TEXT }}>🗝 Physical Key — logged (offline fallback)</div>}
              </div>
            </div>
          )}
        </div>}
        <div className="flex items-center justify-between mt-8 pt-5 border-t" style={{ borderColor: "#F1F5F9" }}>
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-40" style={{ borderColor: BORDER, color: MUTED }}><ChevronLeft size={15} />Back</button>
          {step < LAST_STEP
            ? <button onClick={() => setStep(s => s + 1)} disabled={(step === 1 && !selRes) || (step === 3 && !selRoom)} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: PRIMARY }}>Continue<ChevronRight size={15} /></button>
            : <button onClick={confirmCheckIn} disabled={confirming} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: SUCCESS }}><CheckCircle2 size={15} />{confirming ? "Confirming…" : "Complete Check-In"}</button>}
        </div>
      </div>
    </div>
  );
}
