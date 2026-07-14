// All screen components and shared UI primitives.
// Imported by App.tsx — no circular dependencies.
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
import {
  type Role, type Toast, type ToastType, type AddToast, fmtN, uid, actC, actBg,
  mono, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  hkC, woC, priC, tblC, stC, roomStC, resStC,
  occData, revCat, roomSt, deptKPIs, recentAct, ROOMS, RES_GRID, IN_HOUSE, WORK_ORDERS,
  HK_ROOMS, STAFF, BRANCHES, FOLIO_CHARGES, MENU_ITEMS, MENU_CATS, TABLE_LAYOUT, STOCK, CHAT_MSGS,
  ALL_RES, ARRIVALS_DATA, ACCESS_CREDS, KEY_LOG, ACTIVE_PINS, LOST_FOUND, DND_ROOMS,
  INVOICES_DATA, AP_DATA, DEPT_PERMS, ATTEND_DATA, SYNC_BRANCHES, KDS_ORDERS, REV_DATA,
  USERS_DATA, ASSETS, SUPPLIERS_DATA, PRODUCTS_DATA, STOCK_TXN, PO_DATA, DEVICES,
  HK_TASK_ROOMS, INV_CONS, STAFF_RPT, RATE_PLANS, WAITLIST_DATA, ROOM_SERVICE_ORDERS,
  DINING_RES, ANNOUNCE_DATA, PAYROLL_DATA, GUEST_ANALYTICS_DATA, NATIONALITY_DATA,
} from "./data";

// ─── UI Primitives ──────────────────────────────────────────────────────────
// ─── PREMIUM UI PRIMITIVES ────────────────────────────────────────────────────

export function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: colors.bg, color: colors.text, letterSpacing: "0.01em" }}>
      {label}
    </span>
  );
}

export function EmptyState({ icon: Icon, message, cta, onCta }: { icon: React.ElementType; message: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4 shadow-sm"
        style={{ background: "linear-gradient(135deg, #F1F5F9, #E2E8F0)" }}>
        <Icon size={26} color={SUBTLE} />
      </div>
      <p className="text-sm max-w-xs leading-relaxed" style={{ color: MUTED }}>{message}</p>
      {cta && (
        <button onClick={onCta} className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm hover:shadow-md transition-all"
          style={{ backgroundColor: PRIMARY }}>
          {cta}
        </button>
      )}
    </div>
  );
}

export function ToastC({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  const cfg: Record<ToastType, { bg: string; border: string; icon: React.ElementType; accent: string }> = {
    success: { bg: "#EFFEF7", border: "#86EFAC", icon: CheckCircle2, accent: "#16A34A" },
    error:   { bg: "#FFF1F2", border: "#FDA4AF", icon: AlertCircle, accent: "#E11D48" },
    info:    { bg: "#EFF6FF", border: "#93C5FD", icon: AlertCircle, accent: "#2563EB" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", icon: AlertTriangle, accent: "#D97706" },
  };
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 pointer-events-none" style={{ maxWidth: 360 }}>
      {toasts.map(t => { const c = cfg[t.type]; const Icon = c.icon; return (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-xl border min-w-72"
          style={{ backgroundColor: c.bg, borderColor: c.border }}>
          <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: `${c.accent}15` }}>
            <Icon size={14} style={{ color: c.accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: TEXT }}>{t.title}</div>
            {t.body && <div className="text-xs mt-0.5 leading-relaxed" style={{ color: MUTED }}>{t.body}</div>}
          </div>
          <button onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-100 transition-opacity mt-0.5" style={{ color: MUTED }}>
            <X size={14} />
          </button>
        </div>
      ); })}
    </div>
  );
}

export function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <div className="text-right">
      <div className="text-sm font-semibold text-white leading-none tracking-wide" style={{ fontFamily: mono, letterSpacing: "0.05em" }}>
        {p(t.getHours())}:{p(t.getMinutes())}:{p(t.getSeconds())}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "#64748B", fontFamily: mono }}>
        {t.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}
      </div>
    </div>
  );
}

export function SyncPill() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity"
      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}>
      <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#22C55E", boxShadow: "0 0 8px #22C55E" }} />
      Synced
    </div>
  );
}

export function StatCard({ label, value, sub, delta, deltaPositive, icon: Icon, accent }: {
  label: string; value: string; sub: string; delta?: string; deltaPositive?: boolean; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="rounded-2xl p-5 relative overflow-hidden group cursor-default transition-all duration-300 hover:-translate-y-0.5"
      style={{ backgroundColor: "white", border: `1px solid ${BORDER}`, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
      {/* Top accent line */}
      <div className="absolute top-0 left-5 right-5 h-0.5 rounded-b-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}40)` }} />

      <div className="flex items-start justify-between mb-4">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-all group-hover:scale-105"
          style={{ background: `linear-gradient(135deg, ${accent}20, ${accent}0a)`, border: `1px solid ${accent}18` }}>
          <Icon size={21} style={{ color: accent }} />
        </div>
        {delta && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${deltaPositive ? "text-emerald-700" : "text-rose-600"}`}
            style={{ backgroundColor: deltaPositive ? "#ECFDF5" : "#FFF1F2" }}>
            {deltaPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {delta}
          </div>
        )}
      </div>
      <div className="text-3xl font-bold leading-none mb-1.5 tracking-tight" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>{value}</div>
      <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: MUTED, letterSpacing: "0.08em" }}>{label}</div>
      <div className="text-xs" style={{ color: SUBTLE }}>{sub}</div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="font-bold tracking-tight" style={{ color: TEXT, fontSize: 22, fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>{title}</h1>
        {sub && <p className="text-sm mt-0.5" style={{ color: MUTED }}>{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function BtnP({ label, icon: Icon, onClick, color }: { label: string; icon?: React.ElementType; onClick?: () => void; color?: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md hover:-translate-y-px active:translate-y-0"
      style={{ backgroundColor: color ?? PRIMARY, boxShadow: `0 2px 8px ${(color ?? PRIMARY)}40` }}>
      {Icon && <Icon size={14} />}{label}
    </button>
  );
}

export function BtnO({ label, icon: Icon, onClick }: { label: string; icon?: React.ElementType; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white hover:bg-[#F8FAFC] transition-all hover:shadow-sm"
      style={{ color: MUTED, borderColor: BORDER }}>
      {Icon && <Icon size={14} />}{label}
    </button>
  );
}
export function Inp({ label, placeholder, type, defaultValue }: { label?: string; placeholder?: string; type?: string; defaultValue?: string }) {
  return (
    <div>
      {label && <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{label}</label>}
      <input type={type ?? "text"} placeholder={placeholder} defaultValue={defaultValue}
        className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }} />
    </div>
  );
}
export function Sel({ label, options }: { label?: string; options: string[] }) {
  return (
    <div>
      {label && <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{label}</label>}
      <select className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}
export function DashboardMgmt({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  return (
    <div>
      <PageHeader title="Management Overview" sub="Grand Palms Hotel, Abuja · Tuesday 24 Jun 2025" actions={<><BtnO label="Export PDF" icon={Download} /><BtnP label="New Reservation" icon={Plus} /></>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Occupancy Rate" value="88%" sub="62 of 100 rooms occupied" delta="+4% vs yesterday" deltaPositive icon={Building2} accent={PRIMARY} />
        <StatCard label="Revenue Today" value="₦1.25M" sub="Target: ₦1.1M" delta="+13.5%" deltaPositive icon={DollarSign} accent={TEAL} />
        <StatCard label="Active Guests" value="94" sub="12 arrivals · 8 departures remaining" delta="+6 vs yesterday" deltaPositive icon={Users} accent={ORANGE} />
        <StatCard label="Open Issues" value="9" sub="7 maintenance · 2 complaints" delta="+2 since morning" deltaPositive={false} icon={AlertTriangle} accent={ERROR} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Occupancy & Revenue — This Week</h3><p className="text-xs mt-0.5" style={{ color: SUBTLE }}>Daily trend</p></div>
            <div className="flex gap-4 text-xs" style={{ color: MUTED }}>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: PRIMARY }} />Occupancy %</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: TEAL }} />Revenue ₦K</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={occData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any, n: any) => [n === "rev" ? `₦${v}K` : `${v}%`, n === "rev" ? "Revenue" : "Occupancy"]} />
              <Area key="area-occ" type="monotone" dataKey="occ" name="Occupancy" stroke={PRIMARY} strokeWidth={2} fill={PRIMARY + "20"} dot={false} />
              <Area key="area-rev" type="monotone" dataKey="rev" name="Revenue" stroke={TEAL} strokeWidth={2} fill={TEAL + "20"} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Revenue Breakdown</h3>
          <p className="text-xs mb-3" style={{ color: SUBTLE }}>By category today</p>
          <ResponsiveContainer width="100%" height={140}><PieChart><Pie key="dash-pie" data={revCat} cx="50%" cy="50%" innerRadius={42} outerRadius={65} paddingAngle={3} dataKey="value" stroke="none">{revCat.map((e, i) => <Cell key={`dash-cell-${i}`} fill={e.color} />)}</Pie><Tooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} /></PieChart></ResponsiveContainer>
          <div className="space-y-2 mt-2">{revCat.map(c => <div key={c.name} className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} /><span className="text-xs" style={{ color: MUTED }}>{c.name}</span></div><span className="text-xs font-semibold" style={{ color: TEXT }}>{c.value}%</span></div>)}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Room Status</h3>
          <div className="space-y-2.5">{roomSt.map(r => <div key={r.status} className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} /><span className="text-sm flex-1" style={{ color: MUTED }}>{r.status}</span><div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${r.count}%`, backgroundColor: r.color }} /></div><span className="text-sm font-semibold w-6 text-right" style={{ color: TEXT }}>{r.count}</span></div>)}</div>
          <div className="mt-4 pt-4 border-t flex items-center justify-between" style={{ borderColor: "#F1F5F9" }}><span className="text-xs" style={{ color: MUTED }}>Total rooms</span><span className="text-sm font-bold" style={{ color: TEXT }}>100</span></div>
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <div className="col-span-2"><h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Department KPIs</h3></div>
          {deptKPIs.map(k => {
            const sc = ({ success: SUCCESS, warning: WARNING, error: ERROR } as any)[k.st];
            const sb = ({ success: "#F0FDF4", warning: "#FFFBEB", error: "#FEF2F2" } as any)[k.st];
            const Icon = k.icon;
            const deptScreen: Record<string, string> = { Housekeeping: "hk-board", Maintenance: "work-orders", Restaurant: "pos-terminal", Finance: "daily-summary" };
            const deptLabel: Record<string, string> = { Housekeeping: "Housekeeping Board", Maintenance: "Work Orders", Restaurant: "POS Terminal", Finance: "Daily Summary" };
            return <div key={k.dept} onClick={() => nav && nav(deptScreen[k.dept] as any, deptLabel[k.dept])} className="bg-white rounded-xl p-4 border flex items-start gap-3 cursor-pointer hover:shadow-sm transition-shadow" style={{ borderColor: BORDER }}><div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: sb }}><Icon size={18} style={{ color: sc }} /></div><div><div className="text-xs font-medium" style={{ color: MUTED }}>{k.dept}</div><div className="text-sm font-semibold" style={{ color: TEXT }}>{k.metric}</div><div className="text-lg font-bold" style={{ color: sc }}>{k.value}</div><div className="text-xs" style={{ color: SUBTLE }}>{k.sub}</div></div></div>;
          })}
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Recent Activity</h3><BtnO label="View All" onClick={() => nav && nav("in-house-guests", "In-House Guests")} /></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Ref ID", "Guest / Dept", "Room", "Action", "Time", ""].map(h => <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{recentAct.map(r => <tr key={r.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{r.id}</td><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: actC(r.type) }}>{r.av}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{r.guest}</span></div></td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{r.room}</td><td className="px-5 py-3"><span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: actBg(r.type), color: actC(r.type) }}>{r.action}</span></td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{r.time}</td><td className="px-5 py-3"><button className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><MoreHorizontal size={14} /></button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function DashboardRole({ role, nav }: { role: Role; nav?: (s: string, label: string) => void }) {
  const cfgs: Record<string, { title: string; stats: any[] }> = {
    FD: { title: "Front Desk Dashboard", stats: [{ label: "Rooms Available", value: "18", sub: "Of 100 total rooms", accent: SUCCESS, icon: BedDouble }, { label: "Check-ins Today", value: "12", sub: "4 remaining to arrive", accent: PRIMARY, icon: KeyRound }, { label: "Check-outs Today", value: "8", sub: "3 still in house", accent: ORANGE, icon: ArrowRight }, { label: "Outstanding Balance", value: "₦284K", sub: "Across 3 folios", accent: ERROR, icon: DollarSign }] },
    HK: { title: "Housekeeping Dashboard", stats: [{ label: "Rooms to Clean", value: "14", sub: "3 priority", accent: ERROR, icon: BedDouble }, { label: "In Progress", value: "5", sub: "3 attendants", accent: ORANGE, icon: Activity }, { label: "Completed Today", value: "22", sub: "Of 40 assigned", accent: SUCCESS, icon: CheckCircle2 }, { label: "Inspections Pending", value: "4", sub: "Supervisor review needed", accent: WARNING, icon: ClipboardList }] },
    MX: { title: "Maintenance Dashboard", stats: [{ label: "Open Work Orders", value: "7", sub: "All categories", accent: ERROR, icon: Wrench }, { label: "Overdue", value: "2", sub: "SLA breached", accent: "#EF4444", icon: AlertTriangle }, { label: "Completed Today", value: "3", sub: "This shift", accent: SUCCESS, icon: CheckCircle2 }, { label: "Assets Due Service", value: "1", sub: "Next 7 days", accent: ORANGE, icon: Settings }] },
    FIN: { title: "Finance Dashboard", stats: [{ label: "Revenue Today", value: "₦1.25M", sub: "113% of target", accent: SUCCESS, icon: TrendingUp }, { label: "Outstanding Invoices", value: "₦284K", sub: "3 open folios", accent: ERROR, icon: FileText }, { label: "Payments Received", value: "₦980K", sub: "Cash + POS + Transfer", accent: TEAL, icon: CreditCard }, { label: "Discounts Applied", value: "₦45K", sub: "6 approved today", accent: ORANGE, icon: Activity }] },
    RT: { title: "Restaurant Dashboard", stats: [{ label: "Tables Occupied", value: "12/24", sub: "50% capacity", accent: ORANGE, icon: UtensilsCrossed }, { label: "Orders in Queue", value: "4", sub: "Avg 12 min wait", accent: ERROR, icon: ClipboardList }, { label: "Room Service Pending", value: "2", sub: "Rooms 304, 118", accent: WARNING, icon: Truck }, { label: "Today's Revenue", value: "₦225K", sub: "F&B total", accent: SUCCESS, icon: DollarSign }] },
    MGT: { title: "Management Dashboard", stats: [{ label: "Occupancy Rate", value: "88%", sub: "62 of 100 rooms", accent: PRIMARY, icon: Building2 }, { label: "Revenue Today", value: "₦1.25M", sub: "+13.5% vs target", accent: SUCCESS, icon: DollarSign }, { label: "Active Guests", value: "94", sub: "12 arrivals pending", accent: ORANGE, icon: Users }, { label: "Open Issues", value: "9", sub: "7 MX · 2 complaints", accent: ERROR, icon: AlertTriangle }] },
  };
  const cfg = cfgs[role] ?? cfgs.MGT;
  return (
    <div>
      <PageHeader title={cfg.title} sub={`Role view: ${role}`} actions={<BtnO label="Switch View" icon={Layers} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">{cfg.stats.map((s: any) => <StatCard key={s.label} {...s} />)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Today's Arrivals</h3><BtnO label="Arrivals List" /></div>
        {IN_HOUSE.slice(0, 4).map(g => <div key={g.room} className="flex items-center gap-4 px-5 py-3 border-b" style={{ borderColor: "#F8FAFC" }}><div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{g.guest.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><div className="flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium" style={{ color: TEXT }}>{g.guest}</span>{g.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}</div><div className="text-xs" style={{ color: MUTED }}>Room {g.room} · Check-out {g.checkout}</div></div>{g.balance > 0 ? <span className="text-xs font-medium" style={{ color: ERROR }}>₦{g.balance.toLocaleString()}</span> : <CheckCircle2 size={15} style={{ color: SUCCESS }} />}<BtnO label="Check In" /></div>)}
      </div>
    </div>
  );
}

export function ReservationGrid({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const today = new Date(2025, 5, 24);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i); return d; });
  const DW = 60; const RH = 44;
  return (
    <div>
      <PageHeader title="Reservation Grid" sub="14-day availability · Click empty cell to create · Click bar for detail" actions={<><BtnO label="Jump to Date" icon={CalendarDays} /><BtnP label="New Reservation" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search rooms…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }} /></div>
          {["All", "Standard", "Deluxe", "Suite"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "All" ? PRIMARY : BORDER, backgroundColor: f === "All" ? PRIMARY : "white", color: f === "All" ? "white" : MUTED }}>{f}</button>)}
          <div className="ml-auto flex items-center gap-3 text-xs" style={{ color: MUTED }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: SUCCESS }} />Checked In</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: TEAL }} />Confirmed</span>
          </div>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 520 }}>
          <div style={{ minWidth: 200 + DW * 14 }}>
            <div className="flex sticky top-0 z-10" style={{ backgroundColor: "#F8FAFC", borderBottom: `1px solid ${BORDER}` }}>
              <div className="flex-shrink-0 flex items-center px-4 py-2" style={{ width: 200, borderRight: `1px solid ${BORDER}` }}><span className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Room</span></div>
              {days.map((d, i) => <div key={i} className="flex-shrink-0 flex flex-col items-center justify-center py-2" style={{ width: DW, borderRight: `1px solid ${BORDER}`, backgroundColor: i === 0 ? "#EFF6FF" : "transparent" }}><span className="text-xs font-semibold" style={{ color: i === 0 ? PRIMARY : TEXT }}>{d.toLocaleDateString("en-NG", { weekday: "short" })}</span><span className="text-xs" style={{ color: i === 0 ? PRIMARY : SUBTLE }}>{d.getDate()}/{d.getMonth() + 1}</span></div>)}
            </div>
            {ROOMS.map(room => {
              const res = RES_GRID.filter(r => r.room === room.id);
              const c = roomStC[room.status] ?? { bg: "#F3F4F6", text: "#374151" };
              return (
                <div key={room.id} className="flex relative" style={{ height: RH, borderBottom: "1px solid #F1F5F9" }}>
                  <div className="flex-shrink-0 flex items-center gap-3 px-4 sticky left-0 z-10" style={{ width: 200, borderRight: `1px solid ${BORDER}`, backgroundColor: "white" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{room.id}</div>
                    <div><div className="text-xs font-semibold" style={{ color: TEXT }}>Room {room.id}</div><div className="text-xs" style={{ color: SUBTLE }}>{room.type} · F{room.floor}</div></div>
                    <div className="ml-auto"><span className="text-xs px-1.5 py-0.5 rounded" style={c}>{room.status}</span></div>
                  </div>
                  <div className="relative flex-1 flex">
                    {days.map((_, i) => <div key={i} className="flex-shrink-0 border-r hover:bg-[#F0F9FF] cursor-pointer transition-colors" style={{ width: DW, height: RH, borderRightColor: "#F1F5F9" }} onClick={() => add({ type: "info", title: "New Reservation", body: `Room ${room.id}` })} />)}
                    {res.map((r, ri) => <div key={ri} className="absolute flex items-center px-2 cursor-pointer hover:opacity-90 rounded-md" style={{ left: r.start * DW + 2, width: (r.end - r.start) * DW - 4, height: RH - 16, top: 8, backgroundColor: r.color }} onClick={() => nav ? nav("reservation-detail", `${r.guest} — ${room.id}`) : add({ type: "info", title: r.guest, body: `Room ${room.id}` })}><span className="text-white text-xs font-medium truncate">{r.guest}</span></div>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function NewReservation({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [bookType, setBookType] = useState("Individual");
  return (
    <div>
      <PageHeader title="New Reservation" sub="Create a reservation for an individual, group, or walk-in guest" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Booking Type</h3>
            <div className="flex gap-2">{["Individual", "Group", "Walk-In"].map(t => <button key={t} onClick={() => setBookType(t)} className="px-4 py-2 rounded-lg text-sm font-medium border-2" style={{ borderColor: bookType === t ? PRIMARY : BORDER, backgroundColor: bookType === t ? "#EFF6FF" : "white", color: bookType === t ? PRIMARY : MUTED }}>{t}</button>)}</div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Guest</h3>
            <div className="relative mb-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search existing guests by name or phone…" className="pl-9 pr-4 py-2.5 w-full border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            <button className="text-xs font-medium flex items-center gap-1" style={{ color: TEAL }}><Plus size={12} />Create new guest profile</button>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Dates & Room</h3>
            <div className="grid grid-cols-2 gap-3 mb-3"><Inp label="Check-In Date" type="date" defaultValue="2025-06-24" /><Inp label="Check-Out Date" type="date" defaultValue="2025-06-27" /></div>
            <div className="grid grid-cols-2 gap-3 mb-3"><Sel label="Room Type" options={["Standard Room", "Deluxe Room", "Suite"]} /><Sel label="Specific Room (optional)" options={["Auto-assign", "Room 101", "Room 102", "Room 301"]} /></div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "#F0FDF4", color: SUCCESS }}><CheckCircle2 size={13} />18 rooms available for selected dates and type</div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Rate & Details</h3>
            <div className="grid grid-cols-2 gap-3 mb-3"><Sel label="Rate Plan" options={["Standard Rate", "Corporate Rate", "Weekend Special"]} /><Inp label="Nightly Rate (₦)" defaultValue="55,000" /></div>
            <div className="grid grid-cols-3 gap-3 mb-3"><Sel label="Adults" options={["1", "2", "3", "4"]} /><Sel label="Children" options={["0", "1", "2"]} /><Sel label="Rooms" options={["1", "2", "3"]} /></div>
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Special Requests</label><textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={2} placeholder="High floor, extra pillows, champagne on arrival…" style={{ borderColor: BORDER }} /></div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Deposit</h3><label className="flex items-center gap-2 cursor-pointer"><span className="text-sm" style={{ color: MUTED }}>Collect deposit</span><div className="w-10 h-5 rounded-full" style={{ backgroundColor: TEAL }}><div className="w-4 h-4 bg-white rounded-full m-0.5 ml-5 shadow" /></div></label></div>
            <div className="grid grid-cols-2 gap-3"><Inp label="Deposit Amount (₦)" defaultValue="55,000" /><Sel label="Payment Method" options={["Cash", "POS / Card", "Bank Transfer"]} /></div>
          </div>
        </div>
        <div>
          <div className="bg-white rounded-xl border p-5 sticky top-4" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Reservation Summary</h3>
            <div className="space-y-2 text-sm mb-4">{[["Room Type", "Deluxe Room"], ["Check-In", "24 Jun 2025"], ["Check-Out", "27 Jun 2025"], ["Nights", "3"], ["Rate", "₦55,000 / night"]].map(([k, v]) => <div key={k} className="flex justify-between"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}<div className="pt-2 mt-2 border-t" style={{ borderColor: BORDER }}>{[["Subtotal", "₦165,000"], ["VAT (7.5%)", "₦12,375"], ["Total", "₦177,375"]].map(([k, v], i) => <div key={k} className={`flex justify-between ${i === 2 ? "font-bold text-base" : "text-sm"} mb-1`}><span style={{ color: TEXT }}>{k}</span><span style={{ color: TEXT }}>{v}</span></div>)}</div></div>
            <div className="space-y-2"><BtnP label="Confirm Reservation" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Reservation confirmed!", body: "BK-2852 created successfully" })} /><BtnO label="Save as Draft" onClick={() => add({ type: "info", title: "Saved as draft" })} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheckOut({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [cash, setCash] = useState("82100");
  const total = FOLIO_CHARGES.reduce((s, c) => s + c.amount, 0);
  const vat = Math.round(total * 0.075); const grand = total + vat; const paid = 55000; const balance = grand - paid;
  return (
    <div>
      <PageHeader title="Check-Out & Settlement" sub="Room 202 · Emmanuel Adeyemi · Checking out 25 Jun 2025"
        actions={<><BtnO label="Extend Stay" icon={CalendarDays} /><BtnP label="Settle & Release Room" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Check-out complete", body: "Room 202 released to Housekeeping. Access revoked." })} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><div><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Folio — BK-2848</h3><p className="text-xs mt-0.5" style={{ color: SUBTLE }}>Emmanuel Adeyemi · Room 202 · 23–25 Jun</p></div><div className="flex gap-2"><BtnO label="Print" icon={FileText} /><BtnO label="Email" icon={Mail} /></div></div>
            <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Date", "Category", "Description", "Qty", "Unit", "Amount", "By"].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
              <tbody>{FOLIO_CHARGES.map((c, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{c.date}</td><td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: MUTED }}>{c.cat}</span></td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{c.desc}</td><td className="px-4 py-3 text-sm text-center" style={{ color: MUTED }}>{c.qty}</td><td className="px-4 py-3 text-sm" style={{ color: MUTED }}>₦{c.unit.toLocaleString()}</td><td className="px-4 py-3 text-sm font-semibold" style={{ color: TEXT }}>₦{c.amount.toLocaleString()}</td><td className="px-4 py-3 text-xs" style={{ color: SUBTLE }}>{c.by}</td></tr>)}</tbody>
            </table>
            <div className="px-5 py-4 border-t" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
              <div className="flex justify-end"><div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between"><span style={{ color: MUTED }}>Subtotal</span><span>₦{total.toLocaleString()}</span></div>
                <div className="flex justify-between"><span style={{ color: MUTED }}>VAT (7.5%)</span><span>₦{vat.toLocaleString()}</span></div>
                <div className="flex justify-between"><span style={{ color: MUTED }}>Deposit paid</span><span style={{ color: SUCCESS }}>−₦{paid.toLocaleString()}</span></div>
                <div className="flex justify-between font-bold text-base pt-2 border-t" style={{ borderColor: BORDER, color: TEXT }}><span>Balance Due</span><span>₦{balance.toLocaleString()}</span></div>
              </div></div>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "#F0FDF4", border: `1px solid #BBF7D0` }}>
            <Lock size={16} style={{ color: SUCCESS, marginTop: 1 }} />
            <div><div className="text-sm font-semibold" style={{ color: SUCCESS }}>Room Access — Auto-Revoke on Release</div><div className="text-xs mt-0.5" style={{ color: "#065F46" }}>Key Card ×1 and PIN will be deactivated automatically when room is released.</div></div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Payment</h3>
            <div className="text-3xl font-bold mb-1" style={{ color: TEXT }}>₦{balance.toLocaleString()}</div>
            <div className="text-xs mb-5" style={{ color: MUTED }}>Balance remaining after deposit</div>
            {[{ label: "Cash", val: cash, setVal: setCash }, { label: "POS / Card", val: "0", setVal: () => {} }, { label: "Bank Transfer", val: "0", setVal: () => {} }].map(m => (
              <div key={m.label} className="mb-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{m.label}</label><div className="flex items-center gap-2"><span className="text-sm font-medium" style={{ color: MUTED }}>₦</span><input value={m.val} onChange={e => m.setVal(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div></div>
            ))}
            <div className="px-4 py-3 rounded-xl mb-4" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${BORDER}` }}>
              {[["Received", `₦${(+cash).toLocaleString()}`], ["Balance due", `₦${balance.toLocaleString()}`], ["Change due", `₦${Math.max(0, +cash - balance).toLocaleString()}`]].map(([k, v]) => <div key={k} className="flex justify-between text-sm mb-1"><span style={{ color: MUTED }}>{k}</span><span className="font-semibold" style={{ color: TEXT }}>{v}</span></div>)}
            </div>
            <BtnP label="Process Payment & Release Room" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Payment processed", body: "Room 202 → Cleaning. Access revoked." })} />
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Guest</h3>
            <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: PRIMARY }}>EA</div><div><div className="text-sm font-semibold" style={{ color: TEXT }}>Emmanuel Adeyemi</div><div className="text-xs" style={{ color: MUTED }}>Room 202 · BK-2848 · 2 nights</div></div></div>
            <div className="text-xs space-y-1" style={{ color: MUTED }}>{[["Check-in", "23 Jun 14:05"], ["Check-out", "25 Jun 11:00"], ["Stays", "3rd visit"]].map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span style={{ color: TEXT }}>{v}</span></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InHouseGuests({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  return (
    <div>
      <PageHeader title="In-House Guests" sub={`${IN_HOUSE.length} guests currently checked in`} actions={<><BtnO label="Export" icon={Download} /><BtnP label="Post Charge" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}><div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search guest or room…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} /></div><BtnO label="Filter" icon={Filter} /></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest Name", "Check-in", "Check-out", "Nights Left", "VIP", "Balance", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{IN_HOUSE.map(g => <tr key={g.room} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>{g.room}</td><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{g.guest.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{g.guest}</span></div></td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{g.checkin}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{g.checkout}</td><td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>{g.nights}d</td><td className="px-5 py-3">{g.vip ? <Star size={16} fill={ORANGE} style={{ color: ORANGE }} /> : <span style={{ color: SUBTLE }}>—</span>}</td><td className="px-5 py-3">{g.balance > 0 ? <span className="text-sm font-semibold" style={{ color: ERROR }}>₦{g.balance.toLocaleString()}</span> : <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Settled</span>}</td><td className="px-5 py-3"><div className="flex items-center gap-1"><button onClick={() => nav ? nav("check-out", "Check-Out") : add({ type: "info", title: "Check-out initiated", body: g.guest })} className="px-2 py-1 rounded text-xs font-medium border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Check Out</button><button className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><MoreHorizontal size={13} /></button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

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

export function FolioScreen({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [showCharge, setShowCharge] = useState(false);
  const [charge, setCharge] = useState({ folio: "FO-2841", cat: "Restaurant", desc: "", amount: "", by: "John Abubakar" });

  const postCharge = () => {
    if (!charge.desc || !charge.amount) { add({ type: "warning", title: "Fill in description and amount" }); return; }
    setShowCharge(false);
    add({ type: "success", title: "Charge posted", body: `${charge.cat} · ₦${Number(charge.amount).toLocaleString()} → ${charge.folio}` });
    setCharge(p => ({ ...p, desc: "", amount: "" }));
  };

  const allFolios = IN_HOUSE.map((g, i) => ({ ...g, folio: `FO-${2840 + i}`, bal: [82100, 45000, 0, 120000, 0][i] }));
  const filtered = allFolios.filter(g =>
    (statusFilter === "All" || (statusFilter === "Open" ? g.bal > 0 : g.bal === 0)) &&
    (!search || g.guest.toLowerCase().includes(search.toLowerCase()) || g.room.includes(search))
  );

  return (
    <div>
      <PageHeader title="Folio Management" sub="All open and closed guest folios"
        actions={<><BtnO label="Export" icon={Download} /><BtnP label="Post Charge" icon={Plus} onClick={() => setShowCharge(true)} /></>} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search folio, guest, or room…" className="pl-7 pr-3 py-1.5 text-xs rounded-xl border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          {["All", "Open", "Settled"].map(f => (
            <button key={f} onClick={() => setStatusFilter(f)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all"
              style={{ borderColor: statusFilter === f ? PRIMARY : BORDER, backgroundColor: statusFilter === f ? PRIMARY : "white", color: statusFilter === f ? "white" : MUTED }}>
              {f}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: SUBTLE }}>{filtered.length} folios</span>
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Folio ID", "Guest", "Room", "Check-in", "Check-out", "Total", "Paid", "Balance", "Status", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((g, i) => {
            const tot = g.bal + 55000;
            return (
              <tr key={g.room} className="border-t hover:bg-[#F8FAFC] cursor-pointer transition-colors" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}>
                <td className="px-4 py-3.5 text-xs font-semibold" style={{ color: MUTED, fontFamily: mono }}>{g.folio}</td>
                <td className="px-4 py-3.5"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{g.guest.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><span className="text-sm font-semibold" style={{ color: TEXT }}>{g.guest}</span></div></td>
                <td className="px-4 py-3.5 font-bold text-base" style={{ color: PRIMARY }}>{g.room}</td>
                <td className="px-4 py-3.5 text-xs" style={{ color: MUTED }}>{g.checkin}</td>
                <td className="px-4 py-3.5 text-xs" style={{ color: MUTED }}>{g.checkout}</td>
                <td className="px-4 py-3.5 text-sm font-bold" style={{ color: TEXT }}>₦{tot.toLocaleString()}</td>
                <td className="px-4 py-3.5 text-sm" style={{ color: SUCCESS }}>₦55,000</td>
                <td className="px-4 py-3.5 text-sm font-bold" style={{ color: g.bal > 0 ? ERROR : SUCCESS }}>{g.bal > 0 ? `₦${g.bal.toLocaleString()}` : "Settled"}</td>
                <td className="px-4 py-3.5"><Badge label={g.bal > 0 ? "Open" : "Settled"} colors={g.bal > 0 ? { bg: "#FEF3C7", text: "#92400E" } : { bg: "#DCFCE7", text: "#166534" }} /></td>
                <td className="px-4 py-3.5">
                  <div className="flex gap-1">
                    <button onClick={() => { setCharge(p => ({ ...p, folio: g.folio })); setShowCharge(true); }} className="text-xs px-2 py-1 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Charge</button>
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><MoreHorizontal size={13} /></button>
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon={FileText} message="No folios match your search." />}
      </div>

      {/* Post Charge Modal */}
      {showCharge && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCharge(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>Post Manual Charge</h3>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>Posting to folio <span className="font-mono font-semibold" style={{ color: PRIMARY }}>{charge.folio}</span></p>
              </div>
              <button onClick={() => setShowCharge(false)} style={{ color: SUBTLE }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Post to Folio</label>
                <select value={charge.folio} onChange={e => setCharge(p => ({ ...p, folio: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                  {IN_HOUSE.map((g, i) => <option key={g.room} value={`FO-${2840 + i}`}>FO-{2840 + i} — {g.guest} (Room {g.room})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Category</label>
                  <select value={charge.cat} onChange={e => setCharge(p => ({ ...p, cat: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                    {["Restaurant", "Bar", "Laundry", "Room Service", "Minibar", "Telephone", "Other"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Amount (₦)</label>
                  <input type="number" value={charge.amount} onChange={e => setCharge(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}
                    onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Description</label>
                <input value={charge.desc} onChange={e => setCharge(p => ({ ...p, desc: e.target.value }))} placeholder="e.g. Room Service Order #RS-044, Dinner for 2 — Table T06"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}
                  onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} />
              </div>
              <div className="p-3 rounded-xl text-xs" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                ⚠ Discounts above ₦5,000 require Manager approval. Charges post immediately to the folio and sync on next connection.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <BtnO label="Cancel" onClick={() => setShowCharge(false)} />
              <BtnP label="Post Charge" icon={DollarSign} onClick={postCharge} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const HK_STATUS_CYCLE = ["Dirty", "In Progress", "Clean", "Inspected"] as const;

export function HKBoard({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [filter, setFilter] = useState("All");
  const [liveStatuses, setLiveStatuses] = useState<Record<string, string>>({});

  const getStatus = (id: string, base: string) => liveStatuses[id] ?? base;

  const cycleStatus = (id: string, base: string) => {
    const current = getStatus(id, base);
    const idx = HK_STATUS_CYCLE.indexOf(current as any);
    const next = idx === -1 ? "In Progress" : HK_STATUS_CYCLE[(idx + 1) % HK_STATUS_CYCLE.length];
    setLiveStatuses(p => ({ ...p, [id]: next }));
    add({ type: "success", title: `Room ${id} → ${next}`, body: next === "Inspected" ? "Supervisor notified — room ready" : undefined });
  };

  const liveRooms = HK_ROOMS.map(r => ({ ...r, hkSt: getStatus(r.id, r.hkSt) }));
  const visible = filter === "All" ? liveRooms : liveRooms.filter(r => r.hkSt === filter);
  const counts = {
    Dirty: liveRooms.filter(r => r.hkSt === "Dirty").length,
    "In Progress": liveRooms.filter(r => r.hkSt === "In Progress").length,
    Clean: liveRooms.filter(r => r.hkSt === "Clean").length,
    Inspected: liveRooms.filter(r => r.hkSt === "Inspected").length,
  };

  return (
    <div>
      <PageHeader title="Housekeeping Board" sub="Master room status · Click Update to cycle status live"
        actions={<><BtnO label="Schedule" icon={CalendarDays} onClick={() => nav && nav("hk-schedule", "Schedule")} /><BtnP label="Assign Rooms" icon={Plus} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[{ l: "To Clean", v: counts.Dirty, c: ERROR, bg: "#FEF2F2" }, { l: "In Progress", v: counts["In Progress"], c: ORANGE, bg: "#FFF7ED" }, { l: "Clean", v: counts.Clean, c: "#F59E0B", bg: "#FFFBEB" }, { l: "Inspected / Ready", v: counts.Inspected, c: SUCCESS, bg: "#F0FDF4" }].map(s => (
          <div key={s.l} className="rounded-2xl p-4 border text-center transition-all" style={{ backgroundColor: s.bg, borderColor: `${s.c}25`, boxShadow: "0 2px 8px rgba(13,27,46,0.05)" }}>
            <div className="text-3xl font-bold" style={{ color: s.c, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>{s.v}</div>
            <div className="text-xs font-semibold mt-1" style={{ color: s.c, opacity: 0.8 }}>{s.l}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {["All", "Dirty", "In Progress", "Clean", "Inspected", "DND", "Maintenance"].map(s => (
          <button key={s} onClick={() => setFilter(s)} className="px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all"
            style={{ backgroundColor: filter === s ? PRIMARY : "white", color: filter === s ? "white" : MUTED, borderColor: filter === s ? PRIMARY : BORDER, boxShadow: filter === s ? `0 2px 8px ${PRIMARY}40` : undefined }}>
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {visible.map(r => {
          const nextStatus = HK_STATUS_CYCLE[(HK_STATUS_CYCLE.indexOf(r.hkSt as any) + 1) % HK_STATUS_CYCLE.length] ?? "In Progress";
          return (
            <div key={r.id} className="bg-white rounded-2xl border p-4 hover:shadow-md transition-all duration-200" style={{ borderColor: r.priority ? `${ORANGE}50` : BORDER, borderWidth: r.priority ? 2 : 1 }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>{r.id}</span>
                    {r.priority && <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>PRIORITY</span>}
                    {r.dnd && <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#F3F4F6", color: "#374151" }}>DND</span>}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>{r.type} · Floor {r.floor}</div>
                </div>
                <Badge label={r.hkSt} colors={hkC[r.hkSt] ?? { bg: "#F1F5F9", text: "#374151" }} />
              </div>
              <div className="text-xs mb-3 font-medium" style={{ color: r.attendant === "Unassigned" ? ERROR : MUTED }}>
                {r.attendant === "Unassigned" ? "⚠ Unassigned" : r.attendant}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => cycleStatus(r.id, HK_ROOMS.find(x => x.id === r.id)?.hkSt ?? r.hkSt)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all hover:shadow-sm"
                  style={{ color: PRIMARY, borderColor: `${PRIMARY}30`, backgroundColor: "#F0F6FF" }}>
                  → {nextStatus}
                </button>
                <button className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all hover:bg-[#F8FAFC]"
                  style={{ color: MUTED, borderColor: BORDER }}>
                  Assign
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WorkOrders({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [filter, setFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [newWO, setNewWO] = useState({ location: "", category: "Electrical", priority: "Medium", desc: "" });

  const visible = filter === "All" ? WORK_ORDERS : WORK_ORDERS.filter(w => w.status === filter);

  const submitWO = () => {
    if (!newWO.location || !newWO.desc) { add({ type: "warning", title: "Fill in location and description" }); return; }
    setShowNew(false);
    add({ type: "success", title: "Work order created", body: `${newWO.location} — ${newWO.category} · ${newWO.priority} priority` });
    setNewWO({ location: "", category: "Electrical", priority: "Medium", desc: "" });
  };

  return (
    <div>
      <PageHeader title="Work Orders" sub="All maintenance requests across the property"
        actions={<><BtnO label="Export" icon={Download} /><BtnP label="New Work Order" icon={Plus} onClick={() => setShowNew(true)} /></>} />
      <div className="flex gap-2.5 mb-5 flex-wrap">
        {["All", "Reported", "Assigned", "In Progress", "Overdue", "Completed"].map(s => (
          <button key={s} onClick={() => setFilter(s)} className="px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all"
            style={{ borderColor: filter === s ? PRIMARY : BORDER, backgroundColor: filter === s ? "#EFF6FF" : "white", color: filter === s ? PRIMARY : MUTED }}>
            {s}
            {s === "Overdue" && <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>2</span>}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER, boxShadow: "0 2px 8px rgba(13,27,46,0.06)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>
              {["ID", "Location", "Category", "Priority", "Status", "Technician", "Age", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED, letterSpacing: "0.07em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((w, i) => (
              <tr key={w.id} className="border-t hover:bg-[#F8FAFC] transition-colors cursor-pointer" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}
                onClick={() => nav && nav("work-order-detail", w.id)}>
                <td className="px-4 py-3.5 text-xs font-mono" style={{ color: MUTED, fontFamily: mono }}>{w.id}</td>
                <td className="px-4 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{w.location}</td>
                <td className="px-4 py-3.5 text-sm" style={{ color: MUTED }}>{w.cat}</td>
                <td className="px-4 py-3.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ color: priC[w.priority], backgroundColor: `${priC[w.priority]}12` }}>
                    {w.priority}
                  </span>
                </td>
                <td className="px-4 py-3.5"><Badge label={w.status} colors={woC[w.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td>
                <td className="px-4 py-3.5 text-sm" style={{ color: MUTED }}>{w.tech}</td>
                <td className="px-4 py-3.5 text-xs font-semibold" style={{ color: w.status === "Overdue" ? ERROR : ORANGE, fontFamily: mono }}>{w.age}</td>
                <td className="px-4 py-3.5"><button className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }} onClick={e => e.stopPropagation()}><MoreHorizontal size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <EmptyState icon={Wrench} message="No work orders match this filter." cta="New Work Order" onCta={() => setShowNew(true)} />}
      </div>

      {/* New Work Order Modal */}
      {showNew && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowNew(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold" style={{ color: TEXT, fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>New Work Order</h3>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>Report a maintenance issue across the property</p>
              </div>
              <button onClick={() => setShowNew(false)} style={{ color: SUBTLE }}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Location</label>
                <input value={newWO.location} onChange={e => setNewWO(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Room 207, Restaurant Kitchen, Pool Area"
                  className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}
                  onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Category</label>
                  <select value={newWO.category} onChange={e => setNewWO(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                    {["Electrical", "HVAC", "Plumbing", "Furniture", "Equipment", "General"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Priority</label>
                  <select value={newWO.priority} onChange={e => setNewWO(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, color: TEXT }}>
                    {["Low", "Medium", "High"].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Description</label>
                <textarea value={newWO.desc} onChange={e => setNewWO(p => ({ ...p, desc: e.target.value }))} placeholder="Describe the issue clearly. Include what's broken, how long it's been a problem, and any safety concerns." rows={3} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none resize-none" style={{ borderColor: BORDER, color: TEXT }}
                  onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = BORDER} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <BtnO label="Cancel" onClick={() => setShowNew(false)} />
              <BtnP label="Create Work Order" icon={CheckCircle2} onClick={submitWO} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function InternalChat({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const channels = ["All Staff", "Reception", "Housekeeping", "Maintenance"];
  const [active, setActive] = useState("Reception");
  const [msg, setMsg] = useState("");
  const msgs = CHAT_MSGS[active] ?? [];
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active]);
  const send = () => { if (!msg.trim()) return; add({ type: "success", title: "Message sent", body: `#${active}` }); setMsg(""); };
  return (
    <div>
      <PageHeader title="Internal Chat" sub="LAN-based staff messaging · Fully offline" actions={<button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: ERROR }}><AlertTriangle size={14} />🚨 Emergency Broadcast</button>} />
      <div className="bg-white rounded-xl border overflow-hidden flex" style={{ borderColor: BORDER, height: 560 }}>
        <div className="w-56 flex-shrink-0 border-r flex flex-col" style={{ borderColor: BORDER }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}><div className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Channels</div></div>
          <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "none" }}>
            {channels.map(ch => { const unread = ch === "Maintenance" ? 2 : ch === "All Staff" ? 1 : 0; return <button key={ch} onClick={() => setActive(ch)} className="w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-[#F8FAFC]" style={{ backgroundColor: active === ch ? "#EFF6FF" : "transparent", borderLeft: active === ch ? `3px solid ${PRIMARY}` : "3px solid transparent" }}><span className="text-sm font-medium" style={{ color: active === ch ? PRIMARY : TEXT }}>#{ch}</span>{unread > 0 && <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: ERROR }}>{unread}</span>}</button>; })}
            <div className="px-4 py-2 mt-2 border-t" style={{ borderColor: BORDER }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: MUTED }}>Direct Messages</div>
              {STAFF.slice(0, 4).map(s => <button key={s.id} className="w-full flex items-center gap-2.5 py-2 text-left hover:bg-[#F8FAFC] rounded-lg px-2"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{s.av}</div><div className="min-w-0"><div className="text-xs font-medium truncate" style={{ color: TEXT }}>{s.name.split(" ")[0]}</div><div className="w-2 h-2 rounded-full mt-0.5" style={{ backgroundColor: SUCCESS }} /></div></button>)}
            </div>
          </div>
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${PRIMARY}18` }}><MessageSquare size={16} style={{ color: PRIMARY }} /></div>
            <div><div className="text-sm font-semibold" style={{ color: TEXT }}>#{active}</div><div className="text-xs" style={{ color: SUBTLE }}>Department channel</div></div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "none" }}>
            {msgs.map((m, i) => <div key={i} className={`flex items-end gap-3 ${m.mine ? "flex-row-reverse" : ""}`}>{!m.mine && <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mb-1" style={{ backgroundColor: PRIMARY }}>{m.av}</div>}<div className={`max-w-xs lg:max-w-md ${m.mine ? "items-end" : "items-start"} flex flex-col`}>{!m.mine && <span className="text-xs font-medium mb-1" style={{ color: MUTED }}>{m.from}</span>}<div className="px-3 py-2 rounded-xl text-sm" style={{ backgroundColor: m.mine ? PRIMARY : "#F1F5F9", color: m.mine ? "white" : TEXT }}>{m.msg}</div><span className="text-xs mt-1" style={{ color: SUBTLE, fontFamily: mono }}>{m.time}</span></div></div>)}
            <div ref={endRef} />
          </div>
          <div className="px-5 py-3 border-t" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-3"><input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`Message #${active}…`} className="flex-1 px-4 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} /><button onClick={send} className="w-10 h-10 rounded-xl flex items-center justify-center text-white hover:opacity-90" style={{ backgroundColor: PRIMARY }}><Send size={16} /></button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function POSTerminal({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [order, setOrder] = useState<Array<{ id: number; name: string; price: number; qty: number }>>([]);
  const [activeCat, setActiveCat] = useState("Mains");
  const [showRoomPost, setShowRoomPost] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState("202");
  const cats = ["Mains", "Starters", "Sides", "Drinks", "Desserts"];
  const items = MENU_ITEMS.filter(i => i.cat === activeCat && i.avail);
  const addItem = (item: typeof MENU_ITEMS[0]) => setOrder(prev => { const ex = prev.find(o => o.id === item.id); if (ex) return prev.map(o => o.id === item.id ? { ...o, qty: o.qty + 1 } : o); return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }]; });
  const removeItem = (id: number) => setOrder(prev => prev.map(o => o.id === id ? { ...o, qty: Math.max(0, o.qty - 1) } : o).filter(o => o.qty > 0));
  const subtotal = order.reduce((s, o) => s + o.price * o.qty, 0);
  const tax = Math.round(subtotal * 0.075); const total = subtotal + tax;
  return (
    <div>
      <PageHeader title="POS Terminal" sub="Table T02 · Party of 3" actions={<BtnO label="Tables" icon={Layers} />} />
      <div className="flex gap-4 h-[580px]">
        <div className="flex-1 flex flex-col bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>{cats.map(c => <button key={c} onClick={() => setActiveCat(c)} className="flex-1 py-3 text-sm font-medium transition-colors" style={{ color: activeCat === c ? PRIMARY : MUTED, borderBottom: activeCat === c ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{c}</button>)}</div>
          <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "none" }}><div className="grid grid-cols-2 lg:grid-cols-3 gap-3">{items.map(item => <button key={item.id} onClick={() => addItem(item)} className="p-4 rounded-xl border-2 text-left transition-all hover:border-[#123A73] hover:shadow-sm" style={{ borderColor: order.find(o => o.id === item.id) ? PRIMARY : BORDER, backgroundColor: order.find(o => o.id === item.id) ? "#EFF6FF" : "white" }}><div className="text-sm font-semibold mb-1" style={{ color: TEXT }}>{item.name}</div><div className="text-base font-bold" style={{ color: PRIMARY }}>₦{item.price.toLocaleString()}</div>{order.find(o => o.id === item.id) && <div className="mt-1 text-xs font-medium" style={{ color: TEAL }}>×{order.find(o => o.id === item.id)?.qty} added</div>}</button>)}</div></div>
        </div>
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border flex flex-col" style={{ borderColor: BORDER }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}><div className="text-sm font-semibold" style={{ color: TEXT }}>Current Order</div><div className="text-xs" style={{ color: SUBTLE }}>{order.length === 0 ? "No items yet" : `${order.reduce((s, o) => s + o.qty, 0)} items`}</div></div>
          <div className="flex-1 overflow-y-auto px-4 py-2" style={{ scrollbarWidth: "none" }}>
            {order.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-center"><ShoppingCart size={28} style={{ color: SUBTLE }} /><p className="text-xs mt-2" style={{ color: SUBTLE }}>Tap menu items to add</p></div>
              : order.map(o => <div key={o.id} className="flex items-center gap-2 py-2.5 border-b" style={{ borderColor: "#F8FAFC" }}><div className="flex-1 min-w-0"><div className="text-xs font-medium truncate" style={{ color: TEXT }}>{o.name}</div><div className="text-xs" style={{ color: MUTED }}>₦{o.price.toLocaleString()}</div></div><div className="flex items-center gap-1"><button onClick={() => removeItem(o.id)} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: MUTED }}><MinusCircle size={14} /></button><span className="w-5 text-center text-sm font-semibold" style={{ color: TEXT }}>{o.qty}</span><button onClick={() => addItem(MENU_ITEMS.find(i => i.id === o.id)!)} className="w-6 h-6 rounded flex items-center justify-center" style={{ color: PRIMARY }}><PlusCircle size={14} /></button></div><div className="text-sm font-semibold w-16 text-right" style={{ color: TEXT }}>₦{(o.price * o.qty).toLocaleString()}</div></div>)}
          </div>
          {order.length > 0 && <div className="px-4 py-4 border-t" style={{ borderColor: BORDER }}>
            <div className="space-y-1 text-sm mb-3"><div className="flex justify-between"><span style={{ color: MUTED }}>Subtotal</span><span>₦{subtotal.toLocaleString()}</span></div><div className="flex justify-between"><span style={{ color: MUTED }}>VAT 7.5%</span><span>₦{tax.toLocaleString()}</span></div><div className="flex justify-between font-bold text-base" style={{ color: TEXT }}><span>Total</span><span>₦{total.toLocaleString()}</span></div></div>
            <div className="space-y-2"><BtnP label="Send to Kitchen" icon={UtensilsCrossed} onClick={() => { add({ type: "success", title: "Order sent to kitchen", body: `${order.length} items · Table T02` }); setOrder([]); }} /><BtnO label="Post to Room Folio" icon={FileText} onClick={() => add({ type: "info", title: "Post to room" })} /></div>
          </div>}
        </div>
      </div>
    </div>
  );
}

export function TableManagement({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Table Management" sub="Restaurant floor plan · Live status" actions={<><BtnO label="Dining Reservations" icon={CalendarDays} onClick={() => nav && nav("dining-reservations", "Dining Reservations")} /><BtnP label="Open POS" icon={UtensilsCrossed} onClick={() => nav && nav("pos-terminal", "POS Terminal")} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Occupied", v: TABLE_LAYOUT.filter(t => t.status === "Occupied").length, c: ORANGE }, { l: "Available", v: TABLE_LAYOUT.filter(t => t.status === "Available").length, c: SUCCESS }, { l: "Reserved", v: TABLE_LAYOUT.filter(t => t.status === "Reserved").length, c: TEAL }, { l: "Dirty", v: TABLE_LAYOUT.filter(t => t.status === "Dirty").length, c: WARNING }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-3xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Floor Plan</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 12, minHeight: 280 }}>
            {TABLE_LAYOUT.map(t => { const c = tblC[t.status] ?? { bg: "#F1F5F9", border: "#CBD5E1", text: "#374151" }; return <div key={t.id} onClick={() => setSelected(t.id)} className="cursor-pointer rounded-xl border-2 flex flex-col items-center justify-center hover:shadow-md transition-all" style={{ gridColumn: `${t.col} / span 2`, gridRow: `${t.row} / span 2`, backgroundColor: selected === t.id ? `${c.border}30` : c.bg, borderColor: selected === t.id ? c.border : `${c.border}80`, padding: 8, minHeight: 72 }}><div className="text-xs font-bold" style={{ color: c.text }}>{t.id}</div><div className="text-xs" style={{ color: c.text }}>{t.seats}p</div>{t.status === "Occupied" && (t as any).time && <div className="text-xs mt-0.5" style={{ color: c.text, fontFamily: mono }}>{(t as any).time}</div>}</div>; })}
          </div>
          <div className="flex gap-4 mt-4 pt-4 border-t text-xs" style={{ borderColor: "#F1F5F9", color: MUTED }}>{Object.entries(tblC).map(([s, c]) => <span key={s} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block border" style={{ backgroundColor: c.bg, borderColor: c.border }} />{s}</span>)}</div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>{selected ? `Table ${selected}` : "Select a table"}</h3>
          {selected ? (() => { const t = TABLE_LAYOUT.find(x => x.id === selected)!; const c = tblC[t.status] ?? { bg: "#F1F5F9", border: "#CBD5E1", text: "#374151" }; return <div><Badge label={t.status} colors={{ bg: c.bg, text: c.text }} /><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span style={{ color: MUTED }}>Seats</span><span style={{ color: TEXT }}>{t.seats} persons</span></div>{(t as any).guest && <div className="flex justify-between"><span style={{ color: MUTED }}>Guest</span><span style={{ color: TEXT }}>{(t as any).guest}</span></div>}{(t as any).time && <div className="flex justify-between"><span style={{ color: MUTED }}>Time seated</span><span style={{ color: TEXT, fontFamily: mono }}>{(t as any).time}</span></div>}</div><div className="space-y-2 mt-4">{t.status === "Available" && <BtnP label="Seat Party" icon={Users} onClick={() => add({ type: "success", title: `Table ${t.id} seated` })} />}{t.status === "Occupied" && <BtnP label="Open Check" icon={FileText} onClick={() => add({ type: "info", title: `Check for ${t.id}` })} />}{t.status === "Dirty" && <BtnP label="Mark Clean" icon={CheckCircle2} onClick={() => add({ type: "success", title: `Table ${t.id} clean` })} color={SUCCESS} />}<BtnO label="Reserve Table" icon={CalendarDays} /></div></div>; })()
            : <EmptyState icon={UtensilsCrossed} message="Click a table on the floor plan to see details and actions." />}
        </div>
      </div>
    </div>
  );
}

export function BranchOverview({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  return (
    <div>
      <PageHeader title="Branch Overview" sub="All branches under Grand Palms Group" actions={<BtnP label="Add New Branch" icon={Plus} onClick={() => add({ type: "info", title: "Branch provisioning", body: "Contact platform admin to provision a new local server" })} />} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">{BRANCHES.map(b => <div key={b.id} onClick={() => nav && nav("branch-comparison", b.name)} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow cursor-pointer" style={{ borderColor: BORDER }}><div className="flex items-start justify-between mb-4"><div><h3 className="text-base font-bold" style={{ color: TEXT }}>{b.name}</h3><div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: MUTED }}><MapPin size={11} />{b.location}</div></div><div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.status === "synced" ? SUCCESS : WARNING }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.status === "synced" ? SUCCESS : WARNING }} />{b.status === "synced" ? "Synced" : "Pending"}</div></div><div className="grid grid-cols-2 gap-3 mb-4">{[{ l: "Occupancy", v: `${b.occ}%`, c: b.occ > 80 ? SUCCESS : WARNING }, { l: "Revenue Today", v: b.rev, c: TEXT }, { l: "Open Issues", v: b.issues, c: b.issues > 5 ? ERROR : SUCCESS }, { l: "Total Rooms", v: b.rooms, c: TEXT }].map(s => <div key={s.l} className="rounded-lg p-3" style={{ backgroundColor: "#F8FAFC" }}><div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs" style={{ color: MUTED }}>{s.l}</div></div>)}</div><div className="pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: "#F1F5F9" }}><div style={{ color: MUTED }}>Manager: <span style={{ color: TEXT, fontWeight: 500 }}>{b.manager}</span></div><div style={{ color: SUBTLE }}>Synced {b.lastSync}</div></div></div>)}</div>
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy Comparison</h3>
        <ResponsiveContainer width="100%" height={200}><BarChart data={BRANCHES} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, "Occupancy"]} /><Bar key="branch-occ-bar" dataKey="occ" name="Occupancy" fill={PRIMARY} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
      </div>
    </div>
  );
}

export function StaffDirectory({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = STAFF.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || s.dept.toLowerCase().includes(search.toLowerCase()));
  return (
    <div>
      <PageHeader title="Staff Directory" sub={`${STAFF.length} staff members · Grand Palms Abuja Branch`} actions={<><BtnO label="Export" icon={Download} /><BtnP label="Add Staff Member" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative flex-1 max-w-xs"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or department…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-full" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Departments", "Management", "Front Desk", "Housekeeping", "Maintenance", "Finance"]} />
          <Sel options={["All Status", "Active", "On Leave", "Inactive"]} />
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Employee", "Role", "Department", "Phone", "Last Login", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(s => <tr key={s.id} className="border-t hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{s.av}</div><div><div className="text-sm font-semibold" style={{ color: TEXT }}>{s.name}</div><div className="text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{s.id}</div></div></div></td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{s.role}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{s.dept}</span></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{s.phone}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{s.lastLogin}</td><td className="px-5 py-3"><Badge label={s.status} colors={s.status === "Active" ? { bg: "#DCFCE7", text: "#166534" } : { bg: "#FEF3C7", text: "#92400E" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => nav && nav("staff-profile", s.name)} className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><Eye size={13} /></button><button className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><Edit3 size={13} /></button><button className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#FEF2F2]" style={{ color: ERROR }}><Trash2 size={13} /></button></div></td></tr>)}</tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon={Users} message="No staff members match your search." />}
      </div>
    </div>
  );
}

export function DailySummary({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [locked, setLocked] = useState(false);
  const cats = [{ cat: "Room Revenue", amount: 825000, txn: 15 }, { cat: "Restaurant & Bar", amount: 225000, txn: 42 }, { cat: "Laundry", amount: 18000, txn: 6 }, { cat: "Minibar", amount: 24000, txn: 18 }, { cat: "Events", amount: 155800, txn: 2 }];
  const total = cats.reduce((s, c) => s + c.amount, 0);
  return (
    <div>
      <PageHeader title="Daily Summary" sub="24 Jun 2025 · Grand Palms Hotel, Abuja"
        actions={locked ? <button onClick={() => add({ type: "info", title: "Reopen summary", body: "MGT/ORG authorization required" })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border" style={{ color: MUTED, borderColor: BORDER }}>Reopen (Auth Required)</button> : <BtnP label="Lock & Close Day" icon={Lock} onClick={() => { setLocked(true); add({ type: "success", title: "Daily summary locked", body: "24 Jun 2025 closed by Grace Mensah" }); }} />} />
      {locked && <div className="flex items-center gap-2 px-4 py-3 rounded-xl mb-5 text-sm font-medium" style={{ backgroundColor: "#DCFCE7", color: SUCCESS, border: `1px solid #BBF7D0` }}><Lock size={15} />Daily summary locked at 23:59 · Closed by Grace Mensah</div>}
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Revenue", v: fmtN(total), c: SUCCESS, icon: TrendingUp }, { l: "Transactions", v: "83", c: PRIMARY, icon: Activity }, { l: "Discounts Applied", v: "₦45,000", c: WARNING, icon: TrendingDown }, { l: "Outstanding Balance", v: "₦284,500", c: ERROR, icon: AlertTriangle }].map(s => { const Icon = s.icon; return <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><Icon size={20} style={{ color: s.c }} /><div className="text-2xl font-bold mt-2 mb-0.5" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>; })}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue by Category</h3>
          {cats.map(c => <div key={c.cat} className="flex items-center gap-3 mb-3"><span className="text-sm flex-1" style={{ color: MUTED }}>{c.cat}</span><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${(c.amount / total) * 100}%`, backgroundColor: PRIMARY }} /></div><div className="text-right w-28"><div className="text-sm font-semibold" style={{ color: TEXT }}>{fmtN(c.amount)}</div><div className="text-xs" style={{ color: SUBTLE }}>{c.txn} txns</div></div></div>)}
          <div className="pt-3 mt-2 border-t flex items-center justify-between font-bold" style={{ borderColor: BORDER, color: TEXT }}><span>Total</span><span>{fmtN(total)}</span></div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Payments by Method</h3>
          {[{ method: "Cash", amount: 580000 }, { method: "POS / Card", amount: 420000 }, { method: "Bank Transfer", amount: 247800 }].map(p => <div key={p.method} className="flex items-center gap-3 mb-3"><CreditCard size={16} style={{ color: MUTED, flexShrink: 0 }} /><span className="text-sm flex-1" style={{ color: MUTED }}>{p.method}</span><span className="text-sm font-bold" style={{ color: TEXT }}>{fmtN(p.amount)}</span></div>)}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: BORDER }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Cash Reconciliation</h4>
            {[["Opening Balance", "₦150,000"], ["Cash Received", "₦580,000"], ["Petty Cash Out", "−₦42,000"], ["Closing Balance", "₦688,000"]].map(([k, v], i) => <div key={k} className={`flex justify-between text-sm ${i === 3 ? "font-bold border-t pt-2 mt-1" : "mb-1.5"}`} style={{ borderColor: BORDER, color: i === 3 ? TEXT : MUTED }}><span>{k}</span><span style={{ color: i === 3 ? SUCCESS : undefined }}>{v}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OccupancyReports() {
  const monthly = [{ month: "Jan", occ: 61 }, { month: "Feb", occ: 68 }, { month: "Mar", occ: 74 }, { month: "Apr", occ: 71 }, { month: "May", occ: 79 }, { month: "Jun", occ: 88 }, { month: "Jul", occ: 92 }, { month: "Aug", occ: 90 }];
  return (
    <div>
      <PageHeader title="Occupancy Reports" sub="Grand Palms Hotel, Abuja · Year to date 2025" actions={<><BtnO label="Export Excel" icon={Download} /><BtnO label="Export PDF" icon={FileText} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Avg Occupancy (YTD)", v: "78.4%", d: "+5.2% vs 2024", up: true }, { l: "No-Show Rate", v: "3.2%", d: "−0.8% vs last month", up: true }, { l: "Cancellation Rate", v: "8.1%", d: "+1.1% vs last month", up: false }, { l: "Avg Length of Stay", v: "2.8 nights", d: "+0.3 vs last month", up: true }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{s.v}</div><div className="text-xs uppercase tracking-wider mb-1" style={{ color: MUTED }}>{s.l}</div><div className={`flex items-center gap-1 text-xs ${s.up ? "text-green-600" : "text-red-500"}`}>{s.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{s.d}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Monthly Occupancy — 2025</h3>
          <ResponsiveContainer width="100%" height={220}><BarChart data={monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" /><XAxis dataKey="month" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} /><Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`]} /><Bar key="monthly-occ-bar" dataKey="occ" name="Occupancy" fill={PRIMARY} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy by Room Type</h3>
          {[{ type: "Suite", occ: 94 }, { type: "Deluxe", occ: 88 }, { type: "Standard", occ: 84 }].map(r => <div key={r.type} className="mb-4"><div className="flex items-center justify-between text-sm mb-1.5"><span style={{ color: TEXT }}>{r.type}</span><span className="font-bold" style={{ color: PRIMARY }}>{r.occ}%</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${r.occ}%`, backgroundColor: PRIMARY }} /></div></div>)}
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
            <div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Key Metrics</div>
            {[["ADR", "₦55,417"], ["RevPAR", "₦48,767"], ["GOP %", "62.4%"]].map(([k, v]) => <div key={k} className="flex justify-between text-sm mb-1.5"><span style={{ color: MUTED }}>{k}</span><span className="font-semibold" style={{ color: TEXT }}>{v}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StockDashboard({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const critical = STOCK.filter(i => i.status === "Critical");
  return (
    <div>
      <PageHeader title="Stock Dashboard" sub="Inventory overview · Grand Palms Hotel" actions={<><BtnO label="Purchase Orders" icon={FileText} /><BtnP label="Log Transaction" icon={Plus} /></>} />
      {critical.length > 0 && <div className="flex items-start gap-3 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: "#FEF2F2", border: `1px solid #FECACA` }}><AlertTriangle size={16} style={{ color: ERROR, marginTop: 1 }} /><div><div className="text-sm font-semibold" style={{ color: ERROR }}>Critical Stock — {critical.length} items require immediate reorder</div><div className="text-xs mt-0.5" style={{ color: "#991B1B" }}>{critical.map(i => i.name).join(" · ")}</div></div><button className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: ERROR }}>Reorder Now</button></div>}
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Items", v: STOCK.length.toString(), c: PRIMARY }, { l: "Critical", v: critical.length.toString(), c: ERROR }, { l: "Low Stock", v: STOCK.filter(i => i.status === "Low").length.toString(), c: WARNING }, { l: "Total Value", v: fmtN(STOCK.reduce((s, i) => s + i.current * i.cost, 0)), c: SUCCESS }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>All Items</h3><BtnO label="Export" icon={Download} /></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Item", "Category", "Current / Par", "Reorder Point", "Unit Cost", "Value", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{STOCK.map(item => { const c = stC(item.status); const pct = Math.round((item.current / item.par) * 100); return <tr key={item.name} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{item.name}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.cat}</td><td className="px-5 py-3"><div className="flex items-center gap-2"><span className="text-sm font-semibold" style={{ color: c.text }}>{item.current}</span><span className="text-xs" style={{ color: SUBTLE }}>/ {item.par} {item.unit}</span></div><div className="mt-1 h-1.5 w-24 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: c.bar }} /></div></td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{item.reorder} {item.unit}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>₦{item.cost.toLocaleString()}</td><td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>₦{(item.current * item.cost).toLocaleString()}</td><td className="px-5 py-3"><Badge label={item.status} colors={{ bg: c.bg, text: c.text }} /></td><td className="px-5 py-3"><button onClick={() => add({ type: "info", title: `Reorder ${item.name}` })} className="text-xs px-2.5 py-1 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Reorder</button></td></tr>; })}</tbody>
        </table>
      </div>
    </div>
  );
}

export function SystemHealth() {
  const svcs = [
    { name: "Web Server (Nginx)", status: "up", uptime: "14d 6h 22m", ver: "v1.25.3" },
    { name: "Application Server", status: "up", uptime: "14d 6h 22m", ver: "v2.4.1" },
    { name: "PostgreSQL Database", status: "up", uptime: "14d 6h 22m", ver: "v15.4" },
    { name: "Sync Service", status: "up", uptime: "2h 14m", ver: "v1.2.0" },
    { name: "Card Encoder Agent", status: "up", uptime: "8h 03m", ver: "v1.0.4" },
    { name: "Backup Service", status: "warning", uptime: "Last backup: 2h ago", ver: "v1.1.0" },
    { name: "TTLock API Adapter", status: "down", uptime: "Last contact: 47m ago", ver: "v1.3.2" },
  ];
  const sc: any = { up: SUCCESS, warning: WARNING, down: ERROR };
  const sb: any = { up: "#DCFCE7", warning: "#FEF9C3", down: "#FEE2E2" };
  return (
    <div>
      <PageHeader title="System Health" sub="Local server status · Grand Palms Abuja" actions={<BtnP label="Run Diagnostic" icon={Activity} />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">{[{ l: "CPU Usage", v: "34%", c: SUCCESS, w: 34 }, { l: "Memory", v: "61%", c: WARNING, w: 61 }, { l: "Disk Usage", v: "47%", c: SUCCESS, w: 47 }, { l: "Network (LAN)", v: "12 ms", c: SUCCESS, w: 15 }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider mb-2" style={{ color: MUTED }}>{s.l}</div><div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${s.w}%`, backgroundColor: s.c }} /></div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Services</h3></div>
        {svcs.map(s => <div key={s.name} className="flex items-center gap-4 px-5 py-4 border-b hover:bg-[#FAFBFD]" style={{ borderColor: "#F8FAFC" }}><div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: sb[s.status] }}><Server size={16} style={{ color: sc[s.status] }} /></div><div className="flex-1"><div className="text-sm font-medium" style={{ color: TEXT }}>{s.name}</div><div className="text-xs mt-0.5" style={{ color: SUBTLE }}>{s.uptime} · {s.ver}</div></div><Badge label={s.status === "up" ? "Running" : s.status === "warning" ? "Warning" : "Down"} colors={{ bg: sb[s.status], text: sc[s.status] }} /><div className="flex gap-1"><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Restart</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Logs</button></div></div>)}
      </div>
    </div>
  );
}

export function CheckInWizard({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [step, setStep] = useState(1);
  const [selRes, setSelRes] = useState<string | null>(null);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("Cash");
  const [credType, setCredType] = useState<"card" | "pin" | "both">("both");
  const [encoded, setEncoded] = useState(false);
  const [pinGen, setPinGen] = useState(false);
  const STEPS = ["Select Reservation", "Verify Guest", "Assign Room", "Payment", "Receipt", "Confirm", "Room Access"];
  const arrivals = [
    { id: "BK-2849", guest: "Dr. Chukwuemeka Bello", room: "501", type: "Suite", checkin: "Today 14:00", nights: 3, rate: 85000, vip: true },
    { id: "BK-2850", guest: "Aisha Mohammed", room: "203", type: "Deluxe", checkin: "Today 12:00", nights: 2, rate: 55000, vip: false },
    { id: "BK-2851", guest: "Peter Okafor", room: "102", type: "Standard", checkin: "Today 15:30", nights: 1, rate: 35000, vip: false },
  ];
  const selData = arrivals.find(a => a.id === selRes);
  return (
    <div>
      <PageHeader title="Guest Check-In" sub="7-step check-in wizard" />
      <div className="bg-white rounded-xl border p-5 mb-4" style={{ borderColor: BORDER }}>
        <div className="flex items-center">{STEPS.map((s, i) => { const n = i + 1; const done = n < step; const active = n === step; return <div key={s} className="flex items-center flex-1"><div className="flex flex-col items-center flex-shrink-0"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: done ? SUCCESS : active ? PRIMARY : "#E2E8F0", color: done || active ? "white" : SUBTLE }}>{done ? <CheckCircle2 size={14} /> : n}</div><span className="text-xs mt-1 text-center w-16" style={{ color: active ? PRIMARY : done ? SUCCESS : SUBTLE, fontWeight: active ? 600 : 400 }}>{s}</span></div>{i < STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 mb-4" style={{ backgroundColor: done ? SUCCESS : "#E2E8F0" }} />}</div>; })}</div>
      </div>
      <div className="bg-white rounded-xl border p-6" style={{ borderColor: BORDER }}>
        {step === 1 && <div><h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Select Reservation</h2><p className="text-sm mb-4" style={{ color: MUTED }}>Search or select from today's arrivals.</p><div className="relative mb-4"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search guest name or reservation ID…" className="pl-9 pr-4 py-2.5 w-full border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div><div className="space-y-2">{arrivals.map(a => <div key={a.id} onClick={() => setSelRes(a.id)} className="flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all" style={{ borderColor: selRes === a.id ? PRIMARY : BORDER, backgroundColor: selRes === a.id ? "#EFF6FF" : "white" }}><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{a.guest.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><div className="flex-1"><div className="flex items-center gap-2"><span className="text-sm font-semibold" style={{ color: TEXT }}>{a.guest}</span>{a.vip && <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}><Star size={10} fill={ORANGE} />VIP</span>}</div><div className="text-xs mt-0.5" style={{ color: MUTED }}><span style={{ fontFamily: mono }}>{a.id}</span> · Room {a.room} {a.type} · {a.checkin} · {a.nights}n</div></div><div className="text-right"><div className="text-sm font-bold" style={{ color: TEXT }}>{fmtN(a.rate * a.nights)}</div></div>{selRes === a.id && <CheckCircle2 size={20} style={{ color: PRIMARY }} />}</div>)}</div></div>}
        {step === 2 && selData && <div><h2 className="text-base font-semibold mb-4" style={{ color: TEXT }}>Verify Guest</h2>{selData.vip && <div className="flex items-center gap-2 p-3 rounded-lg mb-4" style={{ backgroundColor: "#FEF3C7", border: `1px solid #FDE68A` }}><Star size={16} fill={ORANGE} style={{ color: ORANGE }} /><span className="text-sm font-medium" style={{ color: "#92400E" }}>VIP Guest — Ensure Suite 501 is fully prepared. Champagne on arrival.</span></div>}<div className="grid grid-cols-2 gap-4 mb-4"><Inp label="Full Name" defaultValue={selData.guest} /><Inp label="Reservation ID" defaultValue={selData.id} /><Sel label="ID Type" options={["International Passport", "National ID Card", "Driver's License"]} /><Inp label="ID Number" placeholder="A1234567" /></div><div className="border-2 border-dashed rounded-xl p-6 text-center" style={{ borderColor: BORDER }}><FileText size={24} className="mx-auto mb-2" style={{ color: SUBTLE }} /><p className="text-sm" style={{ color: MUTED }}>Upload or scan ID document</p><button className="mt-3 px-4 py-2 rounded-lg text-xs font-medium border" style={{ color: PRIMARY, borderColor: PRIMARY }}>Choose File</button></div></div>}
        {step === 3 && <div><h2 className="text-base font-semibold mb-2" style={{ color: TEXT }}>Assign Room</h2><p className="text-sm mb-4" style={{ color: MUTED }}>Select from available rooms. Must be Clean or Inspected.</p><div className="grid grid-cols-3 gap-3">{ROOMS.filter(r => r.status === "Available").map(r => <div key={r.id} onClick={() => setSelRoom(r.id)} className="p-4 rounded-xl border-2 cursor-pointer transition-all" style={{ borderColor: selRoom === r.id ? PRIMARY : BORDER, backgroundColor: selRoom === r.id ? "#EFF6FF" : "white" }}><div className="flex items-center justify-between mb-1"><span className="text-lg font-bold" style={{ color: TEXT }}>{r.id}</span>{selRoom === r.id && <CheckCircle2 size={16} style={{ color: PRIMARY }} />}</div><div className="text-xs" style={{ color: MUTED }}>{r.type} · F{r.floor}</div><Badge label="Available" colors={{ bg: "#DCFCE7", text: "#166534" }} /></div>)}</div></div>}
        {step === 4 && selData && <div><h2 className="text-base font-semibold mb-4" style={{ color: TEXT }}>Collect Payment / Deposit</h2><div className="grid grid-cols-2 gap-6"><div><div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#F8FAFC" }}><h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Charges</h3><div className="space-y-2 text-sm"><div className="flex justify-between"><span style={{ color: MUTED }}>Room × {selData.nights} nights</span><span>₦{(selData.rate * selData.nights).toLocaleString()}</span></div><div className="flex justify-between"><span style={{ color: MUTED }}>VAT (7.5%)</span><span>₦{Math.round(selData.rate * selData.nights * 0.075).toLocaleString()}</span></div><div className="pt-2 border-t flex justify-between font-bold" style={{ borderColor: BORDER, color: TEXT }}><span>Total</span><span>₦{Math.round(selData.rate * selData.nights * 1.075).toLocaleString()}</span></div></div></div><Inp label="Deposit Amount (₦)" defaultValue={selData.rate.toLocaleString()} /></div><div><label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: MUTED }}>Payment Method</label>{["Cash", "POS / Card", "Bank Transfer"].map(m => <label key={m} className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer mb-2" style={{ borderColor: payMethod === m ? PRIMARY : BORDER, backgroundColor: payMethod === m ? "#EFF6FF" : "white" }}><div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: payMethod === m ? PRIMARY : "#CBD5E1" }}>{payMethod === m && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIMARY }} />}</div><input type="radio" className="hidden" checked={payMethod === m} onChange={() => setPayMethod(m)} /><span className="text-sm font-medium" style={{ color: TEXT }}>{m}</span></label>)}</div></div></div>}
        {step === 5 && <div className="text-center py-4"><CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: SUCCESS }} /><h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Receipt Generated</h2><p className="text-sm mb-5" style={{ color: MUTED }}>Payment received. Send receipt to guest.</p><div className="flex justify-center gap-3"><BtnO label="Print Receipt" icon={FileText} /><BtnO label="WhatsApp" icon={Send} /><BtnO label="Email" icon={Mail} /></div></div>}
        {step === 6 && <div className="text-center py-4"><div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#DCFCE7" }}><KeyRound size={32} style={{ color: SUCCESS }} /></div><h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Check-In Confirmed</h2><p className="text-sm mb-1" style={{ color: MUTED }}>Room {selRoom ?? "501"} is now Occupied. Folio opened.</p><p className="text-sm" style={{ color: TEAL }}>Proceeding to Room Access Activation…</p></div>}
        {step === 7 && <div>
          <h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Activate Room Access</h2>
          <p className="text-sm mb-4" style={{ color: MUTED }}>Issue credentials for Room {selRoom ?? "501"}.</p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-5 text-sm" style={{ backgroundColor: "#DCFCE7", border: `1px solid #BBF7D0`, color: SUCCESS }}><Wifi size={14} /><span>Connected — TTLock API reachable</span></div>
          <div className="grid grid-cols-3 gap-3 mb-5">{(["card", "pin", "both"] as const).map(ct => <button key={ct} onClick={() => setCredType(ct)} className="p-4 rounded-xl border-2 text-center transition-all" style={{ borderColor: credType === ct ? PRIMARY : BORDER, backgroundColor: credType === ct ? "#EFF6FF" : "white" }}><div className="text-2xl mb-1">{ct === "card" ? "💳" : ct === "pin" ? "🔢" : "💳+🔢"}</div><div className="text-xs font-semibold" style={{ color: TEXT }}>{ct === "card" ? "Key Card" : ct === "pin" ? "PIN Code" : "Card + PIN"}</div></button>)}</div>
          {(credType === "card" || credType === "both") && <div className="rounded-xl border p-4 mb-3" style={{ borderColor: BORDER }}><div className="flex items-center gap-2 mb-3"><CreditCard size={16} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>Key Card Encoding</span></div><div className="flex items-center gap-1.5 mb-3 text-xs" style={{ color: SUCCESS }}><span className="w-2 h-2 rounded-full bg-green-500" />Encoder Connected (USB)</div>{!encoded ? <button onClick={() => { setEncoded(true); add({ type: "success", title: "Card encoded", body: `Room ${selRoom ?? "501"} · Valid until check-out` }); }} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>Encode Card</button> : <div className="flex items-center gap-2 text-sm" style={{ color: SUCCESS }}><CheckCircle2 size={16} />Card 1 encoded · Serial XXXX-XXXX</div>}</div>}
          {(credType === "pin" || credType === "both") && <div className="rounded-xl border p-4 mb-3" style={{ borderColor: BORDER }}><div className="flex items-center gap-2 mb-3"><Hash size={16} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>PIN Code</span></div>{!pinGen ? <button onClick={() => { setPinGen(true); add({ type: "success", title: "PIN generated", body: "Show to guest now" }); }} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>Generate PIN</button> : <div><div className="flex items-center gap-2 mb-3 text-sm" style={{ color: SUCCESS }}><CheckCircle2 size={16} />PIN generated and activated</div><div className="rounded-xl p-4 mb-2 text-center" style={{ backgroundColor: NAV_BG }}><div className="text-3xl font-bold tracking-[0.3em] text-white mb-1" style={{ fontFamily: mono }}>743812</div><div className="text-xs" style={{ color: SUBTLE }}>Valid until check-out</div></div><p className="text-xs mb-2" style={{ color: ERROR }}>⚠ Show to guest now. Cannot be retrieved after this screen.</p><div className="flex gap-2"><BtnO label="Copy PIN" icon={ClipboardList} /><BtnO label="Print" icon={FileText} /></div></div>}</div>}
          {(encoded || pinGen) && <div className="rounded-xl p-4" style={{ backgroundColor: "#F0FDF4", border: `1px solid #BBF7D0` }}><div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Access Summary</div>{encoded && <div className="flex items-center gap-2 text-sm" style={{ color: SUCCESS }}><CheckCircle2 size={14} />Key Card ×1 — active</div>}{pinGen && <div className="flex items-center gap-2 text-sm mt-1" style={{ color: SUCCESS }}><CheckCircle2 size={14} />PIN Code — activated</div>}</div>}
        </div>}
        <div className="flex items-center justify-between mt-8 pt-5 border-t" style={{ borderColor: "#F1F5F9" }}>
          <button onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-40" style={{ borderColor: BORDER, color: MUTED }}><ChevronLeft size={15} />Back</button>
          {step < 7 ? <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !selRes} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: PRIMARY }}>{step === 6 ? "Proceed to Access" : "Continue"}<ChevronRight size={15} /></button>
            : <button onClick={() => { add({ type: "success", title: "Check-in complete!", body: `${selData?.guest ?? "Guest"} checked in` }); setStep(1); setSelRes(null); setSelRoom(null); setEncoded(false); setPinGen(false); }} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: SUCCESS }}><CheckCircle2 size={15} />Complete Check-In</button>}
        </div>
      </div>
    </div>
  );
}

export function BackupRestore({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [confirmText, setConfirmText] = useState("");
  const snaps = [{ ts: "24 Jun 2025 23:00", size: "4.2 GB", type: "Scheduled", loc: "Local + Cloud" }, { ts: "23 Jun 2025 23:00", size: "4.1 GB", type: "Scheduled", loc: "Local + Cloud" }, { ts: "23 Jun 2025 12:30", size: "4.0 GB", type: "Manual", loc: "Local" }];
  return (
    <div>
      <PageHeader title="Backup & Restore" sub="Local server data backups · Grand Palms Abuja" actions={<BtnP label="Back Up Now" icon={RefreshCw} onClick={() => add({ type: "success", title: "Backup started", body: "Full backup running in background" })} />} />
      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}><h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Backup Settings</h3><Sel label="Frequency" options={["Every 6 hours", "Every 12 hours", "Daily at midnight"]} /><div className="mt-3 flex items-center justify-between py-2"><span className="text-sm" style={{ color: TEXT }}>Cloud backup enabled</span><div className="w-10 h-5 rounded-full" style={{ backgroundColor: TEAL }}><div className="w-4 h-4 bg-white rounded-full m-0.5 ml-5 shadow" /></div></div></div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}><h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Restore from Backup</h3><p className="text-xs mb-3" style={{ color: ERROR }}>⚠ Restore will overwrite all current data. This action cannot be undone.</p><Sel options={snaps.map(s => s.ts)} /><div className="mt-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Type RESTORE to confirm</label><input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="RESTORE" className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none mb-2 font-mono" style={{ borderColor: confirmText === "RESTORE" ? ERROR : BORDER }} /><button disabled={confirmText !== "RESTORE"} onClick={() => add({ type: "error", title: "Restore initiated", body: "Data restoration in progress" })} className="w-full py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: ERROR }}>Restore Database</button></div></div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Snapshot History</h3></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "Size", "Type", "Location", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{snaps.map((s, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm" style={{ color: TEXT, fontFamily: mono }}>{s.ts}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{s.size}</td><td className="px-5 py-3"><Badge label={s.type} colors={s.type === "Manual" ? { bg: "#EEF2FF", text: "#4338CA" } : { bg: "#DCFCE7", text: "#166534" }} /></td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{s.loc}</td><td className="px-5 py-3"><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Restore</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function AuditLog() {
  const logs = [
    { ts: "09:42:11", user: "John Abubakar", role: "FD", action: "Check-In", module: "Front Desk", record: "BK-2847 · Room 304", ip: "192.168.1.22" },
    { ts: "09:31:05", user: "Fatima Al-Hassan", role: "RSV", action: "Reservation Created", module: "Reservations", record: "BK-2848", ip: "192.168.1.31" },
    { ts: "09:15:30", user: "John Abubakar", role: "FD", action: "Check-Out", module: "Front Desk", record: "BK-2845 · Room 212", ip: "192.168.1.22" },
    { ts: "09:00:00", user: "Grace Mensah", role: "MGT", action: "Announcement Posted", module: "Communications", record: "Fire Drill Notice", ip: "192.168.1.10" },
    { ts: "08:58:12", user: "System", role: "—", action: "Work Order Created", module: "Maintenance", record: "WO-0091", ip: "192.168.1.1" },
    { ts: "08:44:20", user: "John Abubakar", role: "FD", action: "Access Credential Issued", module: "Door Lock", record: "Room 421 · Card", ip: "192.168.1.22" },
  ];
  return (
    <div>
      <PageHeader title="Audit Log" sub="Append-only record of all system events · No delete capability" actions={<><BtnO label="Export CSV" icon={Download} /><BtnO label="Export PDF" icon={FileText} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}><div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search by user, module, or record…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-56" style={{ borderColor: BORDER }} /></div><Sel options={["All Modules", "Front Desk", "Reservations", "Door Lock", "Finance", "System"]} /><input type="date" className="px-3 py-1.5 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }} defaultValue="2025-06-24" /></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "User", "Role", "Action", "Module", "Record", "IP"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{logs.map((l, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{l.ts}</td><td className="px-4 py-3 text-sm font-medium" style={{ color: TEXT }}>{l.user}</td><td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{l.role}</span></td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{l.action}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{l.module}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{l.record}</td><td className="px-4 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{l.ip}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function PlaceholderScreen({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return <div><PageHeader title={title} /><div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={Icon} message={desc} cta={`Open ${title}`} /></div></div>;
}

// ─── Router ──────────────────────────────────────────────────────────────────
// ─── NEW SCREENS ─────────────────────────────────────────────────────────────


const DEPARTURES_DATA = [
  { room: "101", guest: "Adaeze Okonkwo", checkout: "11:00", balance: 0, lateFlag: false, nights: 3, av: "AO" },
  { room: "202", guest: "Emmanuel Adeyemi", checkout: "11:00", balance: 45000, lateFlag: false, nights: 2, av: "EA" },
  { room: "203", guest: "Fatima Musa", checkout: "12:00", balance: 0, lateFlag: true, nights: 3, av: "FM" },
  { room: "118", guest: "Tunde Lawal", checkout: "10:00", balance: 18500, lateFlag: false, nights: 1, av: "TL" },
];











const MENU_ALL = [
  { id: 1, name: "Jollof Rice + Chicken", price: 4500, cat: "Mains", avail: true },
  { id: 2, name: "Egusi Soup + Pounded Yam", price: 5200, cat: "Mains", avail: true },
  { id: 3, name: "Grilled Fish", price: 6800, cat: "Mains", avail: true },
  { id: 4, name: "Fried Plantain", price: 1500, cat: "Sides", avail: true },
  { id: 5, name: "Moi Moi", price: 1200, cat: "Sides", avail: false },
  { id: 6, name: "Chapman", price: 2000, cat: "Drinks", avail: true },
  { id: 7, name: "Zobo", price: 1000, cat: "Drinks", avail: true },
  { id: 8, name: "Chocolate Cake", price: 3500, cat: "Desserts", avail: true },
  { id: 9, name: "Suya", price: 3000, cat: "Starters", avail: true },
  { id: 10, name: "Spring Rolls (6pc)", price: 2800, cat: "Starters", avail: true },
];




export function ArrivalsScreen({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All");
  const filtered = ARRIVALS_DATA.filter(a => {
    if (search && !a.guest.toLowerCase().includes(search.toLowerCase()) && !a.id.includes(search)) return false;
    if (tab === "VIP") return a.vip;
    if (tab === "Unassigned") return !a.assigned;
    if (tab === "Arrived") return false; // none arrived yet in demo
    return true;
  });
  return (
    <div>
      <PageHeader title="Arrivals List" sub={`${filtered.length} of ${ARRIVALS_DATA.length} arrivals today · 24 Jun 2025`} actions={<><BtnO label="Print List" icon={FileText} /><BtnP label="Quick Check-In" icon={KeyRound} onClick={() => nav && nav("check-in", "Check-In")} /></>} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b flex-wrap" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guest or reservation…" className="pl-7 pr-3 py-1.5 text-xs rounded-xl border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          {["All", "VIP", "Unassigned", "Arrived"].map(f => (
            <button key={f} onClick={() => setTab(f)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold transition-all"
              style={{ borderColor: tab === f ? PRIMARY : BORDER, backgroundColor: tab === f ? PRIMARY : "white", color: tab === f ? "white" : MUTED }}>
              {f}
              {f === "VIP" && <span className="ml-1 opacity-70">{ARRIVALS_DATA.filter(a => a.vip).length}</span>}
              {f === "Unassigned" && <span className="ml-1 opacity-70">{ARRIVALS_DATA.filter(a => !a.assigned).length}</span>}
            </button>
          ))}
          <span className="ml-auto text-xs" style={{ color: SUBTLE }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Guest", "Reservation", "Room", "ETA", "Nights", "Room Assigned", "Special Requests", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{ARRIVALS_DATA.map(a => (
            <tr key={a.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{a.av}</div><div><div className="flex items-center gap-1.5"><span className="text-sm font-medium" style={{ color: TEXT }}>{a.guest}</span>{a.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}</div></div></div></td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{a.id}</td>
              <td className="px-5 py-3 text-sm font-semibold" style={{ color: PRIMARY }}>{a.type}</td>
              <td className="px-5 py-3 text-sm font-mono" style={{ color: TEXT, fontFamily: mono }}>{a.eta}</td>
              <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{a.nights}n</td>
              <td className="px-5 py-3">{a.assigned ? <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Assigned</span> : <span className="text-xs font-medium" style={{ color: WARNING }}>Unassigned</span>}</td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, maxWidth: 160 }}><span className="line-clamp-1">{a.requests}</span></td>
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => nav ? nav("check-in", "Check-In") : add({ type: "success", title: "Check-in started", body: a.guest })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Check In</button><button className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><MoreHorizontal size={13} /></button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export function DeparturesScreen({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  return (
    <div>
      <PageHeader title="Departures List" sub={`${DEPARTURES_DATA.length} expected check-outs today · 24 Jun 2025`} actions={<><BtnO label="Print List" icon={FileText} /><BtnP label="Quick Check-Out" icon={ArrowRight} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "Checkout Time", "Balance Due", "Late Checkout", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{DEPARTURES_DATA.map(d => (
            <tr key={d.room} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{d.room}</td>
              <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{d.av}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{d.guest}</span></div></td>
              <td className="px-5 py-3 text-sm font-mono" style={{ color: TEXT, fontFamily: mono }}>{d.checkout}</td>
              <td className="px-5 py-3">{d.balance > 0 ? <span className="text-sm font-bold" style={{ color: ERROR }}>₦{d.balance.toLocaleString()}</span> : <span className="flex items-center gap-1 text-xs" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Settled</span>}</td>
              <td className="px-5 py-3">{d.lateFlag ? <Badge label="Late Checkout" colors={{ bg: "#FEF3C7", text: "#92400E" }} /> : <span style={{ color: SUBTLE }}>—</span>}</td>
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => nav ? nav("check-out", "Check-Out") : add({ type: "info", title: "Check-out initiated", body: `Room ${d.room} · ${d.guest}` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Check Out</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Extend</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export function RoomAccessMgmt({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [revokeRoom, setRevokeRoom] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  return (
    <div>
      <PageHeader title="Room Access Management" sub="All active access credentials across the property · Door Lock" actions={<BtnO label="Key Card Log" icon={ClipboardList} />} />
      <div className="space-y-3">
        {ACCESS_CREDS.map(r => (
          <div key={r.room} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="flex items-start justify-between mb-4">
              <div><div className="flex items-center gap-3"><span className="text-xl font-bold" style={{ color: TEXT }}>Room {r.room}</span><Badge label={r.status} colors={{ bg: "#DCFCE7", text: "#166534" }} /></div><div className="text-sm mt-0.5" style={{ color: MUTED }}>{r.guest} · Valid until {r.validTo}</div></div>
              <button onClick={() => setRevokeRoom(r.room)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90" style={{ backgroundColor: ERROR }}><Lock size={14} />Revoke All</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: "#F8FAFC" }}>
                <div className="flex items-center gap-2 mb-2"><CreditCard size={15} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>Key Cards ×{r.cards.length}</span></div>
                {r.cards.length === 0 ? <p className="text-xs" style={{ color: SUBTLE }}>No key cards issued</p> : r.cards.map((c, i) => <div key={i} className="flex items-center justify-between text-xs mb-1"><span style={{ color: MUTED, fontFamily: mono }}>{c.serial}</span><span style={{ color: SUBTLE }}>Issued {c.issued} by {c.by}</span></div>)}
                <button onClick={() => add({ type: "info", title: `Issue replacement card — Room ${r.room}` })} className="mt-2 text-xs font-medium flex items-center gap-1" style={{ color: TEAL }}><Plus size={11} />Issue Replacement Card</button>
              </div>
              <div className="rounded-xl p-4" style={{ backgroundColor: "#F8FAFC" }}>
                <div className="flex items-center gap-2 mb-2"><Hash size={15} style={{ color: PRIMARY }} /><span className="text-sm font-semibold" style={{ color: TEXT }}>PIN Code</span></div>
                {!r.pin ? <p className="text-xs" style={{ color: SUBTLE }}>No PIN issued</p> : <><div className="flex items-center justify-between text-xs mb-1"><span className="font-mono text-lg font-bold" style={{ color: TEXT, letterSpacing: "0.15em" }}>{r.pin.hint}</span><Badge label="Active" colors={{ bg: "#DCFCE7", text: "#166534" }} /></div><div className="text-xs" style={{ color: SUBTLE }}>Issued {r.pin.issued} by {r.pin.by}</div></>}
                <button onClick={() => add({ type: "info", title: `New PIN — Room ${r.room}` })} className="mt-2 text-xs font-medium flex items-center gap-1" style={{ color: TEAL }}><Plus size={11} />New PIN</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {revokeRoom && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: `1px solid ${BORDER}` }}>
            <h2 className="text-base font-bold mb-1" style={{ color: ERROR }}>🚨 Emergency Room Access Revocation</h2>
            <p className="text-sm mb-4" style={{ color: MUTED }}>Room {revokeRoom} — All active credentials will be deactivated immediately. Logged against your account.</p>
            <div className="space-y-2 mb-4">
              {["Security concern / suspected theft", "Guest dispute", "Incorrect room assigned", "Other"].map(r => <label key={r} className="flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer" style={{ borderColor: revokeReason === r ? ERROR : BORDER, backgroundColor: revokeReason === r ? "#FEF2F2" : "white" }}><div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{ borderColor: revokeReason === r ? ERROR : "#CBD5E1" }}>{revokeReason === r && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ERROR }} />}</div><input type="radio" className="hidden" onChange={() => setRevokeReason(r)} /><span className="text-sm" style={{ color: TEXT }}>{r}</span></label>)}
            </div>
            <p className="text-xs mb-4" style={{ color: ERROR }}>⚠ This action cannot be undone. All key cards and PINs will stop working immediately.</p>
            <div className="flex gap-3"><button onClick={() => setRevokeRoom(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button><button onClick={() => { add({ type: "error", title: `Emergency revoke — Room ${revokeRoom}`, body: "All credentials deactivated. Notification sent to all staff." }); setRevokeRoom(null); setRevokeReason(""); }} disabled={!revokeReason} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: ERROR }}>Confirm Emergency Revoke</button></div>
          </div>
        </>
      )}
    </div>
  );
}

export function KeyCardLog() {
  const evtC: Record<string, { bg: string; text: string }> = {
    "Issued": { bg: "#CCFBF1", text: "#0F766E" }, "PIN Issued": { bg: "#CCFBF1", text: "#0F766E" },
    "Duplicate Issued": { bg: "#DBEAFE", text: "#1E40AF" }, "Revoked — Checkout": { bg: "#F3F4F6", text: "#374151" },
    "Encode Failed": { bg: "#FEE2E2", text: "#991B1B" }, "Queued Offline": { bg: "#FEF3C7", text: "#92400E" },
  };
  return (
    <div>
      <PageHeader title="Key Card Log" sub="Append-only audit trail of every access credential event" actions={<><BtnO label="Export CSV" icon={Download} /><BtnO label="Export PDF" icon={FileText} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search room, guest, or staff…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-52" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Events", "Issued", "Revoked", "Failed", "Queued Offline"]} />
          <input type="date" defaultValue="2025-06-24" className="px-3 py-1.5 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }} />
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "Event Type", "Room", "Guest", "Credential", "Reference", "Staff", "API Response"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{KEY_LOG.map((l, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{l.ts}</td><td className="px-4 py-3"><Badge label={l.event} colors={evtC[l.event] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-4 py-3 text-sm font-bold" style={{ color: PRIMARY }}>{l.room}</td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{l.guest}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{l.type}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{l.ref}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{l.staff}</td><td className="px-4 py-3 text-xs" style={{ color: l.apiResp.startsWith("error") || l.apiResp.startsWith("queued") ? (l.apiResp.startsWith("error") ? ERROR : WARNING) : SUCCESS, fontFamily: mono }}>{l.apiResp}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function PINManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [showPIN, setShowPIN] = useState<string | null>(null);
  const pinStC: Record<string, { bg: string; text: string }> = {
    "Active": { bg: "#DCFCE7", text: "#166534" }, "Expiring": { bg: "#FEF3C7", text: "#92400E" }, "Expired": { bg: "#F3F4F6", text: "#374151" },
  };
  return (
    <div>
      <PageHeader title="PIN Management" sub="All active PINs across the property · Door Lock" actions={<BtnO label="Key Card Log" icon={ClipboardList} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "PIN (masked)", "Valid From", "Valid To", "Status", "Issued By", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{ACTIVE_PINS.map(p => (
            <tr key={p.room} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{p.room}</td>
              <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{p.guest}</td>
              <td className="px-5 py-3"><div className="flex items-center gap-2"><span className="text-lg font-bold" style={{ fontFamily: mono, color: TEXT, letterSpacing: "0.15em" }}>{showPIN === p.room ? "74 38 12" : p.hint}</span><button onClick={() => setShowPIN(showPIN === p.room ? null : p.room)} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>{showPIN === p.room ? "Hide" : "Reveal"}</button></div></td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{p.validFrom}</td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{p.validTo}</td>
              <td className="px-5 py-3">
                <div className="flex items-center gap-2"><Badge label={p.status} colors={pinStC[p.status] ?? { bg: "#F1F5F9", text: "#374151" }} />{p.status === "Expiring" && <span className="text-xs" style={{ color: WARNING }}>⚠ 2h left</span>}</div>
              </td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.by}</td>
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "success", title: `New PIN issued — Room ${p.room}` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: TEAL, borderColor: `${TEAL}30` }}>New PIN</button><button onClick={() => add({ type: "warning", title: `PIN revoked — Room ${p.room}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}30` }}>Revoke</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export function ShiftHandover({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [submitted, setSubmitted] = useState(false);
  const sections = ["Outstanding Tasks", "VIP Guests In-House", "Maintenance Issues Open", "Guest Complaints in Progress", "Pending Payments", "General Notes"];
  const defaults = [
    "Room 304 late checkout approved until 14:00. Inform Housekeeping.",
    "Dr. Chukwuemeka Bello (Suite 501) — VIP arrival expected 18:30. Champagne and fruit basket pre-positioned.",
    "AC unit in Room 316 (WO-0090) — Emeka working on it. SLA breached. Escalate if not resolved by 14:00.",
    "Room 310 guest complained about noise from Room 311. Spoken to both parties. Monitor.",
    "Emmanuel Adeyemi (Room 202) — ₦45,000 outstanding. Collect before departure or upon check-out.",
    "Housekeeping is short-staffed today — Chidi on leave. Rooms may run 30 min behind schedule.",
  ];
  return (
    <div>
      <PageHeader title="Shift Handover" sub="Morning Shift → Evening Shift · 24 Jun 2025 15:00" />
      {submitted ? (
        <div className="bg-white rounded-xl border p-10 text-center" style={{ borderColor: BORDER }}>
          <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: SUCCESS }} />
          <h2 className="text-base font-semibold mb-1" style={{ color: TEXT }}>Handover Submitted</h2>
          <p className="text-sm mb-4" style={{ color: MUTED }}>Awaiting acknowledgement from Evening Shift leader.</p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{ backgroundColor: "#FFFBEB", border: `1px solid #FDE68A` }}><Clock size={14} style={{ color: WARNING }} /><span className="text-sm font-medium" style={{ color: "#92400E" }}>Pending acknowledgement</span></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {sections.map((s, i) => (
              <div key={s} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: TEXT }}>{s}</h3>
                <textarea defaultValue={defaults[i]} className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} style={{ borderColor: BORDER, color: TEXT }} />
              </div>
            ))}
            <div className="flex gap-3">
              <button onClick={() => { setSubmitted(true); add({ type: "success", title: "Shift handover submitted", body: "Evening shift notified" }); }} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}><CheckCircle2 size={16} />Submit Handover</button>
              <BtnO label="Save Draft" />
            </div>
          </div>
          <div>
            <div className="bg-white rounded-xl border p-5 sticky top-4" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Shift Details</h3>
              {[["Outgoing Shift", "Morning · 07:00–15:00"], ["Outgoing Lead", "Grace Mensah"], ["Incoming Shift", "Evening · 15:00–23:00"], ["Incoming Lead", "David Okafor"], ["Date", "24 Jun 2025"], ["Time", "14:48"]].map(([k, v]) => <div key={k} className="flex justify-between text-sm mb-2"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Previous Handovers</div>
                {["Yesterday 15:00", "Yesterday 23:00", "23 Jun 07:00"].map(t => <button key={t} className="w-full flex items-center justify-between py-1.5 text-xs hover:text-[#0F172A]" style={{ color: MUTED }}><span>{t}</span><Eye size={12} /></button>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

      {/* Post to Room Folio Modal */}
      {showRoomPost && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowRoomPost(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>Post to Room Folio</h3>
            <p className="text-xs mb-4" style={{ color: "#64748B" }}>Charges will be added to the selected guest's folio and settled at check-out.</p>
            <div className="mb-4">
              <label className="text-xs font-bold uppercase tracking-wider block mb-2" style={{ color: "#64748B" }}>Select Room / Guest</label>
              <div className="space-y-2">
                {IN_HOUSE.map(g => (
                  <button key={g.room} onClick={() => setSelectedRoom(g.room)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all"
                    style={{ borderColor: selectedRoom === g.room ? "#123A73" : "#E2E8F0", backgroundColor: selectedRoom === g.room ? "#EFF6FF" : "white" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: "#123A73" }}>
                      {g.guest.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color: "#0D1B2E" }}>{g.guest}</div>
                      <div className="text-xs" style={{ color: "#64748B" }}>Room {g.room} · Checkout {g.checkout}</div>
                    </div>
                    {selectedRoom === g.room && <CheckCircle2 size={16} style={{ color: "#123A73" }} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-xl mb-4" style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0" }}>
              <div className="text-xs font-semibold mb-1" style={{ color: "#0D1B2E" }}>Order Summary</div>
              <div className="text-xs" style={{ color: "#64748B" }}>{order.reduce((s, o) => s + o.qty, 0)} items · Total ₦{(order.reduce((s, o) => s + o.price * o.qty, 0) * 1.075).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} incl. VAT</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRoomPost(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: "#64748B", borderColor: "#E2E8F0" }}>Cancel</button>
              <button onClick={() => {
                setShowRoomPost(false);
                setOrder([]);
                add({ type: "success", title: "Charge posted to Room " + selectedRoom, body: `${order.reduce((s, o) => s + o.qty, 0)} items · ${order.map(o => o.name).slice(0, 2).join(", ")}${order.length > 2 ? "..." : ""}` });
              }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#123A73" }}>
                Post to Folio
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function KitchenDisplay() {
  const [orders, setOrders] = useState(KDS_ORDERS.map(o => ({ ...o })));
  const [elapsed, setElapsed] = useState<Record<string, number>>(
    Object.fromEntries(KDS_ORDERS.map(o => [o.id, o.elapsed]))
  );
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v + 1])));
    }, 60000); // tick every minute
    return () => clearInterval(id);
  }, []);
  const ageC = (e: number) => e > 15 ? { bg: "#FEE2E2", border: ERROR, text: ERROR, label: "URGENT" } : e > 8 ? { bg: "#FEF3C7", border: WARNING, text: WARNING, label: "RUSH" } : { bg: "#DCFCE7", border: SUCCESS, text: SUCCESS, label: "NEW" };
  const bump = (id: string) => setOrders(prev => prev.filter(o => o.id !== id));
  return (
    <div>
      <PageHeader title="Kitchen Display Screen" sub="Live order queue · Auto-refreshing every 30s" actions={<div className="flex items-center gap-2 text-sm" style={{ color: MUTED }}><span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: SUCCESS }} />Live</div>} />
      {orders.length === 0 ? <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}><EmptyState icon={UtensilsCrossed} message="No active orders in queue." /></div> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {orders.map(o => {
            const liveElapsed = elapsed[o.id] ?? o.elapsed;
            const ac = ageC(liveElapsed);
            return (
              <div key={o.id} className="rounded-xl border-2 p-4 flex flex-col" style={{ backgroundColor: ac.bg, borderColor: ac.border }}>
                <div className="flex items-start justify-between mb-3">
                  <div><div className="text-lg font-bold" style={{ color: TEXT }}>{o.table}</div><div className="text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.id}</div></div>
                  <div className="text-right"><div className="text-2xl font-bold" style={{ color: ac.text, fontFamily: mono }}>{liveElapsed}m</div><span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: ac.border, color: "white" }}>{ac.label}</span></div>
                </div>
                <div className="flex-1 space-y-2 mb-4">
                  {o.items.map((item, i) => <div key={i} className="flex items-start gap-2"><div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2" style={{ borderColor: ac.border }} /><div><div className="text-sm font-medium" style={{ color: TEXT }}>{item.name}</div>{item.mod && <div className="text-xs italic" style={{ color: MUTED }}>{item.mod}</div>}</div></div>)}
                </div>
                <button onClick={() => bump(o.id)} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: ac.border }}>BUMP ✓</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MenuManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [activeCat, setActiveCat] = useState("Mains");
  const items = MENU_ALL.filter(i => i.cat === activeCat);
  return (
    <div>
      <PageHeader title="Menu Management" sub="Configure menu items, pricing, and availability" actions={<><BtnO label="Add Category" icon={Plus} /><BtnP label="Add Item" icon={Plus} /></>} />
      <div className="flex gap-4">
        <div className="w-44 flex-shrink-0 bg-white rounded-xl border p-2" style={{ borderColor: BORDER }}>
          {MENU_CATS.map(c => <button key={c} onClick={() => setActiveCat(c)} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-1" style={{ backgroundColor: activeCat === c ? PRIMARY : "transparent", color: activeCat === c ? "white" : MUTED }}>{c}<span className="ml-2 text-xs opacity-70">({MENU_ALL.filter(i => i.cat === c).length})</span></button>)}
        </div>
        <div className="flex-1 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>{activeCat}</h3><span className="text-xs" style={{ color: SUBTLE }}>{items.length} items</span></div>
          <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Name", "Price", "Available", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
            <tbody>{items.map(item => <tr key={item.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-4 text-sm font-medium" style={{ color: TEXT }}>{item.name}</td><td className="px-5 py-4 text-sm font-semibold" style={{ color: PRIMARY }}>₦{item.price.toLocaleString()}</td><td className="px-5 py-4"><label className="cursor-pointer"><div className="w-10 h-5 rounded-full relative" style={{ backgroundColor: item.avail ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow" style={{ left: item.avail ? 22 : 2 }} /></div></label></td><td className="px-5 py-4"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Edit: ${item.name}` })} className="w-7 h-7 rounded flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: MUTED }}><Edit3 size={13} /></button><button className="text-xs px-2 py-1 rounded border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>86'd</button></div></td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function LostFound({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { Held: { bg: "#FEF3C7", text: "#92400E" }, Claimed: { bg: "#DCFCE7", text: "#166534" }, Disposed: { bg: "#F3F4F6", text: "#374151" } };
  return (
    <div>
      <PageHeader title="Lost & Found" sub={`${LOST_FOUND.length} items logged · ${LOST_FOUND.filter(i => i.status === "Held").length} currently held`} actions={<BtnP label="Log New Item" icon={Plus} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          {["All", "Held", "Claimed", "Disposed"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "All" ? PRIMARY : BORDER, backgroundColor: f === "All" ? PRIMARY : "white", color: f === "All" ? "white" : MUTED }}>{f}</button>)}
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Item ID", "Description", "Location Found", "Date", "Logged By", "Claimed By", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{LOST_FOUND.map(item => <tr key={item.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs font-mono" style={{ color: MUTED, fontFamily: mono }}>{item.id}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{item.desc}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{item.location}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.date}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.loggedBy}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{item.claimedBy}</td><td className="px-5 py-3"><Badge label={item.status} colors={stC[item.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "success", title: `${item.id} marked claimed` })} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Claim</button><button className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Dispose</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function DNDLog({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Do Not Disturb Log" sub="DND tracking with wellness check escalation" />
      <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "#FEF2F2", border: `1px solid #FECACA` }}>
        <AlertTriangle size={16} style={{ color: ERROR, marginTop: 1 }} /><div><div className="text-sm font-semibold" style={{ color: ERROR }}>2 rooms flagged — DND exceeds 12 hours</div><div className="text-xs mt-0.5" style={{ color: "#991B1B" }}>Rooms 315 and 410 require wellness check. No response from 315 on first attempt.</div></div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "DND Start", "Duration", "Expected Checkout", "Wellness Check", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{DND_ROOMS.map(r => <tr key={r.room} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9", backgroundColor: r.flag ? "#FFF5F5" : "white" }}><td className="px-5 py-3 font-bold text-lg" style={{ color: r.flag ? ERROR : PRIMARY }}>{r.room}{r.flag && " ⚠"}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{r.guest}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{r.dndStart}</td><td className="px-5 py-3"><span className="text-sm font-bold" style={{ color: r.flag ? ERROR : TEXT }}>{r.hours}h</span></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkout}</td><td className="px-5 py-3 text-xs" style={{ color: r.wellness !== "—" ? WARNING : SUBTLE }}>{r.wellness}</td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Wellness check logged — Room ${r.room}` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Log Check</button><button onClick={() => add({ type: "warning", title: `DND overridden — Room ${r.room}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}30` }}>Override DND</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function InvoiceReceipts({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { Paid: { bg: "#DCFCE7", text: "#166534" }, Outstanding: { bg: "#FEF3C7", text: "#92400E" }, Refunded: { bg: "#EEF2FF", text: "#4338CA" }, Cancelled: { bg: "#F3F4F6", text: "#374151" } };
  return (
    <div>
      <PageHeader title="Invoice & Receipts" sub="All guest invoices and receipts" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Create Invoice" icon={Plus} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Invoiced", v: "₦687,100", c: TEXT }, { l: "Paid", v: "₦220,000", c: SUCCESS }, { l: "Outstanding", v: "₦467,100", c: ERROR }, { l: "Refunded", v: "₦55,000", c: "#6366F1" }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search invoice, guest…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} /></div>
          {["All", "Paid", "Outstanding", "Refunded"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "All" ? PRIMARY : BORDER, backgroundColor: f === "All" ? PRIMARY : "white", color: f === "All" ? "white" : MUTED }}>{f}</button>)}
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Invoice #", "Guest", "Room", "Date", "Amount", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{INVOICES_DATA.map(inv => <tr key={inv.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{inv.id}</td><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{inv.av}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{inv.guest}</span></div></td><td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>{inv.room}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{inv.date}</td><td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>₦{inv.amount.toLocaleString()}</td><td className="px-5 py-3"><Badge label={inv.status} colors={stC[inv.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button><button onClick={() => add({ type: "success", title: `Invoice ${inv.id} sent` })} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Send</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function AccountsPayable({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { Unpaid: { bg: "#FEF3C7", text: "#92400E" }, Overdue: { bg: "#FEE2E2", text: "#991B1B" }, Paid: { bg: "#DCFCE7", text: "#166534" } };
  const total = AP_DATA.filter(a => a.status !== "Paid").reduce((s, a) => s + a.amount, 0);
  return (
    <div>
      <PageHeader title="Accounts Payable" sub="Vendor invoices and payment scheduling" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Add Vendor Invoice" icon={Plus} /></>} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Total Outstanding", v: `₦${total.toLocaleString()}`, c: ERROR }, { l: "Overdue", v: `₦${AP_DATA.filter(a => a.status === "Overdue").reduce((s, a) => s + a.amount, 0).toLocaleString()}`, c: ERROR }, { l: "Due This Week", v: "₦227,000", c: WARNING }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Vendor", "Invoice #", "Invoice Date", "Due Date", "Amount", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{AP_DATA.map((a, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{a.vendor}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{a.invoice}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{a.date} Jun</td><td className="px-5 py-3 text-xs" style={{ color: a.status === "Overdue" ? ERROR : MUTED }}>{a.due} Jun</td><td className="px-5 py-3 text-sm font-semibold" style={{ color: TEXT }}>₦{a.amount.toLocaleString()}</td><td className="px-5 py-3"><Badge label={a.status} colors={stC[a.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "success", title: `Payment recorded — ${a.vendor}` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Mark Paid</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Schedule</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function RevenueReports() {
  return (
    <div>
      <PageHeader title="Revenue Reports" sub="Grand Palms Hotel, Abuja · Year to date 2025" actions={<><BtnO label="Export Excel" icon={Download} /><BtnO label="Export PDF" icon={FileText} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Revenue (YTD)", v: "₦6.85M", d: "+18.4% vs 2024", up: true }, { l: "ADR", v: "₦55,417", d: "+₦4,200 vs last month", up: true }, { l: "RevPAR", v: "₦48,767", d: "+12.1% vs last month", up: true }, { l: "GOP %", v: "62.4%", d: "+3.2pp vs last month", up: true }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{s.v}</div><div className="text-xs uppercase tracking-wider mb-1" style={{ color: MUTED }}>{s.l}</div><div className={`flex items-center gap-1 text-xs ${s.up ? "text-green-600" : "text-red-500"}`}>{s.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{s.d}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue by Category — Monthly (₦K)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={REV_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`₦${v}K`]} />
              <Bar key="bar-rooms" dataKey="rooms" name="Rooms" fill={PRIMARY} stackId="a" />
              <Bar key="bar-fb" dataKey="fb" name="F&B" fill={TEAL} stackId="a" />
              <Bar key="bar-events" dataKey="events" name="Events" fill={ORANGE} stackId="a" />
              <Bar key="bar-other" dataKey="other" name="Other" fill={SUBTLE} radius={[4, 4, 0, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue vs. Target (₦K)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={REV_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`₦${v}K`]} />
              <Area key="area-rev-rpt" type="monotone" dataKey="rooms" name="Total Revenue" stroke={PRIMARY} strokeWidth={2} fill={PRIMARY + "20"} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function RolesPermissions({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [activeRole, setActiveRole] = useState("Front Desk");
  const roles = Object.keys(DEPT_PERMS);
  const perms = DEPT_PERMS[activeRole] ?? [];
  const ALL_PERMS = Array.from(new Set(Object.values(DEPT_PERMS).flat()));
  return (
    <div>
      <PageHeader title="Roles & Permissions" sub="Module-level permission matrix per role" actions={<BtnP label="Create Custom Role" icon={Plus} />} />
      <div className="flex gap-4">
        <div className="w-48 flex-shrink-0 bg-white rounded-xl border p-2" style={{ borderColor: BORDER }}>
          {roles.map(r => <button key={r} onClick={() => setActiveRole(r)} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-colors" style={{ backgroundColor: activeRole === r ? PRIMARY : "transparent", color: activeRole === r ? "white" : MUTED }}>{r}</button>)}
        </div>
        <div className="flex-1 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>{activeRole} — Permission Matrix</h3><button onClick={() => add({ type: "success", title: "Permissions saved" })} className="text-xs font-medium px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: PRIMARY }}>Save Changes</button></div>
          <div className="p-4 space-y-1">
            {ALL_PERMS.map(p => {
              const enabled = perms.includes(p) || perms.includes("All Modules");
              return (
                <div key={p} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[#F8FAFC]">
                  <span className="text-sm" style={{ color: TEXT }}>{p}</span>
                  <label className="cursor-pointer"><div className="w-10 h-5 rounded-full relative transition-colors" style={{ backgroundColor: enabled ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: enabled ? 22 : 2 }} /></div></label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AttendanceScreen() {
  const days = ["Mon 23", "Tue 24", "Wed 25", "Thu 26", "Fri 27"];
  const stC: Record<string, { bg: string; text: string }> = { P: { bg: "#DCFCE7", text: "#166534" }, A: { bg: "#FEE2E2", text: "#991B1B" }, L: { bg: "#FEF3C7", text: "#92400E" } };
  const fullLabel: Record<string, string> = { P: "Present", A: "Absent", L: "On Leave" };
  return (
    <div>
      <PageHeader title="Attendance" sub="Week of 23–27 Jun 2025 · Grand Palms Abuja Branch" actions={<><BtnO label="Export" icon={Download} /><BtnO label="Approve Leave" icon={CheckCircle2} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Staff Member</th><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Department</th>{days.map(d => <th key={d} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{d}</th>)}<th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Days Present</th></tr></thead>
          <tbody>{ATTEND_DATA.map(s => <tr key={s.name} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{s.name}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{s.dept}</span></td>{s.days.map((d, i) => <td key={i} className="px-4 py-3 text-center"><span title={fullLabel[d]} className="inline-flex w-8 h-8 rounded-lg items-center justify-center text-xs font-bold" style={stC[d] ?? { bg: "#F3F4F6", text: "#374151" }}>{d}</span></td>)}<td className="px-5 py-3 text-center font-bold text-sm" style={{ color: TEXT }}>{s.days.filter(d => d === "P").length}/5</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function ShiftScheduler({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const staff = ["John Abubakar", "Amaka Osei", "Emeka Nwosu", "Fatima Al-Hassan", "Ngozi Ike", "Bola Adewale"];
  const days = ["Mon 23", "Tue 24", "Wed 25", "Thu 26", "Fri 27", "Sat 28", "Sun 29"];
  const shiftMap: Record<string, Record<string, string>> = {
    "John Abubakar": { "Mon 23": "Morning", "Tue 24": "Morning", "Wed 25": "Evening", "Thu 26": "Morning", "Fri 27": "Morning", "Sat 28": "Off", "Sun 29": "Off" },
    "Amaka Osei": { "Mon 23": "Morning", "Tue 24": "Morning", "Wed 25": "Morning", "Thu 26": "Off", "Fri 27": "Morning", "Sat 28": "Morning", "Sun 29": "Off" },
    "Emeka Nwosu": { "Mon 23": "Morning", "Tue 24": "Morning", "Wed 25": "Off", "Thu 26": "Off", "Fri 27": "Morning", "Sat 28": "Morning", "Sun 29": "Morning" },
    "Fatima Al-Hassan": { "Mon 23": "Morning", "Tue 24": "Morning", "Wed 25": "Morning", "Thu 26": "Morning", "Fri 27": "Morning", "Sat 28": "Off", "Sun 29": "Off" },
    "Ngozi Ike": { "Mon 23": "Evening", "Tue 24": "Evening", "Wed 25": "Morning", "Thu 26": "Morning", "Fri 27": "Off", "Sat 28": "Morning", "Sun 29": "Morning" },
    "Bola Adewale": { "Mon 23": "Morning", "Tue 24": "Morning", "Wed 25": "Morning", "Thu 26": "Morning", "Fri 27": "Morning", "Sat 28": "Off", "Sun 29": "Off" },
  };
  const shiftC: Record<string, { bg: string; text: string }> = { Morning: { bg: "#DCFCE7", text: "#166534" }, Evening: { bg: "#DBEAFE", text: "#1E40AF" }, Night: { bg: "#EDE9FE", text: "#6D28D9" }, Off: { bg: "#F3F4F6", text: "#6B7280" } };
  return (
    <div>
      <PageHeader title="Shift Scheduler" sub="Week of 23–29 Jun 2025" actions={<><BtnO label="Clone Last Week" icon={RefreshCw} /><BtnP label="Publish Schedule" icon={Send} onClick={() => add({ type: "success", title: "Schedule published", body: "All staff notified" })} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex" style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: "#F8FAFC" }}>
          <div className="w-44 flex-shrink-0 px-5 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Staff</div>
          {days.map(d => <div key={d} className="flex-1 text-center py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED, minWidth: 80 }}>{d}</div>)}
        </div>
        {staff.map(s => <div key={s} className="flex items-center border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9", minHeight: 52 }}><div className="w-44 flex-shrink-0 px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{s.split(" ")[0]}</div>{days.map(d => { const shift = shiftMap[s]?.[d] ?? "Off"; const c = shiftC[shift]; return <div key={d} className="flex-1 flex justify-center py-2" style={{ minWidth: 80 }}><span className="px-2 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: c.bg, color: c.text }}>{shift}</span></div>; })}</div>)}
        <div className="px-5 py-3 border-t flex gap-4 text-xs" style={{ borderColor: "#F1F5F9", color: MUTED }}>{Object.entries(shiftC).map(([s, c]) => <span key={s} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: c.bg, border: `1px solid ${c.text}30` }} />{s}</span>)}</div>
      </div>
    </div>
  );
}

export function CentralSyncStatus({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const syncC: Record<string, string> = { synced: SUCCESS, pending: WARNING, error: ERROR };
  return (
    <div>
      <PageHeader title="Central Sync Status" sub="Branch-by-branch sync health · Central server" actions={<BtnP label="Force Sync All" icon={RefreshCw} onClick={() => add({ type: "info", title: "Sync triggered for all branches" })} />} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Branches Online", v: "3/3", c: SUCCESS }, { l: "Pending Items", v: "5", c: WARNING }, { l: "Last Full Sync", v: "47m ago", c: TEXT }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Branch Sync Status</h3></div>
        {SYNC_BRANCHES.map(b => (
          <div key={b.name} className="flex items-center gap-4 px-5 py-4 border-b hover:bg-[#FAFBFD]" style={{ borderColor: "#F8FAFC" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: b.status === "synced" ? "#DCFCE7" : "#FEF3C7" }}>
              <RefreshCw size={16} style={{ color: syncC[b.status] }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: TEXT }}>{b.name}</div>
              <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>IP: <span style={{ fontFamily: mono }}>{b.ip}</span> · Last sync: {b.lastSync}</div>
            </div>
            <div className="text-right">
              {b.pending > 0 ? <div className="text-sm font-bold" style={{ color: WARNING }}>{b.pending} pending</div> : <div className="text-sm font-semibold" style={{ color: SUCCESS }}>All synced</div>}
              <div className="text-xs" style={{ color: SUBTLE }}>{b.items} items</div>
            </div>
            <Badge label={b.status === "synced" ? "Synced" : "Pending"} colors={b.status === "synced" ? { bg: "#DCFCE7", text: "#166534" } : { bg: "#FEF3C7", text: "#92400E" }} />
            <button onClick={() => add({ type: "info", title: `Force sync — ${b.name}` })} className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Force Sync</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UserManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="User Management" sub="All branch user accounts · Grand Palms Abuja Branch" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Invite New User" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative flex-1 max-w-xs"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search by name or email…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-full" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Roles", "MGT", "FD", "HK", "MX", "FIN", "RSV"]} />
          <Sel options={["All Status", "Active", "Inactive"]} />
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["User", "Email", "Role", "Department", "Status", "Last Login", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{USERS_DATA.map(u => <tr key={u.email} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{u.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{u.name}</span></div></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{u.email}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{u.role}</span></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{u.dept}</td><td className="px-5 py-3"><Badge label={u.status} colors={{ bg: "#DCFCE7", text: "#166534" }} /></td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{u.lastLogin}</td><td className="px-5 py-3"><div className="flex gap-1"><button className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Edit</button><button onClick={() => add({ type: "info", title: `Password reset sent to ${u.name}` })} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Reset PW</button><button className="text-xs px-2 py-1 rounded border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Deactivate</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function DoorLockSettings({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [enabled, setEnabled] = useState(true);
  const [tested, setTested] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const rooms = [{ room: "101", lockId: "LK-001A", name: "Room 101" }, { room: "102", lockId: "LK-002A", name: "Room 102" }, { room: "201", lockId: "LK-001B", name: "Room 201" }, { room: "301", lockId: "LK-001C", name: "Room 301" }];
  return (
    <div>
      <PageHeader title="Door Lock Integration" sub="TTLock Cloud API configuration · Grand Palms Abuja Branch" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Master Enable</h3>
            <label className="cursor-pointer flex items-center gap-2"><span className="text-sm" style={{ color: MUTED }}>Door Lock Module</span><div onClick={() => setEnabled(p => !p)} className="w-12 h-6 rounded-full relative cursor-pointer" style={{ backgroundColor: enabled ? TEAL : "#CBD5E1" }}><div className="absolute w-5 h-5 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: enabled ? 26 : 2 }} /></div></label>
          </div>
          {!enabled && <div className="text-xs p-2 rounded-lg" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>⚠ Door Lock module disabled. Step 7 hidden in check-in wizard. All door lock screens hidden from sidebar.</div>}
          <div className="mt-4"><Sel label="Lock Provider" options={["TTLock Cloud API", "ZKTeco (coming soon)", "Dormakaba (coming soon)"]} /></div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>TTLock API Credentials</h3>
          <div className="space-y-3">
            <Inp label="Client ID" defaultValue="ttlock_client_gp_abuja_001" />
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Client Secret</label><div className="relative"><input type="password" defaultValue="sk_live_xxxxxxxxxxxxx" className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none pr-16" style={{ borderColor: BORDER }} /><button className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: TEAL }}>Show</button></div></div>
            <Inp label="Username" defaultValue="grandpalms_abuja@ttlock.com" />
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Password</label><input type="password" defaultValue="••••••••••" className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={() => { setTested("testing"); setTimeout(() => setTested("ok"), 1800); }} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>
              {tested === "testing" ? <span className="animate-spin">↻</span> : <Wifi size={14} />}Test Connection
            </button>
            {tested === "ok" && <span className="text-xs font-medium flex items-center gap-1" style={{ color: SUCCESS }}><CheckCircle2 size={13} />Connected · 12 locks found</span>}
            {tested === "fail" && <span className="text-xs font-medium" style={{ color: ERROR }}>Connection failed — check credentials</span>}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden mb-5" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Room → Lock Mapping</h3><BtnO label="Auto-Map by Name" icon={RefreshCw} /></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "TTLock Lock ID", "Lock Name", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{rooms.map(r => <tr key={r.room} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>Room {r.room}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{r.lockId}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{r.name}</td><td className="px-5 py-3"><button className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Edit</button></td></tr>)}</tbody>
        </table>
      </div>
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Integration Settings</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[{ l: "Auto-revoke access on check-out", on: true }, { l: "Queue commands when offline", on: true }, { l: "Notify MGT on offline revoke", on: true }, { l: "Encode 2nd card automatically", on: false }].map(s => <div key={s.l} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: TEXT }}>{s.l}</span><div className="w-10 h-5 rounded-full relative" style={{ backgroundColor: s.on ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow" style={{ left: s.on ? 22 : 2 }} /></div></div>)}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Max cards per check-in</label><input defaultValue="3" type="number" className="w-full px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Queue expiry buffer (hours)</label><input defaultValue="1" type="number" className="w-full px-3 py-2 border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
        </div>
        <div className="mt-4"><BtnP label="Save Settings" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Door lock settings saved" })} /></div>
      </div>
    </div>
  );
}

// ─── BATCH 3 SCREENS ──────────────────────────────────────────────────────────










// R-07 Reservation Search
export function ReservationSearch({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const [q, setQ] = useState("");
  const filtered = q ? ALL_RES.filter(r => r.guest.toLowerCase().includes(q.toLowerCase()) || r.id.toLowerCase().includes(q)) : ALL_RES;
  return (
    <div>
      <PageHeader title="Reservation Search" sub="Search all reservations by guest, ID, room, date, or status" actions={<BtnP label="New Reservation" icon={Plus} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 p-4 border-b" style={{ borderColor: BORDER, backgroundColor: "#F8FAFC" }}>
          <div className="lg:col-span-2 relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Guest name, reservation ID, or room…" className="pl-9 pr-4 py-2.5 w-full border rounded-lg text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Status", "Confirmed", "Checked In", "Checked Out", "No Show", "Cancelled"]} />
          <Inp label="" type="date" defaultValue="2025-06-24" placeholder="Check-in from" />
          <Inp label="" type="date" defaultValue="2025-06-30" placeholder="Check-in to" />
        </div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Reservation ID", "Guest", "Room", "Check-in", "Check-out", "Nights", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map(r => <tr key={r.id} className="border-t hover:bg-[#FAFBFD] cursor-pointer" style={{ borderColor: "#F1F5F9" }}>
            <td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{r.id}</td>
            <td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{r.guest.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{r.guest}</span></div></td>
            <td className="px-5 py-3 font-bold" style={{ color: PRIMARY }}>Room {r.room}</td>
            <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkin}</td>
            <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{r.checkout}</td>
            <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{r.nights}n</td>
            <td className="px-5 py-3"><Badge label={r.status} colors={resStC[r.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td>
            <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => nav && nav("reservation-detail", r.id)} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>View</button>{r.status === "Confirmed" && <button onClick={() => nav ? nav("check-in", "Check-In") : add({ type: "success", title: "Check-in started", body: r.guest })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Check In</button>}</div></td>
          </tr>)}</tbody>
        </table>
        {filtered.length === 0 && <EmptyState icon={Search} message="No reservations match your search." />}
      </div>
    </div>
  );
}

// R-03 Reservation Detail
export function ReservationDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Folio", "History", "Notes"];
  const res = ALL_RES[0];
  return (
    <div>
      <PageHeader title={`Reservation ${res.id}`} sub={`${res.guest} · Room ${res.room} ${res.type}`}
        actions={<><BtnO label="Modify" icon={Edit3} /><BtnO label="Cancel" /><BtnP label="Check In" icon={KeyRound} onClick={() => add({ type: "success", title: "Check-in started", body: res.guest })} /></>} />
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
              <div><textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} placeholder="Add an internal note…" style={{ borderColor: BORDER }} /><div className="mt-2"><BtnP label="Add Note" icon={Plus} onClick={() => add({ type: "success", title: "Note added" })} /></div></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// FD-03 Room Assignment Board
export function RoomAssignmentBoard({ add, nav }: { add: (t: Omit<Toast, "id">) => void; nav?: (s: string, label: string) => void }) {
  const unassigned = ARRIVALS_DATA.filter(a => !a.assigned);
  const available = ROOMS.filter(r => r.status === "Available");
  const [sel, setSel] = useState<string | null>(null);
  const [selRoom, setSelRoom] = useState<string | null>(null);
  return (
    <div>
      <PageHeader title="Room Assignment Board" sub="Assign unassigned arrivals to available rooms" actions={<BtnP label="Auto-Assign All" icon={Zap} onClick={() => add({ type: "success", title: "Auto-assigned 2 arrivals" })} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Unassigned Arrivals ({unassigned.length})</h3><p className="text-xs mt-0.5" style={{ color: MUTED }}>Select an arrival, then a room to assign</p></div>
          <div className="divide-y" style={{ borderColor: "#F1F5F9" }}>{unassigned.map(a => <div key={a.id} onClick={() => setSel(a.id)} className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[#F8FAFC] transition-colors" style={{ backgroundColor: sel === a.id ? "#EFF6FF" : "white", borderLeft: sel === a.id ? `3px solid ${PRIMARY}` : "3px solid transparent" }}><div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>{a.av}</div><div className="flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium" style={{ color: TEXT }}>{a.guest}</span>{a.vip && <Star size={12} fill={ORANGE} style={{ color: ORANGE }} />}</div><div className="text-xs" style={{ color: MUTED }}>{a.type} · ETA {a.eta}</div></div>{sel === a.id && <CheckCircle2 size={16} style={{ color: PRIMARY }} />}</div>)}</div>
          {unassigned.length === 0 && <EmptyState icon={CheckCircle2} message="All arrivals are assigned." />}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9", backgroundColor: "#F8FAFC" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Available Rooms ({available.length})</h3></div>
          <div className="grid grid-cols-3 gap-2 p-4">{available.map(r => <div key={r.id} onClick={() => setSelRoom(r.id)} className="p-3 rounded-xl border-2 cursor-pointer text-center transition-all" style={{ borderColor: selRoom === r.id ? PRIMARY : BORDER, backgroundColor: selRoom === r.id ? "#EFF6FF" : "white" }}><div className="text-lg font-bold" style={{ color: TEXT }}>{r.id}</div><div className="text-xs" style={{ color: MUTED }}>{r.type}</div><div className="text-xs" style={{ color: SUBTLE }}>Floor {r.floor}</div></div>)}</div>
          {sel && selRoom && (
            <div className="px-5 pb-5"><div className="p-3 rounded-xl mb-3" style={{ backgroundColor: "#F0FDF4", border: `1px solid #BBF7D0` }}><div className="text-xs font-semibold" style={{ color: SUCCESS }}>Assignment Preview</div><div className="text-sm mt-1" style={{ color: TEXT }}>{ARRIVALS_DATA.find(a => a.id === sel)?.guest} → Room {selRoom}</div></div><BtnP label="Confirm Assignment" icon={CheckCircle2} onClick={() => { add({ type: "success", title: "Room assigned", body: `Room ${selRoom} → ${ARRIVALS_DATA.find(a => a.id === sel)?.guest}` }); setSel(null); setSelRoom(null); }} /></div>
          )}
        </div>
      </div>
    </div>
  );
}

// FD-05 Guest Profile Detail
export function GuestProfileDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Stay History", "Preferences", "Folios", "Complaints & Feedback"];
  return (
    <div>
      <PageHeader title="Guest Profile — Dr. Chukwuemeka Bello" sub="G-002 · VIP · 15 stays"
        actions={<><BtnO label="Create Reservation" icon={Plus} /><BtnP label="Edit Profile" icon={Edit3} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="text-center mb-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-2" style={{ backgroundColor: PRIMARY }}>CB</div>
            <div className="flex items-center justify-center gap-1 mb-1"><span className="text-base font-bold" style={{ color: TEXT }}>Dr. Chukwuemeka Bello</span></div>
            <Star size={14} fill={ORANGE} style={{ color: ORANGE, display: "inline" }} /><span className="text-xs ml-1" style={{ color: MUTED }}>VIP Guest</span>
          </div>
          <div className="space-y-2 text-xs border-t pt-3" style={{ borderColor: "#F1F5F9" }}>
            {[["Phone", "+234 803 555 6666"], ["Email", "c.bello@example.com"], ["ID", "Passport A12345678"], ["Nationality", "Nigerian"], ["Member Since", "March 2020"]].map(([k, v]) => <div key={k} className="flex flex-col"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t text-center" style={{ borderColor: "#F1F5F9" }}>
            <div><div className="text-xl font-bold" style={{ color: PRIMARY }}>15</div><div className="text-xs" style={{ color: MUTED }}>Total Stays</div></div>
            <div><div className="text-xl font-bold" style={{ color: PRIMARY }}>₦2.4M</div><div className="text-xs" style={{ color: MUTED }}>Lifetime Value</div></div>
          </div>
        </div>
        {/* Main */}
        <div className="lg:col-span-3 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b" style={{ borderColor: BORDER }}>
            {tabs.map(t => <button key={t} onClick={() => setTab(t)} className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: tab === t ? PRIMARY : MUTED, borderBottom: tab === t ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{t}</button>)}
          </div>
          <div className="p-5">
            {tab === "Overview" && <div className="space-y-4"><div className="p-4 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Current Stay</div><div className="text-sm" style={{ color: MUTED }}>BK-2849 · Suite 501 · 24–27 Jun 2025 · Confirmed, arriving today</div></div><div><div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Internal Notes</div><p className="text-sm" style={{ color: MUTED }}>VIP — always request champagne and fruit basket on arrival. Prefers high floors. Regular monthly business traveller. Never disturb before 10:00.</p></div></div>}
            {tab === "Stay History" && <div className="space-y-2">{[{ id: "BK-2849", dates: "24–27 Jun 2025", room: "Suite 501", total: "₦273,375", status: "Confirmed" }, { id: "BK-2741", dates: "15–18 May 2025", room: "Suite 501", total: "₦273,375", status: "Checked Out" }, { id: "BK-2630", dates: "8–10 Apr 2025", room: "Suite 502", total: "₦182,250", status: "Checked Out" }].map(s => <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div className="flex-1"><div className="text-sm font-medium" style={{ color: TEXT }}>{s.dates}</div><div className="text-xs" style={{ color: MUTED }}>{s.room} · <span style={{ fontFamily: mono }}>{s.id}</span></div></div><div className="text-sm font-bold" style={{ color: TEXT }}>{s.total}</div><Badge label={s.status} colors={resStC[s.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></div>)}</div>}
            {tab === "Preferences" && <div className="grid grid-cols-2 gap-3">{[["Room Type", "Suite — top floor"], ["Pillow Type", "Firm"], ["Wake-up Call", "07:30"], ["Newspaper", "The Punch"], ["Dietary", "No shellfish"], ["Temperature", "20°C"], ["Minibar", "Stock with whisky"], ["Amenities", "Extra towels × 4"]].map(([k, v]) => <div key={k} className="p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div className="text-xs" style={{ color: MUTED }}>{k}</div><div className="text-sm font-medium mt-0.5" style={{ color: TEXT }}>{v}</div></div>)}</div>}
            {tab === "Folios" && <div className="text-sm" style={{ color: MUTED }}><p>No closed folios for current period. Previous folios archived.</p></div>}
            {tab === "Complaints & Feedback" && <EmptyState icon={CheckCircle2} message="No complaints or feedback on record. Excellent guest history." />}
          </div>
        </div>
      </div>
    </div>
  );
}

// FD-11 Walk-In Registration
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

// HK-04 Inspection Log
export function InspectionLog({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const logs = [
    { room: "104", inspector: "Grace Mensah", ts: "Today 09:45", result: "Pass", score: "18/20", issues: "Minor dust on top shelf", status: "Passed" },
    { room: "102", inspector: "Grace Mensah", ts: "Today 09:30", result: "Fail", score: "12/20", issues: "Bathroom not cleaned thoroughly, bed linen stained", status: "Re-assigned" },
    { room: "301", inspector: "David Okafor", ts: "Yesterday 16:00", result: "Pass", score: "20/20", issues: "None", status: "Passed" },
    { room: "203", inspector: "Grace Mensah", ts: "Yesterday 14:30", result: "Pass", score: "17/20", issues: "Minibar not restocked", status: "Passed" },
  ];
  const iC: Record<string, { bg: string; text: string }> = { Passed: { bg: "#DCFCE7", text: "#166534" }, "Re-assigned": { bg: "#FEE2E2", text: "#991B1B" } };
  return (
    <div>
      <PageHeader title="Inspection Log" sub="Supervisor inspections of cleaned rooms" actions={<BtnP label="New Inspection" icon={Plus} />} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Passed Today", v: "3", c: SUCCESS }, { l: "Failed Today", v: "1", c: ERROR }, { l: "Pass Rate", v: "75%", c: PRIMARY }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Inspector", "Time", "Score", "Issues Found", "Result", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{logs.map((l, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{l.room}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{l.inspector}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{l.ts}</td><td className="px-5 py-3 text-sm font-bold" style={{ color: l.result === "Pass" ? SUCCESS : ERROR }}>{l.score}</td><td className="px-5 py-3 text-xs max-w-40" style={{ color: MUTED }}>{l.issues}</td><td className="px-5 py-3"><Badge label={l.status} colors={iC[l.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><button onClick={() => add({ type: "info", title: `Re-inspect Room ${l.room}` })} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Re-inspect</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// HK-06 Linen & Supplies
export function LinenSupplies({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const items = [
    { name: "Bath Towels", current: 45, par: 80, reorder: 30, unit: "pcs", status: "Low" },
    { name: "Hand Towels", current: 60, par: 80, reorder: 30, unit: "pcs", status: "Ok" },
    { name: "Bed Sheets (Queen)", current: 62, par: 100, reorder: 40, unit: "sets", status: "Ok" },
    { name: "Pillowcases", current: 95, par: 200, reorder: 80, unit: "pcs", status: "Low" },
    { name: "Duvet Covers", current: 48, par: 80, reorder: 30, unit: "pcs", status: "Ok" },
    { name: "Cleaning Cloths", current: 12, par: 50, reorder: 20, unit: "pcs", status: "Critical" },
    { name: "Mop Heads", current: 8, par: 20, reorder: 8, unit: "pcs", status: "Critical" },
  ];
  const sc = (s: string) => s === "Critical" ? { bg: "#FEE2E2", text: "#991B1B", bar: ERROR } : s === "Low" ? { bg: "#FEF3C7", text: "#92400E", bar: WARNING } : { bg: "#DCFCE7", text: "#166534", bar: SUCCESS };
  return (
    <div>
      <PageHeader title="Linen & Supplies" sub="Stock levels against par for housekeeping items" actions={<><BtnO label="Request Restock" icon={Plus} /><BtnO label="Export" icon={Download} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Item", "Current / Par", "Reorder Point", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{items.map(item => { const c = sc(item.status); const pct = Math.min((item.current / item.par) * 100, 100); return <tr key={item.name} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-4 text-sm font-medium" style={{ color: TEXT }}>{item.name}</td><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="text-sm font-bold w-8" style={{ color: c.text }}>{item.current}</span><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9", minWidth: 100 }}><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.bar }} /></div><span className="text-xs" style={{ color: SUBTLE }}>/ {item.par} {item.unit}</span></div></td><td className="px-5 py-4 text-sm" style={{ color: MUTED }}>{item.reorder} {item.unit}</td><td className="px-5 py-4"><Badge label={item.status} colors={{ bg: c.bg, text: c.text }} /></td><td className="px-5 py-4"><button onClick={() => add({ type: "info", title: `Restock requested: ${item.name}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Restock</button></td></tr>; })}</tbody>
        </table>
      </div>
    </div>
  );
}

// HK-08 Housekeeping Schedule
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

// MX-02 Work Order Detail
export function WorkOrderDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const wo = WORK_ORDERS[0];
  const timeline = [
    { ts: "Today 08:58", event: "Work order created", by: "John Abubakar", note: "AC unit in Room 207 not cooling. Guest complaint." },
    { ts: "Today 09:05", event: "Assigned to technician", by: "Grace Mensah", note: "Assigned to Emeka Nwosu" },
    { ts: "Today 09:15", event: "Status → In Progress", by: "Emeka Nwosu", note: "Checked unit — compressor issue. Sourcing parts." },
  ];
  return (
    <div>
      <PageHeader title={`Work Order ${wo.id}`} sub={`${wo.location} · ${wo.cat} · Created Today 08:58`}
        actions={<><BtnO label="Escalate" icon={AlertTriangle} /><BtnP label="Close Order" icon={CheckCircle2} onClick={() => add({ type: "success", title: `${wo.id} closed` })} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="grid grid-cols-2 gap-4 mb-4">
              {[["Location", wo.location], ["Category", wo.cat], ["Priority", wo.priority], ["Status", wo.status], ["Assigned To", wo.tech], ["SLA Deadline", "Today 14:58"]].map(([k, v]) => <div key={k}><div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: MUTED }}>{k}</div><div className="text-sm font-semibold" style={{ color: k === "Priority" ? priC[v] : TEXT }}>{v as string}</div></div>)}
            </div>
            <div><div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: MUTED }}>Description</div><p className="text-sm" style={{ color: TEXT }}>AC unit not cooling in Room 207. Guest reported warm room temperature. Technician to inspect compressor, refrigerant levels, and filter.</p></div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Activity Log</h3>
            <div className="space-y-4">{timeline.map((t, i) => <div key={i} className="flex gap-3"><div className="flex flex-col items-center"><div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: PRIMARY }} />{i < timeline.length - 1 && <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: "#E2E8F0" }} />}</div><div className="pb-4 flex-1"><div className="flex items-baseline gap-2"><span className="text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{t.ts}</span><span className="text-xs font-semibold" style={{ color: PRIMARY }}>{t.event}</span></div><p className="text-sm mt-0.5" style={{ color: TEXT }}>{t.note}</p><div className="text-xs mt-0.5" style={{ color: MUTED }}>by {t.by}</div></div></div>)}
            </div>
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
              <textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none mb-2" rows={2} placeholder="Add note or update…" style={{ borderColor: BORDER }} />
              <BtnP label="Post Update" icon={Send} onClick={() => add({ type: "success", title: "Update posted" })} />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Update Status</h3>
            <div className="space-y-2">{["Reported", "Assigned", "In Progress", "Completed"].map(s => <button key={s} onClick={() => add({ type: "success", title: `Status → ${s}` })} className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border text-sm font-medium" style={{ borderColor: s === wo.status ? PRIMARY : BORDER, backgroundColor: s === wo.status ? "#EFF6FF" : "white", color: s === wo.status ? PRIMARY : MUTED }}><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: woC[s]?.text ?? SUBTLE }} />{s}</button>)}</div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Parts Used</h3>
            <p className="text-xs mb-2" style={{ color: MUTED }}>No parts logged yet.</p>
            <BtnO label="Log Parts" icon={Plus} />
          </div>
        </div>
      </div>
    </div>
  );
}

// MX-04 Asset Register
export function AssetRegister({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const astSt: Record<string, { bg: string; text: string }> = { Ok: { bg: "#DCFCE7", text: "#166534" }, "Due Soon": { bg: "#FEF3C7", text: "#92400E" }, Overdue: { bg: "#FEE2E2", text: "#991B1B" } };
  return (
    <div>
      <PageHeader title="Asset Register" sub="All hotel assets with service history and warranty tracking" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Add Asset" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Asset ID", "Name", "Category", "Location", "Warranty Expiry", "Last Serviced", "Next Service", "Status", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{ASSETS.map(a => <tr key={a.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{a.id}</td><td className="px-4 py-3 text-sm font-medium" style={{ color: TEXT }}>{a.name}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{a.cat}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{a.location}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{a.warranty}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{a.lastService}</td><td className="px-4 py-3 text-xs" style={{ color: a.status === "Overdue" ? ERROR : a.status === "Due Soon" ? ORANGE : MUTED }}>{a.nextService}</td><td className="px-4 py-3"><Badge label={a.status} colors={astSt[a.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Work order → ${a.name}` })} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Work Order</button><button className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>View</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// RT-05 Dining Reservations
export function DiningReservations({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Dining Reservations" sub="Restaurant booking management" actions={<><BtnO label="Walk-in Seat" icon={Plus} /><BtnP label="New Reservation" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          {["Today", "Tomorrow", "This Week"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "Today" ? PRIMARY : BORDER, backgroundColor: f === "Today" ? PRIMARY : "white", color: f === "Today" ? "white" : MUTED }}>{f}</button>)}
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Date", "Time", "Party", "Guest", "Table", "Special Requests", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{DINING_RES.map((d, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{d.date}</td><td className="px-5 py-3 text-sm font-mono font-semibold" style={{ color: TEXT, fontFamily: mono }}>{d.time}</td><td className="px-5 py-3 text-sm font-bold" style={{ color: PRIMARY }}>{d.party}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{d.guest}</td><td className="px-5 py-3"><Badge label={d.table} colors={{ bg: "#EFF6FF", text: PRIMARY }} /></td><td className="px-5 py-3 text-xs max-w-40" style={{ color: MUTED }}>{d.requests}</td><td className="px-5 py-3"><Badge label={d.status} colors={{ bg: "#CCFBF1", text: "#0F766E" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "success", title: `${d.guest} seated` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Seat</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Cancel</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// RT-06 Room Service Orders
export function RoomServiceOrders({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { "In Kitchen": { bg: "#DBEAFE", text: "#1E40AF" }, "Delivered": { bg: "#DCFCE7", text: "#166534" }, "Assigned": { bg: "#FEF3C7", text: "#92400E" } };
  return (
    <div>
      <PageHeader title="Room Service Orders" sub="Manage and track room service from placement to delivery" />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Active Orders", v: "1", c: ORANGE }, { l: "In Kitchen", v: "1", c: PRIMARY }, { l: "Delivered Today", v: "3", c: SUCCESS }, { l: "Avg Delivery", v: "22 min", c: TEAL }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Order ID", "Room", "Guest", "Items", "Ordered", "Promised", "Status", "Assigned To", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{ROOM_SERVICE_ORDERS.map(o => <tr key={o.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.id}</td><td className="px-4 py-3 font-bold" style={{ color: PRIMARY }}>{o.room}</td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{o.guest}</td><td className="px-4 py-3 text-xs max-w-36" style={{ color: MUTED }}>{o.items}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.ordered}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{o.promised}</td><td className="px-4 py-3"><Badge label={o.status} colors={stC[o.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{o.assigned}</td><td className="px-4 py-3"><button onClick={() => add({ type: "success", title: `${o.id} marked delivered` })} className="text-xs px-2 py-1 rounded border" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Delivered</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// CO-03 Announcements
export function Announcements({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [showForm, setShowForm] = useState(false);
  return (
    <div>
      <PageHeader title="Announcements" sub="Broadcast messages to all staff or specific departments" actions={<BtnP label="New Announcement" icon={Plus} onClick={() => setShowForm(p => !p)} />} />
      {showForm && (
        <div className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>New Announcement</h3>
          <div className="grid grid-cols-2 gap-3 mb-3"><Inp label="Title" placeholder="Announcement title…" /><Sel label="Target Audience" options={["All Staff", "Front Desk", "Housekeeping", "Maintenance", "Finance", "Restaurant"]} /></div>
          <div className="mb-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Body</label><textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} placeholder="Announcement details…" style={{ borderColor: BORDER }} /></div>
          <div className="flex gap-3"><BtnP label="Post Announcement" icon={Send} onClick={() => { add({ type: "success", title: "Announcement posted" }); setShowForm(false); }} /><BtnO label="Cancel" onClick={() => setShowForm(false)} /></div>
        </div>
      )}
      <div className="space-y-3">{ANNOUNCE_DATA.map(a => (
        <div key={a.id} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="flex items-start justify-between mb-2">
            <div><h3 className="text-sm font-semibold" style={{ color: TEXT }}>{a.title}</h3><div className="flex items-center gap-3 mt-1 text-xs" style={{ color: MUTED }}><span>By {a.by}</span><span>Expires {a.expires}</span><span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{a.audience}</span></div></div>
            <div className="text-right"><div className="text-xs font-semibold" style={{ color: a.read === a.total ? SUCCESS : WARNING }}>{a.read}/{a.total} read</div><div className="w-20 h-1.5 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${(a.read / a.total) * 100}%`, backgroundColor: a.read === a.total ? SUCCESS : WARNING }} /></div></div>
          </div>
          <p className="text-sm" style={{ color: MUTED }}>{a.body}</p>
          <div className="flex gap-2 mt-3"><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Edit</button><button onClick={() => add({ type: "warning", title: `${a.id} archived` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Archive</button></div>
        </div>
      ))}</div>
    </div>
  );
}

// HR-02 Staff Profile Detail
export function StaffProfileDetail({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Attendance Log", "Shifts", "Payroll Summary", "Management Notes"];
  const s = STAFF[0];
  return (
    <div>
      <PageHeader title={`Staff Profile — ${s.name}`} sub={`${s.id} · ${s.role} · ${s.dept}`}
        actions={<><BtnO label="Reset Password" icon={KeyRound} /><BtnP label="Edit Profile" icon={Edit3} /></>} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <div className="text-center mb-4"><div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white mx-auto mb-2" style={{ backgroundColor: PRIMARY }}>{s.av}</div><div className="text-sm font-bold" style={{ color: TEXT }}>{s.name}</div><Badge label={s.status} colors={{ bg: "#DCFCE7", text: "#166534" }} /></div>
          <div className="space-y-2 text-xs border-t pt-3" style={{ borderColor: "#F1F5F9" }}>{[["Employee ID", s.id], ["Role", s.role], ["Department", s.dept], ["Phone", s.phone], ["Last Login", s.lastLogin]].map(([k, v]) => <div key={k} className="flex flex-col"><span style={{ color: MUTED }}>{k}</span><span className="font-medium" style={{ color: TEXT }}>{v}</span></div>)}</div>
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="flex border-b" style={{ borderColor: BORDER }}>{tabs.map(t => <button key={t} onClick={() => setTab(t)} className="px-4 py-3 text-xs font-medium whitespace-nowrap" style={{ color: tab === t ? PRIMARY : MUTED, borderBottom: tab === t ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>{t}</button>)}</div>
          <div className="p-5">
            {tab === "Overview" && <div className="grid grid-cols-2 gap-3">{[["Full Name", s.name], ["Email", `${s.name.toLowerCase().replace(" ", ".")}@grandpalms.ng`], ["Start Date", "03 January 2022"], ["Contract Type", "Full-time"], ["Shift", "Morning · 07:00–15:00"], ["Emergency Contact", "Mrs. Mensah · +234 807 123 4567"]].map(([k, v]) => <div key={k}><div className="text-xs" style={{ color: MUTED }}>{k}</div><div className="text-sm font-medium mt-0.5" style={{ color: TEXT }}>{v}</div></div>)}</div>}
            {tab === "Attendance Log" && <div className="text-sm" style={{ color: MUTED }}>June 2025: 22 days present, 0 absent, 1 leave day. Attendance rate: 95.7%</div>}
            {tab === "Shifts" && <div className="space-y-2">{["Mon 23 · Morning 07:00–15:00", "Tue 24 · Morning 07:00–15:00", "Wed 25 · Evening 15:00–23:00", "Thu 26 · Morning 07:00–15:00", "Fri 27 · Morning 07:00–15:00"].map(s => <div key={s} className="text-sm p-2 rounded-lg" style={{ backgroundColor: "#F8FAFC", color: TEXT }}>{s}</div>)}</div>}
            {tab === "Payroll Summary" && <div><div className="text-sm font-semibold mb-2" style={{ color: TEXT }}>June 2025</div><div className="space-y-2">{[["Base Salary", "₦350,000"], ["Overtime", "₦0"], ["Deductions", "₦35,000"], ["Net Pay", "₦315,000"]].map(([k, v]) => <div key={k} className="flex justify-between text-sm border-b pb-2" style={{ borderColor: "#F1F5F9" }}><span style={{ color: MUTED }}>{k}</span><span className={`font-bold ${k === "Net Pay" ? "text-green-600" : ""}`} style={k !== "Net Pay" ? { color: TEXT } : {}}>{v as string}</span></div>)}</div></div>}
            {tab === "Management Notes" && <div><EmptyState icon={ClipboardList} message="No management notes on record." cta="Add Note" /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// HR-06 Payroll Summary
export function PayrollSummary({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const total = PAYROLL_DATA.reduce((s, p) => s + p.net, 0);
  return (
    <div>
      <PageHeader title="Payroll Summary" sub="June 2025 · Grand Palms Abuja Branch" actions={<><BtnO label="Export for Payroll" icon={Download} /><BtnP label="Process Payroll" icon={DollarSign} onClick={() => add({ type: "success", title: "Payroll submitted for processing" })} /></>} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Total Gross", v: `₦${PAYROLL_DATA.reduce((s, p) => s + p.baseSalary + p.overtime, 0).toLocaleString()}`, c: PRIMARY }, { l: "Total Deductions", v: `₦${PAYROLL_DATA.reduce((s, p) => s + p.deductions, 0).toLocaleString()}`, c: ERROR }, { l: "Total Net", v: fmtN(total), c: SUCCESS }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1 uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Staff Member", "Department", "Base Salary", "Overtime", "Deductions", "Net Pay", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{PAYROLL_DATA.map(p => <tr key={p.name} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{p.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><span className="text-sm font-medium" style={{ color: TEXT }}>{p.name}</span></div></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.dept}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>₦{p.baseSalary.toLocaleString()}</td><td className="px-5 py-3 text-sm" style={{ color: p.overtime > 0 ? TEAL : MUTED }}>{p.overtime > 0 ? `+₦${p.overtime.toLocaleString()}` : "—"}</td><td className="px-5 py-3 text-sm" style={{ color: ERROR }}>−₦{p.deductions.toLocaleString()}</td><td className="px-5 py-3 text-sm font-bold" style={{ color: SUCCESS }}>₦{p.net.toLocaleString()}</td><td className="px-5 py-3"><button className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Breakdown</button></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// MB-02 Branch Comparison
export function BranchComparison() {
  const compData = [
    { name: "Abuja", occ: 88, rev: 1250, adr: 55, revpar: 48, issues: 9 },
    { name: "Lagos", occ: 72, rev: 980, adr: 45, revpar: 32, issues: 4 },
    { name: "Port Harcourt", occ: 61, rev: 620, adr: 38, revpar: 23, issues: 2 },
  ];
  return (
    <div>
      <PageHeader title="Branch Comparison" sub="Side-by-side KPI comparison across all branches · June 2025" actions={<BtnO label="Export Report" icon={Download} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy % by Branch</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={compData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`, "Occupancy"]} />
              <Bar key="comp-occ" dataKey="occ" name="Occupancy" fill={PRIMARY} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue (₦K) by Branch</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={compData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`₦${v}K`, "Revenue"]} />
              <Bar key="comp-rev" dataKey="rev" name="Revenue" fill={TEAL} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>KPI Comparison Table</h3></div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Metric", ...compData.map(b => b.name)].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{[{ metric: "Occupancy %", key: "occ", fmt: (v: number) => `${v}%` }, { metric: "Revenue (₦K)", key: "rev", fmt: (v: number) => `₦${v}K` }, { metric: "ADR (₦K)", key: "adr", fmt: (v: number) => `₦${v}K` }, { metric: "RevPAR (₦K)", key: "revpar", fmt: (v: number) => `₦${v}K` }, { metric: "Open Issues", key: "issues", fmt: (v: number) => `${v}` }].map(row => <tr key={row.metric} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{row.metric}</td>{compData.map(b => <td key={b.name} className="px-5 py-3 text-sm font-bold" style={{ color: PRIMARY }}>{row.fmt((b as any)[row.key])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// RP-03 Department Reports
export function DepartmentReports({ role }: { role: Role }) {
  const deptData: Record<string, { metrics: Array<{ l: string; v: string; c: string }>; chartData: any[]; chartKey: string }> = {
    FD: { metrics: [{ l: "Check-ins Today", v: "12", c: PRIMARY }, { l: "Check-outs Today", v: "8", c: TEAL }, { l: "Walk-ins", v: "2", c: ORANGE }, { l: "Avg Processing", v: "4.2 min", c: SUCCESS }], chartData: [{ day: "Mon", checkins: 9, checkouts: 7 }, { day: "Tue", checkins: 11, checkouts: 8 }, { day: "Wed", checkins: 14, checkouts: 12 }, { day: "Thu", checkins: 10, checkouts: 9 }, { day: "Fri", checkins: 16, checkouts: 11 }, { day: "Sat", checkins: 18, checkouts: 14 }], chartKey: "checkins" },
    HK: { metrics: [{ l: "Rooms Cleaned", v: "31", c: SUCCESS }, { l: "Avg Turnaround", v: "42 min", c: TEAL }, { l: "Inspection Pass Rate", v: "75%", c: ORANGE }, { l: "DND Flagged", v: "2", c: ERROR }], chartData: [{ day: "Mon", cleaned: 28, inspected: 24 }, { day: "Tue", cleaned: 31, inspected: 26 }, { day: "Wed", cleaned: 35, inspected: 30 }, { day: "Thu", cleaned: 29, inspected: 25 }, { day: "Fri", cleaned: 38, inspected: 32 }], chartKey: "cleaned" },
    MX: { metrics: [{ l: "Orders Created", v: "5", c: ERROR }, { l: "Orders Closed", v: "3", c: SUCCESS }, { l: "Avg Resolution", v: "6.2 hrs", c: ORANGE }, { l: "Overdue", v: "2", c: ERROR }], chartData: [{ day: "Mon", created: 3, closed: 4 }, { day: "Tue", created: 5, closed: 3 }, { day: "Wed", created: 2, closed: 5 }, { day: "Thu", created: 6, closed: 3 }, { day: "Fri", created: 4, closed: 6 }], chartKey: "created" },
    default: { metrics: [{ l: "Revenue Today", v: "₦1.25M", c: SUCCESS }, { l: "Occupancy", v: "88%", c: PRIMARY }, { l: "Active Guests", v: "94", c: ORANGE }, { l: "Open Issues", v: "9", c: ERROR }], chartData: occData.map(d => ({ day: d.day, value: d.occ })), chartKey: "value" },
  };
  const cfg = deptData[role] ?? deptData.default;
  return (
    <div>
      <PageHeader title="Department Reports" sub={`Showing report for role: ${role} · June 2025`} actions={<><BtnO label="Export" icon={Download} /></>} />
      <div className="grid grid-cols-4 gap-4 mb-5">{cfg.metrics.map(m => <div key={m.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: m.c }}>{m.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{m.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Weekly Trend</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={cfg.chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
            <Bar key={`dept-bar-${cfg.chartKey}`} dataKey={cfg.chartKey} fill={PRIMARY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// RP-04 Guest Analytics
export function GuestAnalytics() {
  return (
    <div>
      <PageHeader title="Guest Analytics" sub="Repeat guest rate, nationality, stay duration · June 2025" actions={<BtnO label="Export" icon={Download} />} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Repeat Guest Rate", v: "42%", d: "+7pp vs May", up: true }, { l: "Avg Stay Duration", v: "2.8 nights", d: "+0.3 vs May", up: true }, { l: "New Guests", v: "58%", d: "of total", up: false }, { l: "Guest Satisfaction", v: "4.6/5", d: "From 34 reviews", up: true }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>{s.v}</div><div className="text-xs uppercase tracking-wider mb-1" style={{ color: MUTED }}>{s.l}</div><div className={`flex items-center gap-1 text-xs ${s.up ? "text-green-600" : "text-[#64748B]"}`}>{s.up && <TrendingUp size={11} />}{s.d}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Repeat vs New Guests — Monthly</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={GUEST_ANALYTICS_DATA} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`]} />
              <Bar key="guest-repeat" dataKey="repeat" name="Repeat" fill={PRIMARY} stackId="b" />
              <Bar key="guest-new" dataKey="new" name="New" fill={TEAL} radius={[4, 4, 0, 0]} stackId="b" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Guest Nationality</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart><Pie key="nat-pie" data={NATIONALITY_DATA} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">{NATIONALITY_DATA.map((e, i) => <Cell key={`nat-cell-${i}`} fill={e.color} />)}</Pie><Tooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} /></PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-2">{NATIONALITY_DATA.map(n => <div key={n.name} className="flex items-center justify-between text-xs"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: n.color }} />{n.name}</div><span className="font-semibold" style={{ color: TEXT }}>{n.value}%</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}

// ST-01 Hotel Configuration
export function HotelConfig({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const modules = [{ name: "Reservations & Front Desk", desc: "Core booking and check-in/out module", on: true, required: true }, { name: "Housekeeping", desc: "Room cleaning management and inspections", on: true, required: false }, { name: "Maintenance", desc: "Work orders, assets, preventive schedules", on: true, required: false }, { name: "Restaurant / POS", desc: "POS terminal, kitchen display, menu management", on: true, required: false }, { name: "Inventory", desc: "Stock management and purchase orders", on: true, required: false }, { name: "Multi-Branch Dashboard", desc: "Cross-branch comparison and central sync", on: true, required: false }, { name: "Door Lock Integration", desc: "TTLock API integration for smart locks", on: true, required: false }];
  return (
    <div>
      <PageHeader title="Hotel Configuration" sub="Property profile, enabled modules, and tax settings" />
      <div className="space-y-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Property Profile</h3>
          <div className="grid grid-cols-2 gap-4">
            <Inp label="Hotel Name" defaultValue="Grand Palms Hotel" />
            <Inp label="Branch Name" defaultValue="Abuja Branch" />
            <Inp label="Address" defaultValue="Plot 14, Diplomatic Zone, Abuja" />
            <Inp label="Phone" defaultValue="+234 901 234 5678" />
            <Sel label="Currency" options={["NGN — Nigerian Naira", "USD — US Dollar", "GBP — British Pound"]} />
            <Sel label="Timezone" options={["Africa/Lagos (WAT, UTC+1)", "UTC"]} />
            <Inp label="Check-in Time" defaultValue="14:00" />
            <Inp label="Check-out Time" defaultValue="11:00" />
          </div>
          <div className="mt-4"><BtnP label="Save Profile" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Property profile saved" })} /></div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Enabled Modules</h3>
          <p className="text-xs mb-4" style={{ color: MUTED }}>Toggling a module hides it from the sidebar and disables all related features. Changes sync to all branch devices automatically.</p>
          <div className="space-y-3">{modules.map(m => <div key={m.name} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "#F8FAFC" }}><div><div className="text-sm font-medium" style={{ color: TEXT }}>{m.name}{m.required && <span className="ml-2 text-xs" style={{ color: MUTED }}>(required)</span>}</div><div className="text-xs mt-0.5" style={{ color: MUTED }}>{m.desc}</div></div><div className="w-10 h-5 rounded-full relative flex-shrink-0 ml-4" style={{ backgroundColor: m.on ? TEAL : "#CBD5E1", opacity: m.required ? 0.5 : 1 }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow" style={{ left: m.on ? 22 : 2 }} /></div></div>)}</div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Tax Configuration</h3>
          <div className="grid grid-cols-3 gap-4 mb-3"><Inp label="Tax Name" defaultValue="VAT" /><Inp label="Rate (%)" defaultValue="7.5" /><Sel label="Application" options={["Inclusive", "Exclusive"]} /></div>
          <div className="mb-4"><Sel label="Applicable to" options={["All Categories", "Room Revenue Only", "F&B Only", "Custom"]} /></div>
          <BtnP label="Save Tax Settings" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Tax settings saved" })} />
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Pricing Rules</h3>
          <div className="grid grid-cols-2 gap-4"><Inp label="Rate Rounding (₦)" defaultValue="100" /><Inp label="Discount Approval Threshold (₦)" defaultValue="5000" /></div>
          <p className="text-xs mt-2" style={{ color: MUTED }}>Discounts above ₦5,000 require Manager approval before being applied to a folio.</p>
          <div className="mt-3"><BtnP label="Save Rules" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Pricing rules saved" })} /></div>
        </div>
      </div>
    </div>
  );
}

// ST-03 My Preferences
export function MyPreferences({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [theme, setTheme] = useState("Light");
  const [lang, setLang] = useState("English");
  const notifPrefs = [{ label: "Reservation notifications", on: true }, { label: "Housekeeping alerts", on: true }, { label: "Maintenance work orders", on: false }, { label: "Finance notifications", on: true }, { label: "Door lock events", on: true }, { label: "Internal chat messages", on: true }, { label: "Shift handover reminders", on: true }];
  return (
    <div>
      <PageHeader title="My Preferences" sub="Grace Mensah · Hotel Manager — Personal settings" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Display & Language</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: MUTED }}>Language</label><div className="flex gap-2">{["English", "Hausa", "Yoruba", "Igbo"].map(l => <button key={l} onClick={() => setLang(l)} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: lang === l ? PRIMARY : BORDER, backgroundColor: lang === l ? "#EFF6FF" : "white", color: lang === l ? PRIMARY : MUTED }}>{l}</button>)}</div></div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-2" style={{ color: MUTED }}>Theme</label><div className="flex gap-2">{["Light", "Dark", "System"].map(t => <button key={t} onClick={() => setTheme(t)} className="px-3 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: theme === t ? PRIMARY : BORDER, backgroundColor: theme === t ? "#EFF6FF" : "white", color: theme === t ? PRIMARY : MUTED }}>{t}</button>)}</div></div>
              <Sel label="Date Format" options={["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} />
              <Sel label="Time Format" options={["24-hour (14:30)", "12-hour (2:30 PM)"]} />
            </div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Dashboard Widget Layout</h3>
            <p className="text-xs mb-3" style={{ color: MUTED }}>Drag to reorder widgets on your dashboard.</p>
            {["Occupancy & Revenue Chart", "Room Status Panel", "Department KPIs", "Recent Activity", "Arrivals Today"].map((w, i) => <div key={w} className="flex items-center gap-3 p-3 rounded-lg mb-2 cursor-grab" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${BORDER}` }}><span className="text-[#CBD5E1]">⠿</span><span className="text-sm flex-1" style={{ color: TEXT }}>{w}</span><span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>#{i + 1}</span></div>)}
          </div>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Notification Preferences</h3>
            <div className="space-y-3">{notifPrefs.map(n => <div key={n.label} className="flex items-center justify-between py-1.5"><span className="text-sm" style={{ color: TEXT }}>{n.label}</span><div className="w-10 h-5 rounded-full relative" style={{ backgroundColor: n.on ? TEAL : "#CBD5E1" }}><div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow" style={{ left: n.on ? 22 : 2 }} /></div></div>)}</div>
          </div>
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: TEXT }}>Security</h3>
            <BtnO label="Change Password" icon={KeyRound} /><p className="text-xs mt-2" style={{ color: MUTED }}>Last changed 45 days ago. We recommend changing every 90 days.</p>
          </div>
          <BtnP label="Save All Preferences" icon={CheckCircle2} onClick={() => add({ type: "success", title: "Preferences saved" })} />
        </div>
      </div>
    </div>
  );
}

// ─── FINAL SCREENS BATCH ──────────────────────────────────────────────────────











// R-04 Group Bookings
export function GroupBookings({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const groups = [
    { id: "GRP-001", name: "Dangote Group Executive Retreat", type: "Corporate", contact: "Mrs. Toyin Ahmed", rooms: 12, checkin: "28 Jun", checkout: "30 Jun", status: "Confirmed" },
    { id: "GRP-002", name: "Adeyemi Wedding Party", type: "Wedding", contact: "Mr. Bolu Adeyemi", rooms: 8, checkin: "05 Jul", checkout: "07 Jul", status: "Confirmed" },
  ];
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", type: "Corporate", contact: "", rooms: "5", checkin: "", checkout: "" });

  const createGroup = () => {
    if (!newGroup.name || !newGroup.contact) { add({ type: "warning", title: "Fill in group name and contact" }); return; }
    setShowCreate(false);
    add({ type: "success", title: "Group booking created", body: `${newGroup.name} · ${newGroup.rooms} rooms · ${newGroup.type}` });
    setNewGroup({ name: "", type: "Corporate", contact: "", rooms: "5", checkin: "", checkout: "" });
  };

  return (
    <div>
      <PageHeader title="Group Bookings" sub="Block bookings for groups, conferences, and events" actions={<BtnP label="New Group Booking" icon={Plus} onClick={() => setShowCreate(true)} />} />
      <div className="space-y-4">
        {groups.map(g => (
          <div key={g.id} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
            <div className="flex items-start justify-between mb-4">
              <div><h3 className="text-base font-semibold" style={{ color: TEXT }}>{g.name}</h3><div className="flex items-center gap-3 mt-1 text-xs" style={{ color: MUTED }}><span style={{ fontFamily: mono }}>{g.id}</span><span>{g.type}</span><span>Contact: {g.contact}</span></div></div>
              <Badge label={g.status} colors={{ bg: "#CCFBF1", text: "#0F766E" }} />
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              {[{ l: "Rooms Blocked", v: g.rooms.toString() }, { l: "Check-in", v: g.checkin }, { l: "Check-out", v: g.checkout }, { l: "Nights", v: "2" }].map(s => <div key={s.l} className="rounded-xl p-3 text-center" style={{ backgroundColor: "#F8FAFC" }}><div className="text-lg font-bold" style={{ color: TEXT }}>{s.v}</div><div className="text-xs" style={{ color: MUTED }}>{s.l}</div></div>)}
            </div>
            <div className="flex gap-2">
              <BtnO label="View Rooming List" icon={Users} />
              <BtnO label="Master Folio" icon={FileText} />
              <button onClick={() => add({ type: "info", title: `PDF generated — ${g.id}` })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border bg-white" style={{ color: MUTED, borderColor: BORDER }}><Download size={14} />Export PDF</button>
            </div>
          </div>
        ))}
        <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}>
          <EmptyState icon={Users} message="Create a new group booking to manage block reservations for corporate events, weddings, and conferences." cta="New Group Booking" onCta={() => add({ type: "info", title: "Group booking form" })} />
        </div>
      </div>
    </div>
  );
}

// R-05 Waitlist
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
              <td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "success", title: `${w.guest} promoted to reservation` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Promote</button><button onClick={() => add({ type: "info", title: `Contacted ${w.guest}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Contact</button><button onClick={() => add({ type: "warning", title: `${w.guest} removed from waitlist` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Remove</button></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// R-06 Rate Management
export function RateManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [plans, setPlans] = useState(RATE_PLANS.map(r => ({ ...r })));
  const [editPlan, setEditPlan] = useState<(typeof RATE_PLANS)[0] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editValues, setEditValues] = useState({ name: "", base: "", dates: "" });

  const openEdit = (r: typeof RATE_PLANS[0]) => {
    setEditPlan(r);
    setEditValues({ name: r.name, base: r.base.toString(), dates: r.dates });
  };
  const saveEdit = () => {
    if (!editPlan) return;
    setPlans(p => p.map(r => r.id === editPlan.id ? { ...r, name: editValues.name, base: Number(editValues.base) || r.base, dates: editValues.dates } : r));
    setEditPlan(null);
    add({ type: "success", title: "Rate plan updated", body: editValues.name });
  };
  const toggleActive = (id: string) => {
    setPlans(p => p.map(r => r.id === id ? { ...r, active: !r.active } : r));
    const plan = plans.find(r => r.id === id);
    add({ type: plan?.active ? "warning" : "success", title: `${plan?.name} ${plan?.active ? "deactivated" : "activated"}` });
  };

  return (
    <div>
      <PageHeader title="Rate Management" sub="All rate plans, seasonal pricing, and corporate rates"
        actions={<BtnP label="Create Rate Plan" icon={Plus} onClick={() => setShowCreate(true)} />} />
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC", borderBottom: `2px solid ${BORDER}` }}>{["Plan ID", "Rate Plan Name", "Room Types", "Base Rate (₦)", "Applicable Dates", "Active", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{plans.map((r, i) => (
            <tr key={r.id} className="border-t hover:bg-[#F8FAFC] transition-colors" style={{ borderColor: "#F1F5F9", backgroundColor: i % 2 === 0 ? "white" : "#FAFBFD" }}>
              <td className="px-5 py-3.5 text-xs font-mono" style={{ color: MUTED, fontFamily: mono }}>{r.id}</td>
              <td className="px-5 py-3.5 text-sm font-semibold" style={{ color: TEXT }}>{r.name}</td>
              <td className="px-5 py-3.5"><div className="flex gap-1 flex-wrap">{r.rooms.map(rt => <span key={rt} className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{rt}</span>)}</div></td>
              <td className="px-5 py-3.5 text-sm font-bold" style={{ color: PRIMARY }}>₦{r.base.toLocaleString()}</td>
              <td className="px-5 py-3.5 text-xs" style={{ color: MUTED }}>{r.dates}</td>
              <td className="px-5 py-3.5">
                <button onClick={() => toggleActive(r.id)} className="w-10 h-5 rounded-full relative transition-colors" style={{ backgroundColor: r.active ? TEAL : "#CBD5E1" }}>
                  <div className="absolute w-4 h-4 bg-white rounded-full top-0.5 shadow transition-all" style={{ left: r.active ? 22 : 2 }} />
                </button>
              </td>
              <td className="px-5 py-3.5">
                <button onClick={() => openEdit(r)} className="text-xs px-3 py-1.5 rounded-xl border font-semibold hover:shadow-sm transition-all" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Edit</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {/* Edit Rate Plan Modal */}
      {editPlan && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setEditPlan(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>Edit Rate Plan</h3>
            <p className="text-xs mb-5" style={{ color: "#64748B" }}>Changes apply immediately to all new reservations using this plan.</p>
            <div className="space-y-4">
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: "#64748B" }}>Plan Name</label>
                <input value={editValues.name} onChange={e => setEditValues(p => ({ ...p, name: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E2E8F0", color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = "#123A73"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: "#64748B" }}>Base Rate (₦ per night)</label>
                <input type="number" value={editValues.base} onChange={e => setEditValues(p => ({ ...p, base: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E2E8F0", color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = "#123A73"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} /></div>
              <div><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: "#64748B" }}>Applicable Dates</label>
                <input value={editValues.dates} onChange={e => setEditValues(p => ({ ...p, dates: e.target.value }))} placeholder="e.g. Year-round, Dec 20 – Jan 5, Fri–Sun" className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E2E8F0", color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = "#123A73"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} /></div>
              <div className="p-3 rounded-xl text-xs" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                ⚠ Rate changes do not affect existing confirmed reservations — only new bookings made after this change.
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditPlan(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: "#64748B", borderColor: "#E2E8F0" }}>Cancel</button>
              <button onClick={saveEdit} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#123A73" }}>Save Changes</button>
            </div>
          </div>
        </>
      )}

      {/* Create new rate plan */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{ border: "1px solid #E2E8F0" }}>
            <h3 className="text-base font-bold mb-5" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>Create Rate Plan</h3>
            <div className="space-y-4">
              {[["Plan Name", "e.g. Early Bird Discount"], ["Base Rate (₦)", "e.g. 42000"], ["Applicable Dates", "e.g. Jul 1 – Aug 31"]].map(([label, placeholder]) => (
                <div key={label}><label className="text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: "#64748B" }}>{label}</label><input placeholder={placeholder} className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none" style={{ borderColor: "#E2E8F0", color: "#0D1B2E" }} onFocus={e => e.target.style.borderColor = "#123A73"} onBlur={e => e.target.style.borderColor = "#E2E8F0"} /></div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border" style={{ color: "#64748B", borderColor: "#E2E8F0" }}>Cancel</button>
              <button onClick={() => { setShowCreate(false); add({ type: "success", title: "Rate plan created" }); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#123A73" }}>Create Plan</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// R-08 Cancellation & Refund
export function CancellationRefund({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [waived, setWaived] = useState(false);
  const res = ALL_RES[6]; // BK-2840 Tunde Bakare
  const cancFee = 17500;
  const deposit = 35000;
  const refund = waived ? deposit : deposit - cancFee;
  return (
    <div>
      <PageHeader title="Cancellation & Refund" sub="Process reservation cancellation with policy enforcement" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Reservation to Cancel</h3>
          <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: "#F8FAFC" }}>
            <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: PRIMARY }}>TB</div><div><div className="text-sm font-semibold" style={{ color: TEXT }}>{res.guest}</div><div className="text-xs" style={{ color: MUTED }}>{res.id} · {res.type} · {res.checkin}–{res.checkout}</div></div></div>
            {[["Rate Plan", "Standard Rate"], ["Total Value", `₦${(res.rate * res.nights * 1.075).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`], ["Deposit Paid", `₦${deposit.toLocaleString()}`]].map(([k, v]) => <div key={k} className="flex justify-between text-sm mb-1"><span style={{ color: MUTED }}>{k}</span><span style={{ color: TEXT }}>{v as string}</span></div>)}
          </div>
          <div className="border-l-4 p-4 rounded-r-xl mb-4" style={{ borderColor: WARNING, backgroundColor: "#FFFBEB" }}>
            <div className="text-sm font-semibold mb-1" style={{ color: "#92400E" }}>Cancellation Policy</div>
            <ul className="text-xs space-y-1" style={{ color: "#92400E" }}>
              <li>• Free cancellation up to 48 hours before check-in</li>
              <li>• Within 48 hours: 50% of first night charged (₦{cancFee.toLocaleString()})</li>
              <li>• No-show: 100% of first night charged</li>
            </ul>
          </div>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between"><span style={{ color: MUTED }}>Cancellation fee owed</span><span className="font-bold" style={{ color: ERROR }}>₦{cancFee.toLocaleString()}</span></div>
            <div className="flex justify-between"><span style={{ color: MUTED }}>Deposit paid</span><span style={{ color: TEXT }}>₦{deposit.toLocaleString()}</span></div>
            <div className="flex justify-between font-bold border-t pt-2" style={{ borderColor: BORDER }}><span style={{ color: TEXT }}>Refundable amount</span><span style={{ color: refund > 0 ? SUCCESS : ERROR }}>₦{refund.toLocaleString()}</span></div>
          </div>
          <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer mb-4" style={{ borderColor: waived ? WARNING : BORDER, backgroundColor: waived ? "#FFFBEB" : "white" }}>
            <div className="w-4 h-4 rounded border-2 flex items-center justify-center" style={{ borderColor: waived ? WARNING : "#CBD5E1", backgroundColor: waived ? WARNING : "transparent" }}>{waived && <CheckCircle2 size={10} color="white" />}</div>
            <input type="checkbox" className="hidden" checked={waived} onChange={e => setWaived(e.target.checked)} />
            <div><div className="text-sm font-medium" style={{ color: TEXT }}>Waive cancellation fee</div><div className="text-xs" style={{ color: MUTED }}>Requires manager authorisation and reason</div></div>
          </label>
          {waived && <div className="mb-4"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Reason for waiver</label><textarea className="w-full px-3 py-2 border rounded-lg text-sm outline-none resize-none" rows={2} placeholder="e.g. Guest experienced medical emergency…" style={{ borderColor: BORDER }} /></div>}
          <div className="flex gap-3">
            <BtnO label="Cancel & Keep Fee" onClick={() => add({ type: "warning", title: "Reservation cancelled", body: `₦${(deposit - cancFee).toLocaleString()} refund queued` })} />
            <button onClick={() => add({ type: "error", title: "Reservation cancelled", body: `Full refund ₦${deposit.toLocaleString()} processed` })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: ERROR }}>Confirm Cancellation</button>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Process Refund</h3>
          <Sel label="Refund Method" options={["Original payment method", "Cash", "Bank Transfer"]} />
          <div className="mt-3"><Inp label="Refund Amount (₦)" defaultValue={refund.toLocaleString()} /></div>
          <div className="mt-3"><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Notes for guest</label><textarea className="w-full px-3 py-2.5 border rounded-lg text-sm outline-none resize-none" rows={3} placeholder="Optional message to include with refund notification…" style={{ borderColor: BORDER }} /></div>
          <div className="mt-4"><BtnP label="Process Refund" icon={DollarSign} onClick={() => add({ type: "success", title: "Refund processed", body: `₦${refund.toLocaleString()} → ${res.guest}` })} /></div>
        </div>
      </div>
    </div>
  );
}

// FD-09 Key Card Management
export function KeyCardMgmt({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [encoderSt] = useState<"connected" | "encoding" | "disconnected">("connected");
  const cards = [
    { room: "101", guest: "Adaeze Okonkwo", count: 1, lastIssued: "22 Jun 14:03", by: "John A." },
    { room: "202", guest: "Emmanuel Adeyemi", count: 2, lastIssued: "23 Jun 14:12", by: "John A." },
    { room: "304", guest: "Chukwuemeka Obi", count: 1, lastIssued: "24 Jun 10:00", by: "John A." },
  ];
  const encC = { connected: { dot: SUCCESS, label: "Encoder Connected (USB)" }, encoding: { dot: WARNING, label: "Encoding in progress…" }, disconnected: { dot: ERROR, label: "Encoder not detected" } }[encoderSt];
  return (
    <div>
      <PageHeader title="Key Card Management" sub="Issue, re-encode, and deactivate physical room key cards" />
      {/* Encoder status */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: encC.dot }} /><span className="text-sm font-medium" style={{ color: TEXT }}>{encC.label}</span></div>
        <div className="ml-auto flex gap-2"><button onClick={() => add({ type: "info", title: "Encoder test complete — 1 device found" })} className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Test Encoder</button></div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Active Key Cards</h3></div>
        <table className="w-full">
          <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Room", "Guest", "Cards Issued", "Last Issued", "By", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{cards.map(c => (
            <tr key={c.room} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
              <td className="px-5 py-3 font-bold text-lg" style={{ color: PRIMARY }}>{c.room}</td>
              <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{c.guest}</td>
              <td className="px-5 py-3"><span className="text-xl font-bold" style={{ color: TEXT }}>{c.count}</span></td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{c.lastIssued}</td>
              <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{c.by}</td>
              <td className="px-5 py-3"><div className="flex gap-1">
                <button onClick={() => add({ type: "success", title: "Card encoded", body: `Room ${c.room} — insert blank card into encoder` })} disabled={encoderSt !== "connected"} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium disabled:opacity-40" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Encode New</button>
                <button onClick={() => add({ type: "warning", title: `Card deactivated — Room ${c.room}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Deactivate Lost</button>
                <button onClick={() => add({ type: "info", title: `History — Room ${c.room}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>History</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// HK-02 My Tasks (tablet-optimised)
export function HKMyTasks({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const setStatus = (id: string, s: string) => { setStatuses(p => ({ ...p, [id]: s })); add({ type: "success", title: `Room ${id} → ${s}` }); };
  return (
    <div>
      <PageHeader title="My Tasks — Grace Achebe" sub="24 Jun 2025 · Morning Shift · 4 rooms assigned" />
      <div className="space-y-3">
        {HK_TASK_ROOMS.map(r => {
          const st = statuses[r.id] ?? r.hkStatus;
          const stC = hkC[st] ?? { bg: "#F1F5F9", text: "#374151" };
          return (
            <div key={r.id} className="bg-white rounded-xl border p-5" style={{ borderColor: r.priority ? ORANGE : BORDER, borderWidth: r.priority ? 2 : 1 }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-bold text-white" style={{ backgroundColor: PRIMARY }}>{r.id}</div>
                  <div><div className="flex items-center gap-2"><span className="text-xl font-bold" style={{ color: TEXT }}>Room {r.id}</span>{r.priority && <span className="text-xs px-2 py-1 rounded-lg font-bold" style={{ backgroundColor: "#FEE2E2", color: ERROR }}>PRIORITY</span>}</div><div className="text-sm mt-0.5" style={{ color: MUTED }}>{r.type} · Floor {r.floor} · {r.guestStatus}</div>{r.notes && <div className="text-sm mt-1 font-medium" style={{ color: ORANGE }}>{r.notes}</div>}</div>
                </div>
                <Badge label={st} colors={stC} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {st === "Dirty" && <button onClick={() => setStatus(r.id, "In Progress")} className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[48px]" style={{ backgroundColor: PRIMARY }}>Start Cleaning</button>}
                {st === "In Progress" && <button onClick={() => setStatus(r.id, "Clean")} className="flex-1 py-3 rounded-xl text-sm font-bold text-white min-h-[48px]" style={{ backgroundColor: SUCCESS }}>Mark Cleaned</button>}
                {st === "Clean" && <div className="flex-1 py-3 rounded-xl text-sm font-bold text-center min-h-[48px] flex items-center justify-center" style={{ backgroundColor: "#DCFCE7", color: SUCCESS }}>✓ Cleaned — Awaiting Inspection</div>}
                {(st === "Dirty" || st === "In Progress") && <>
                  <button onClick={() => add({ type: "warning", title: `Issue flagged — Room ${r.id}` })} className="px-4 py-3 rounded-xl text-sm font-medium border min-h-[48px]" style={{ color: ERROR, borderColor: `${ERROR}30` }}>Flag Issue</button>
                  <button onClick={() => add({ type: "info", title: `Lost item logged — Room ${r.id}` })} className="px-4 py-3 rounded-xl text-sm font-medium border min-h-[48px]" style={{ color: MUTED, borderColor: BORDER }}>Log Lost & Found</button>
                </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// MX-06 Preventive Schedule
export function PreventiveSchedule({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const tasks = [
    { id: "PS-001", asset: "Central AC Unit", freq: "Monthly", lastDone: "12 Mar 2025", nextDue: "12 Jun 2025", status: "Overdue", tech: "Emeka Nwosu" },
    { id: "PS-002", asset: "Diesel Generator", freq: "Monthly", lastDone: "15 May 2025", nextDue: "15 Jun 2025", status: "Overdue", tech: "Emeka Nwosu" },
    { id: "PS-003", asset: "Elevator #1", freq: "Quarterly", lastDone: "01 Jun 2025", nextDue: "01 Sep 2025", status: "Ok", tech: "External Vendor" },
    { id: "PS-004", asset: "Pool Filtration", freq: "Monthly", lastDone: "20 Apr 2025", nextDue: "20 Jul 2025", status: "Ok", tech: "Chidi Ike" },
    { id: "PS-005", asset: "Fire Extinguishers", freq: "Annual", lastDone: "10 Jan 2025", nextDue: "10 Jan 2026", status: "Ok", tech: "External Vendor" },
    { id: "PS-006", asset: "Commercial Refrigerator", freq: "Quarterly", lastDone: "10 May 2025", nextDue: "10 Aug 2025", status: "Ok", tech: "Chidi Ike" },
  ];
  const stC: Record<string, { bg: string; text: string }> = { Ok: { bg: "#DCFCE7", text: "#166534" }, Overdue: { bg: "#FEE2E2", text: "#991B1B" }, "Due Soon": { bg: "#FEF3C7", text: "#92400E" } };
  return (
    <div>
      <PageHeader title="Preventive Maintenance Schedule" sub="Scheduled service tasks by asset and frequency" actions={<><BtnO label="Calendar View" icon={CalendarDays} /><BtnP label="New Schedule Entry" icon={Plus} /></>} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Overdue", v: tasks.filter(t => t.status === "Overdue").length.toString(), c: ERROR }, { l: "Due This Month", v: "2", c: WARNING }, { l: "On Schedule", v: tasks.filter(t => t.status === "Ok").length.toString(), c: SUCCESS }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["ID", "Asset", "Frequency", "Last Completed", "Next Due", "Technician", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{tasks.map(t => <tr key={t.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{t.id}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{t.asset}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.freq}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.lastDone}</td><td className="px-5 py-3 text-xs font-semibold" style={{ color: t.status === "Overdue" ? ERROR : TEXT }}>{t.nextDue}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.tech}</td><td className="px-5 py-3"><Badge label={t.status} colors={stC[t.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "success", title: `${t.id} marked complete` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Mark Done</button><button onClick={() => add({ type: "info", title: `Work order created — ${t.asset}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Work Order</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// MX-07 Vendor Contacts
export function VendorContacts({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Vendor Contacts" sub="Suppliers and contractors linked to maintenance" actions={<BtnP label="Add Vendor" icon={Plus} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {SUPPLIERS_DATA.map(s => (
          <div key={s.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow" style={{ borderColor: BORDER }}>
            <div className="flex items-start justify-between mb-3">
              <div><h3 className="text-sm font-semibold" style={{ color: TEXT }}>{s.company}</h3><div className="text-xs mt-0.5" style={{ color: MUTED }}>{s.id} · {s.cat}</div></div>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{s.cat}</span>
            </div>
            <div className="space-y-1.5 mb-3">
              {[["Contact", s.contact], ["Phone", s.phone], ["Payment Terms", s.terms], ["Last Order", s.lastOrder]].map(([k, v]) => <div key={k} className="flex gap-3 text-xs"><span className="w-24 flex-shrink-0" style={{ color: MUTED }}>{k}</span><span style={{ color: TEXT }}>{v as string}</span></div>)}
            </div>
            <div className="flex gap-2">
              <button onClick={() => add({ type: "info", title: `Call: ${s.contact}` })} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border" style={{ color: MUTED, borderColor: BORDER }}><Phone size={12} />Call</button>
              <BtnO label="Create Work Order" icon={Wrench} onClick={() => add({ type: "info", title: `Work order → ${s.company}` })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// RT-07 Guest Room Charges
export function GuestRoomCharges({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const charges = [
    { folio: "FO-2848", room: "202", guest: "Emmanuel Adeyemi", cat: "Restaurant", desc: "Room Service RS-041", amount: 8500, date: "24 Jun 18:30", by: "Restaurant System", status: "Posted" },
    { folio: "FO-2848", room: "202", guest: "Emmanuel Adeyemi", cat: "Bar", desc: "Minibar — Water ×2, Juice ×1", amount: 3600, date: "24 Jun 20:15", by: "System", status: "Posted" },
    { folio: "FO-2849", room: "501", guest: "Dr. Chukwuemeka Bello", cat: "Restaurant", desc: "Welcome champagne", amount: 15000, date: "24 Jun 14:30", by: "Grace M.", status: "Posted" },
    { folio: "FO-2847", room: "304", guest: "Chukwuemeka Obi", cat: "Restaurant", desc: "Dinner for 2 — table T04", amount: 22500, date: "24 Jun 21:00", by: "Restaurant System", status: "Disputed" },
  ];
  const stC: Record<string, { bg: string; text: string }> = { Posted: { bg: "#DCFCE7", text: "#166534" }, Disputed: { bg: "#FEE2E2", text: "#991B1B" } };
  return (
    <div>
      <PageHeader title="Guest Room Charges" sub="All F&B and ancillary charges posted to room folios" actions={<BtnP label="Post New Charge" icon={Plus} onClick={() => add({ type: "info", title: "Post charge to room" })} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Folio", "Room", "Guest", "Category", "Description", "Amount", "Posted By", "Status", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{charges.map((c, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-4 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{c.folio}</td><td className="px-4 py-3 font-bold" style={{ color: PRIMARY }}>{c.room}</td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{c.guest}</td><td className="px-4 py-3"><span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: MUTED }}>{c.cat}</span></td><td className="px-4 py-3 text-sm" style={{ color: TEXT }}>{c.desc}</td><td className="px-4 py-3 text-sm font-bold" style={{ color: TEXT }}>₦{c.amount.toLocaleString()}</td><td className="px-4 py-3 text-xs" style={{ color: MUTED }}>{c.by}</td><td className="px-4 py-3"><Badge label={c.status} colors={stC[c.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "warning", title: `Charge disputed — Room ${c.room}` })} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Dispute</button><button onClick={() => add({ type: "info", title: `Charge transferred` })} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Transfer</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// IV-02 Products
export function ProductsScreen({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Products / Items" sub="All inventory items with par levels and reorder thresholds" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Add Item" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          <div className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} /><input placeholder="Search items…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} /></div>
          <Sel options={["All Categories", "Linen", "Toiletries", "F&B", "Kitchen", "Cleaning"]} />
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Code", "Name", "Category", "Unit", "Stock", "Par Level", "Reorder Point", "Unit Cost", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{PRODUCTS_DATA.map(p => {
            const low = p.stock <= p.reorder;
            return <tr key={p.code} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{p.code}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{p.name}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.cat}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{p.unit}</td><td className="px-5 py-3"><span className="text-sm font-bold" style={{ color: low ? ERROR : TEXT }}>{p.stock}</span>{low && <span className="ml-1 text-xs" style={{ color: ERROR }}>↓ low</span>}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{p.par}</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{p.reorder}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>₦{p.cost.toLocaleString()}</td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Edit: ${p.name}` })} className="text-xs px-2 py-1 rounded border" style={{ color: MUTED, borderColor: BORDER }}>Edit</button><button onClick={() => add({ type: "info", title: `Stock adjusted — ${p.name}` })} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Adjust</button></div></td></tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// IV-03 Suppliers
export function SuppliersScreen({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  return (
    <div>
      <PageHeader title="Suppliers" sub="Supplier directory with contact and payment terms" actions={<BtnP label="Add Supplier" icon={Plus} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Supplier", "Contact", "Phone", "Category", "Payment Terms", "Last Order", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{SUPPLIERS_DATA.map(s => <tr key={s.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3"><div className="text-sm font-semibold" style={{ color: TEXT }}>{s.company}</div><div className="text-xs" style={{ color: MUTED, fontFamily: mono }}>{s.id}</div></td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{s.contact}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{s.phone}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EFF6FF", color: PRIMARY }}>{s.cat}</span></td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{s.terms}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{s.lastOrder}</td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "info", title: `Create PO — ${s.company}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Create PO</button><button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Edit</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// IV-04 Stock Transactions
export function StockTransactions({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const typeC: Record<string, { bg: string; text: string }> = { In: { bg: "#DCFCE7", text: "#166534" }, Out: { bg: "#FEF3C7", text: "#92400E" }, Adjustment: { bg: "#EEF2FF", text: "#4338CA" } };
  return (
    <div>
      <PageHeader title="Stock Transactions" sub="All stock movements — in, out, and adjustments" actions={<><BtnO label="Export" icon={Download} /><BtnP label="Log Transaction" icon={Plus} /></>} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ backgroundColor: "#F8FAFC", borderColor: BORDER }}>
          {["All", "In", "Out", "Adjustment"].map(f => <button key={f} className="text-xs px-3 py-1.5 rounded-lg border" style={{ borderColor: f === "All" ? PRIMARY : BORDER, backgroundColor: f === "All" ? PRIMARY : "white", color: f === "All" ? "white" : MUTED }}>{f}</button>)}
          <input type="date" defaultValue="2025-06-24" className="ml-auto px-3 py-1.5 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }} />
        </div>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Date", "Item", "Type", "Qty", "Reference", "Logged By"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{STOCK_TXN.map((t, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{t.date}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{t.item}</td><td className="px-5 py-3"><Badge label={t.type} colors={typeC[t.type] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3 text-sm font-bold" style={{ color: t.qty < 0 ? ERROR : t.type === "In" ? SUCCESS : TEXT }}>{t.qty > 0 ? "+" : ""}{t.qty}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.ref}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{t.by}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// IV-05 Purchase Orders
export function PurchaseOrders({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { Draft: { bg: "#F3F4F6", text: "#374151" }, Sent: { bg: "#DBEAFE", text: "#1E40AF" }, Received: { bg: "#DCFCE7", text: "#166534" }, Cancelled: { bg: "#FEE2E2", text: "#991B1B" } };
  return (
    <div>
      <PageHeader title="Purchase Orders" sub="Manage POs from draft through receipt" actions={<BtnP label="Create PO" icon={Plus} onClick={() => add({ type: "info", title: "New purchase order" })} />} />
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["PO Number", "Supplier", "Date", "Items", "Total Value", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{PO_DATA.map(po => <tr key={po.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs font-semibold" style={{ color: PRIMARY, fontFamily: mono }}>{po.id}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{po.supplier}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{po.date} Jun</td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{po.items} items</td><td className="px-5 py-3 text-sm font-bold" style={{ color: TEXT }}>₦{po.total.toLocaleString()}</td><td className="px-5 py-3"><Badge label={po.status} colors={stC[po.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1">{po.status === "Draft" && <button onClick={() => add({ type: "success", title: `${po.id} sent to supplier` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Send</button>}{po.status === "Sent" && <button onClick={() => add({ type: "success", title: `${po.id} marked received — stock updated` })} className="text-xs px-2.5 py-1.5 rounded-lg border font-medium" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Mark Received</button>}<button className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>View</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// RP-05 Inventory Reports
export function InventoryReports() {
  return (
    <div>
      <PageHeader title="Inventory Reports" sub="Consumption by category, low-stock frequency, supplier spend" actions={<BtnO label="Export" icon={Download} />} />
      <div className="grid grid-cols-4 gap-4 mb-5">{[{ l: "Total Stock Value", v: "₦1.84M", c: PRIMARY }, { l: "Critical Items", v: "2", c: ERROR }, { l: "Low Stock Items", v: "3", c: WARNING }, { l: "Supplier Spend (Jun)", v: "₦462K", c: TEAL }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>F&B Consumption Trend (₦K)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={INV_CONS} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`₦${v}K`]} />
              <Bar key="inv-fb-bar" dataKey="val" name="F&B Spend" fill={TEAL} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Stock Status by Category</h3>
          <div className="space-y-3">{[{ cat: "Linen", ok: 3, low: 1, critical: 0 }, { cat: "Toiletries", ok: 1, low: 0, critical: 1 }, { cat: "F&B", ok: 2, low: 1, critical: 0 }, { cat: "Kitchen", ok: 0, low: 0, critical: 1 }].map(c => <div key={c.cat}><div className="flex items-center justify-between text-xs mb-1"><span style={{ color: TEXT }}>{c.cat}</span><div className="flex gap-2">{c.critical > 0 && <span style={{ color: ERROR }}>{c.critical} critical</span>}{c.low > 0 && <span style={{ color: WARNING }}>{c.low} low</span>}<span style={{ color: SUCCESS }}>{c.ok} ok</span></div></div><div className="h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: "#F1F5F9" }}><div style={{ width: `${(c.ok / (c.ok + c.low + c.critical)) * 100}%`, backgroundColor: SUCCESS }} /><div style={{ width: `${(c.low / (c.ok + c.low + c.critical)) * 100}%`, backgroundColor: WARNING }} /><div style={{ width: `${(c.critical / (c.ok + c.low + c.critical)) * 100}%`, backgroundColor: ERROR }} /></div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// RP-06 Staff Reports
export function StaffReports() {
  return (
    <div>
      <PageHeader title="Staff Reports" sub="Hours worked, attendance rate, and shift coverage · June 2025" actions={<BtnO label="Export" icon={Download} />} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Total Hours Worked", v: "1,596", c: PRIMARY }, { l: "Overall Attendance", v: "94%", c: SUCCESS }, { l: "Overtime Hours", v: "89h", c: ORANGE }].map(s => <div key={s.l} className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}><div className="text-2xl font-bold mb-1" style={{ color: s.c }}>{s.v}</div><div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Hours Worked by Department</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={STAFF_RPT} layout="vertical" margin={{ top: 0, right: 20, left: 40, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis type="number" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
              <YAxis dataKey="dept" type="category" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}h`, "Hours"]} />
              <Bar key="staff-hours-bar" dataKey="hours" name="Hours" fill={PRIMARY} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Attendance Rate by Department</h3>
          {STAFF_RPT.map(s => <div key={s.dept} className="mb-4"><div className="flex items-center justify-between text-sm mb-1.5"><span style={{ color: TEXT }}>{s.dept}</span><span className="font-bold" style={{ color: s.attend >= 95 ? SUCCESS : s.attend >= 90 ? WARNING : ERROR }}>{s.attend}%</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#F1F5F9" }}><div className="h-full rounded-full" style={{ width: `${s.attend}%`, backgroundColor: s.attend >= 95 ? SUCCESS : s.attend >= 90 ? WARNING : ERROR }} /></div></div>)}
        </div>
      </div>
    </div>
  );
}

// IT-03 Device Management
export function DeviceManagement({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const stC: Record<string, { bg: string; text: string }> = { Online: { bg: "#DCFCE7", text: "#166534" }, Idle: { bg: "#FEF3C7", text: "#92400E" }, Offline: { bg: "#F3F4F6", text: "#374151" } };
  return (
    <div>
      <PageHeader title="Device Management" sub="All registered devices on the branch LAN" actions={<BtnP label="Register Device" icon={Plus} />} />
      <div className="grid grid-cols-3 gap-4 mb-5">{[{ l: "Online", v: DEVICES.filter(d => d.status === "Online").length.toString(), c: SUCCESS }, { l: "Idle", v: DEVICES.filter(d => d.status === "Idle").length.toString(), c: WARNING }, { l: "Total Registered", v: DEVICES.length.toString(), c: PRIMARY }].map(s => <div key={s.l} className="bg-white rounded-xl p-4 border text-center" style={{ borderColor: BORDER }}><div className="text-2xl font-bold" style={{ color: s.c }}>{s.v}</div><div className="text-xs mt-1" style={{ color: MUTED }}>{s.l}</div></div>)}</div>
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
        <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Device Name", "Type", "Department", "IP Address", "MAC Address", "Last Seen", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
          <tbody>{DEVICES.map(d => <tr key={d.name} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{d.name}</td><td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#F1F5F9", color: MUTED }}>{d.type}</span></td><td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{d.dept}</td><td className="px-5 py-3 text-xs" style={{ color: TEXT, fontFamily: mono }}>{d.ip}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{d.mac}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{d.lastSeen}</td><td className="px-5 py-3"><Badge label={d.status} colors={stC[d.status] ?? { bg: "#F1F5F9", text: "#374151" }} /></td><td className="px-5 py-3"><div className="flex gap-1"><button onClick={() => add({ type: "warning", title: `Device deauthorized — ${d.name}` })} className="text-xs px-2.5 py-1.5 rounded-lg border" style={{ color: ERROR, borderColor: `${ERROR}20` }}>Deauthorize</button></div></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

// ST-02 Synchronization
export function SyncSettings({ add }: { add: (t: Omit<Toast, "id">) => void }) {
  const conflicts = [
    { record: "Reservation BK-2847", local: "Check-in time 14:05", server: "Check-in time 14:08", ts: "24 Jun 14:09" },
  ];
  return (
    <div>
      <PageHeader title="Synchronization" sub="Local ↔ Central server sync settings and status" actions={<BtnP label="Sync Now" icon={RefreshCw} onClick={() => add({ type: "success", title: "Sync started", body: "Pushing 0 pending items to central server" })} />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Connection Status</h3>
          <div className="space-y-3">
            {[{ l: "Central Server URL", v: "https://sync.grandpalms-hms.ng" }, { l: "Last Sync", v: "2 min ago" }, { l: "Pending Items", v: "0" }, { l: "Last Sync Duration", v: "1.2 seconds" }, { l: "Total Synced Today", v: "847 records" }].map(([k, v]) => <div key={k} className="flex items-center justify-between py-2 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm" style={{ color: MUTED }}>{k}</span><span className="text-sm font-semibold" style={{ color: TEXT }}>{v as string}</span></div>)}
          </div>
          <div className="mt-4"><Inp label="Central Server URL" defaultValue="https://sync.grandpalms-hms.ng" /><div className="mt-3"><BtnP label="Test Connection" icon={Wifi} onClick={() => add({ type: "success", title: "Connection successful", body: "Central server reachable · Latency: 45ms" })} /></div></div>
        </div>
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Sync Configuration</h3>
          <div className="space-y-3">
            <Sel label="Sync Frequency" options={["Real-time (push on change)", "Every 5 minutes", "Every 15 minutes", "Manual only"]} />
            <div className="flex items-center justify-between py-2"><span className="text-sm" style={{ color: TEXT }}>Sync when internet restores</span><div className="w-10 h-5 rounded-full" style={{ backgroundColor: TEAL }}><div className="w-4 h-4 bg-white rounded-full m-0.5 ml-5 shadow" /></div></div>
            <div className="flex items-center justify-between py-2"><span className="text-sm" style={{ color: TEXT }}>Notify on sync failure</span><div className="w-10 h-5 rounded-full" style={{ backgroundColor: TEAL }}><div className="w-4 h-4 bg-white rounded-full m-0.5 ml-5 shadow" /></div></div>
          </div>
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
            <button onClick={() => add({ type: "warning", title: "Pending queue cleared", body: "0 items removed" })} className="text-xs font-medium text-red-500 hover:text-red-700 border border-red-200 px-3 py-2 rounded-lg">Clear Pending Queue</button>
          </div>
        </div>
      </div>
      {conflicts.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "#F1F5F9" }}><AlertTriangle size={15} style={{ color: WARNING }} /><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Conflict Resolution — {conflicts.length} pending</h3></div>
          {conflicts.map((c, i) => (
            <div key={i} className="p-5">
              <div className="text-xs font-semibold mb-3" style={{ color: MUTED }}>{c.record} · Conflict detected at {c.ts}</div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="p-3 rounded-xl border-2" style={{ borderColor: PRIMARY }}><div className="text-xs font-bold mb-1" style={{ color: PRIMARY }}>Local Version</div><div className="text-sm" style={{ color: TEXT }}>{c.local}</div></div>
                <div className="p-3 rounded-xl border-2" style={{ borderColor: TEAL }}><div className="text-xs font-bold mb-1" style={{ color: TEAL }}>Server Version</div><div className="text-sm" style={{ color: TEXT }}>{c.server}</div></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => add({ type: "success", title: "Local version kept" })} className="px-3 py-2 rounded-lg text-xs font-medium border-2 text-white" style={{ backgroundColor: PRIMARY, borderColor: PRIMARY }}>Keep Local</button>
                <button onClick={() => add({ type: "success", title: "Server version accepted" })} className="px-3 py-2 rounded-lg text-xs font-medium border-2 text-white" style={{ backgroundColor: TEAL, borderColor: TEAL }}>Keep Server</button>
                <BtnO label="Resolve Manually" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

