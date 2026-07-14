// Organization Portal — Super Admin remote access.
// Served from: portal.yourplatform.com (central cloud server)
// Shows aggregated cross-branch data from last sync. Read-heavy.
import { useState } from "react";
import {
  Building2, BarChart3, RefreshCw, LogOut, Bell, Globe,
  TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle,
  ChevronDown, Download, CheckCircle2, X, Wifi, WifiOff,
  Activity, MapPin, Clock, Settings,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const PRIMARY = "#123A73";
const TEAL = "#1BA39C";
const ORANGE = "#F57C00";
const SUCCESS = "#2E7D32";
const WARNING = "#FFA000";
const ERROR = "#D32F2F";
const BORDER = "#E2E8F0";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const SUBTLE = "#94A3B8";
const NAV_BG = "#0C1A36";
const sans = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', monospace";

function fmtN(v: number) {
  return v >= 1e6 ? `₦${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `₦${(v / 1e3).toFixed(0)}K` : `₦${v}`;
}

const BRANCHES = [
  { id: "abj", name: "Abuja Branch", location: "Abuja, FCT", occ: 88, rev: 1250000, issues: 9, lastSync: "2m ago", manager: "Grace Mensah", rooms: 100, status: "synced", guests: 94 },
  { id: "lag", name: "Lagos Branch", location: "Lagos, VI", occ: 72, rev: 980000, issues: 4, lastSync: "45m ago", manager: "Tunde Okafor", rooms: 75, status: "pending", guests: 62 },
  { id: "ph", name: "Port Harcourt", location: "Port Harcourt, Rivers", occ: 61, rev: 620000, issues: 2, lastSync: "3h ago", manager: "Amara Eze", rooms: 50, status: "synced", guests: 38 },
];

const revTrend = [
  { month: "Jan", abj: 820, lag: 620, ph: 380 },
  { month: "Feb", abj: 910, lag: 680, ph: 420 },
  { month: "Mar", abj: 880, lag: 710, ph: 390 },
  { month: "Apr", abj: 1050, lag: 750, ph: 450 },
  { month: "May", abj: 1150, lag: 820, ph: 510 },
  { month: "Jun", abj: 1250, lag: 980, ph: 620 },
];

const occTrend = [
  { day: "Mon", abj: 82, lag: 68, ph: 55 },
  { day: "Tue", abj: 79, lag: 72, ph: 60 },
  { day: "Wed", abj: 85, lag: 69, ph: 58 },
  { day: "Thu", abj: 90, lag: 74, ph: 63 },
  { day: "Fri", abj: 95, lag: 78, ph: 67 },
  { day: "Sat", abj: 96, lag: 80, ph: 70 },
  { day: "Sun", abj: 88, lag: 72, ph: 61 },
];

const revCat = [
  { name: "Abuja", value: 50, color: PRIMARY },
  { name: "Lagos", value: 35, color: TEAL },
  { name: "Port Harcourt", value: 15, color: ORANGE },
];

function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>{label}</span>;
}

function Stat({ label, value, sub, delta, deltaPositive, color }: { label: string; value: string; sub?: string; delta?: string; deltaPositive?: boolean; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
      <div className="text-2xl font-bold mb-1" style={{ color: color ?? TEXT }}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: MUTED }}>{label}</div>
      {sub && <div className="text-xs" style={{ color: SUBTLE }}>{sub}</div>}
      {delta && <div className={`flex items-center gap-1 text-xs mt-1 ${deltaPositive ? "text-green-600" : "text-red-500"}`}>{deltaPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{delta}</div>}
    </div>
  );
}

export default function OrgPortal({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<"overview" | "comparison" | "reports" | "sync" | "settings">("overview");
  const [userMenu, setUserMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const totalRev = BRANCHES.reduce((s, b) => s + b.rev, 0);
  const totalGuests = BRANCHES.reduce((s, b) => s + b.guests, 0);
  const avgOcc = Math.round(BRANCHES.reduce((s, b) => s + b.occ, 0) / BRANCHES.length);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const tabs = [
    { id: "overview", label: "Overview", icon: Building2 },
    { id: "comparison", label: "Branch Comparison", icon: BarChart3 },
    { id: "reports", label: "Reports", icon: TrendingUp },
    { id: "sync", label: "Sync Status", icon: RefreshCw },
    { id: "settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>

      {/* Header */}
      <header className="h-14 flex items-center px-6 gap-4 shadow-sm" style={{ backgroundColor: NAV_BG, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M4 21V8l8-5 8 5v13M9 21v-6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <span className="text-white font-semibold text-sm">Grand Palms Group</span>
            <span className="text-xs ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(27,163,156,0.2)", color: TEAL }}>Organization Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#22C55E" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#22C55E" }} />portal.yourplatform.com
          </div>
          <button className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
            <Bell size={16} color="white" />
          </button>
          <div className="relative">
            <button onClick={() => setUserMenu(p => !p)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: ORANGE }}>AM</div>
              <span className="text-xs text-white font-medium hidden sm:block">Alhaji Musa</span>
              <ChevronDown size={11} color="#94A3B8" />
            </button>
            {userMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-2xl border overflow-hidden z-50" style={{ backgroundColor: "white", borderColor: BORDER }}>
                <div className="px-3 py-2.5 border-b" style={{ borderColor: "#F1F5F9" }}>
                  <div className="text-xs font-semibold" style={{ color: TEXT }}>Alhaji Musa Ibrahim</div>
                  <div className="text-xs mt-0.5" style={{ color: MUTED }}>owner@grandpalms.ng · ORG</div>
                </div>
                <button onClick={() => { setUserMenu(false); showToast("Live branch access requires VPN connection to hotel LAN"); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: TEXT }}>
                  <Globe size={14} style={{ color: MUTED }} />Access Branch App (VPN)
                </button>
                <button onClick={() => { setUserMenu(false); onLogout(); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: ERROR }}>
                  <LogOut size={14} />Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Portal notice */}
      <div className="flex items-center gap-2 px-6 py-2 text-xs" style={{ backgroundColor: "#EFF6FF", borderBottom: `1px solid ${BORDER}` }}>
        <Wifi size={12} style={{ color: PRIMARY }} />
        <span style={{ color: PRIMARY }}>Showing aggregated data from last branch sync · Last updated: Abuja 2m ago, Lagos 45m ago, Port Harcourt 3h ago</span>
        <span className="ml-auto" style={{ color: SUBTLE }}>This portal shows synced snapshots, not live data · Live access requires VPN</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-white" style={{ borderColor: BORDER }}>
        <div className="flex px-6">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap"
                style={{ color: tab === t.id ? PRIMARY : MUTED, borderBottom: tab === t.id ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>
                <Icon size={15} />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Stat label="Total Revenue Today" value={fmtN(totalRev)} sub="Across 3 branches" delta="+12.4% vs yesterday" deltaPositive color={SUCCESS} />
              <Stat label="Avg Occupancy" value={`${avgOcc}%`} sub="Weighted across all rooms" delta="+3% vs last week" deltaPositive color={PRIMARY} />
              <Stat label="Active Guests" value={totalGuests.toString()} sub="Checked in right now" />
              <Stat label="Open Issues" value={BRANCHES.reduce((s, b) => s + b.issues, 0).toString()} sub="Across all branches" color={WARNING} />
            </div>

            {/* Branch cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              {BRANCHES.map(b => (
                <div key={b.id} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow" style={{ borderColor: BORDER }}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="text-base font-bold" style={{ color: TEXT }}>{b.name}</div>
                      <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: MUTED }}><MapPin size={11} />{b.location}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.status === "synced" ? SUCCESS : WARNING }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.status === "synced" ? SUCCESS : WARNING }} />
                      {b.status === "synced" ? "Synced" : "Pending"}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {[
                      { l: "Occupancy", v: `${b.occ}%`, c: b.occ > 80 ? SUCCESS : b.occ > 60 ? WARNING : ERROR },
                      { l: "Revenue Today", v: fmtN(b.rev), c: TEXT },
                      { l: "Active Guests", v: b.guests.toString(), c: PRIMARY },
                      { l: "Open Issues", v: b.issues.toString(), c: b.issues > 5 ? ERROR : b.issues > 2 ? WARNING : SUCCESS },
                    ].map(s => (
                      <div key={s.l} className="rounded-xl p-3 text-center" style={{ backgroundColor: "#F8FAFC" }}>
                        <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                        <div className="text-xs" style={{ color: MUTED }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-3 border-t" style={{ borderColor: "#F1F5F9" }}>
                    <span style={{ color: MUTED }}>Manager: <strong style={{ color: TEXT }}>{b.manager}</strong></span>
                    <span style={{ color: SUBTLE }}>Synced {b.lastSync}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue trend */}
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue Trend — All Branches (₦K)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any, n: string) => [`₦${v}K`, n]} />
                  <Area key="area-abj" type="monotone" dataKey="abj" name="Abuja" stroke={PRIMARY} strokeWidth={2} fill={PRIMARY + "15"} dot={false} />
                  <Area key="area-lag" type="monotone" dataKey="lag" name="Lagos" stroke={TEAL} strokeWidth={2} fill={TEAL + "15"} dot={false} />
                  <Area key="area-ph" type="monotone" dataKey="ph" name="Port Harcourt" stroke={ORANGE} strokeWidth={2} fill={ORANGE + "15"} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {tab === "comparison" && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy % by Branch — This Week</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={occTrend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`]} />
                    <Bar key="occ-abj" dataKey="abj" name="Abuja" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                    <Bar key="occ-lag" dataKey="lag" name="Lagos" fill={TEAL} radius={[3, 3, 0, 0]} />
                    <Bar key="occ-ph" dataKey="ph" name="Port Harcourt" fill={ORANGE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue Share by Branch</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie key="portal-pie" data={revCat} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                      {revCat.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${v}%`]} contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {revCat.map(c => (
                    <div key={c.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} /><span className="text-xs" style={{ color: MUTED }}>{c.name}</span></div>
                      <span className="text-xs font-semibold" style={{ color: TEXT }}>{c.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>KPI Comparison Table</h3></div>
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Metric</th>{BRANCHES.map(b => <th key={b.id} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{b.name}</th>)}</tr></thead>
                <tbody>
                  {[
                    { metric: "Occupancy %", vals: BRANCHES.map(b => `${b.occ}%`) },
                    { metric: "Revenue Today", vals: BRANCHES.map(b => fmtN(b.rev)) },
                    { metric: "Active Guests", vals: BRANCHES.map(b => b.guests.toString()) },
                    { metric: "Open Issues", vals: BRANCHES.map(b => b.issues.toString()) },
                    { metric: "Total Rooms", vals: BRANCHES.map(b => b.rooms.toString()) },
                    { metric: "Manager", vals: BRANCHES.map(b => b.manager) },
                  ].map(r => (
                    <tr key={r.metric} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{r.metric}</td>
                      {r.vals.map((v, i) => <td key={i} className="px-5 py-3 text-sm font-semibold" style={{ color: PRIMARY }}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "reports" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[
              { title: "Occupancy Report — All Branches", desc: "Monthly occupancy %, ADR, RevPAR" },
              { title: "Revenue Report — Consolidated", desc: "Revenue by category and branch" },
              { title: "Guest Analytics", desc: "Repeat rate, nationality, average stay" },
              { title: "Staff Attendance Report", desc: "Attendance rates across all branches" },
            ].map(r => (
              <div key={r.title} className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>{r.title}</h3>
                <p className="text-xs mb-4" style={{ color: MUTED }}>{r.desc}</p>
                <div className="flex gap-2">
                  <button onClick={() => showToast(`${r.title} — generating PDF…`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}><Download size={12} />Export PDF</button>
                  <button onClick={() => showToast(`${r.title} — CSV downloaded`)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border" style={{ color: MUTED, borderColor: BORDER }}><Download size={12} />Export CSV</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "sync" && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}>
                <div className="text-2xl font-bold mb-1" style={{ color: SUCCESS }}>2/3</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>Fully Synced</div>
              </div>
              <div className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}>
                <div className="text-2xl font-bold mb-1" style={{ color: WARNING }}>1</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>Pending Items</div>
              </div>
              <div className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}>
                <div className="text-2xl font-bold mb-1" style={{ color: TEXT }}>45m</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>Max Sync Lag</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Branch Sync Status</h3>
                <button onClick={() => showToast("Force sync triggered for all branches")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border" style={{ color: TEAL, borderColor: `${TEAL}30` }}><RefreshCw size={13} />Force Sync All</button>
              </div>
              {BRANCHES.map(b => (
                <div key={b.id} className="flex items-center gap-4 px-5 py-4 border-b hover:bg-[#FAFBFD]" style={{ borderColor: "#F8FAFC" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: b.status === "synced" ? "#DCFCE7" : "#FEF3C7" }}>
                    <RefreshCw size={16} style={{ color: b.status === "synced" ? SUCCESS : WARNING }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: TEXT }}>{b.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>{b.location} · Manager: {b.manager}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: b.status === "synced" ? SUCCESS : WARNING }}>
                      {b.status === "synced" ? "All synced" : "5 items pending"}
                    </div>
                    <div className="text-xs" style={{ color: SUBTLE }}>Last sync: {b.lastSync}</div>
                  </div>
                  <Badge label={b.status === "synced" ? "Synced" : "Pending"} colors={b.status === "synced" ? { bg: "#DCFCE7", text: "#166534" } : { bg: "#FEF3C7", text: "#92400E" }} />
                  <button onClick={() => showToast(`Force sync — ${b.name}`)} className="text-xs px-3 py-1.5 rounded-lg border" style={{ color: MUTED, borderColor: BORDER }}>Force Sync</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Organization Profile</h3>
              <div className="space-y-3">
                {[["Organization Name", "Grand Palms Group"], ["Owner", "Alhaji Musa Ibrahim"], ["Email", "owner@grandpalms.ng"], ["Subscription", "Business Plan · 3 branches"]].map(([k, v]) => (
                  <div key={k}><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{k}</label><div className="px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: BORDER, color: TEXT }}>{v}</div></div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Remote Access</h3>
              <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}>
                <div className="text-sm font-semibold mb-1" style={{ color: "#92400E" }}>Live Branch Access</div>
                <p className="text-xs" style={{ color: "#92400E" }}>This portal shows synced data only. For live operational access (real-time reservation grid, live check-ins), connect via VPN to the hotel LAN and navigate to http://hms.local</p>
              </div>
              <button onClick={() => showToast("VPN configuration guide sent to owner@grandpalms.ng")} className="w-full py-2.5 rounded-xl text-sm font-medium border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>
                Request VPN Configuration Guide
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border" style={{ backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", minWidth: 280 }}>
          <CheckCircle2 size={16} style={{ color: SUCCESS }} />
          <span className="text-sm font-medium" style={{ color: TEXT }}>{toast}</span>
        </div>
      )}
    </div>
  );
}
