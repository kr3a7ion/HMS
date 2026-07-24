// Organization Portal — Super Admin remote access (Auth doc Part 4.2).
// Served from: portal.nexura.app (central cloud server, central-server/)
// Real central-server login, real data from GET /org/overview,
// /org/comparison, /org/sync-status -- all aggregated from each branch's
// last push (services/sync.ts on the local side), not live. Read-heavy by
// design: "not a remote control for branch operations" (Auth doc 4.2) --
// there's deliberately no "Force Sync" action here, that only exists on
// the branch-local Central Sync Status screen (a branch can push itself;
// nothing here can reach into a branch and make it push).
import { useState, useEffect } from "react";
import {
  Building2, BarChart3, RefreshCw, LogOut, Bell, Globe,
  TrendingUp, TrendingDown, Users, DollarSign, AlertTriangle,
  ChevronDown, Download, CheckCircle2, X, Wifi, WifiOff,
  Activity, MapPin, Clock, Settings, Lock,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { orgAuthApi, orgPortalApi, CentralApiError, CentralNetworkError, type OrgUser, type OrgOverview, type OrgComparison, type OrgSyncStatusEntry } from "./lib/centralApi";

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

function fmtN(v: number) {
  return v >= 1e6 ? `₦${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `₦${(v / 1e3).toFixed(0)}K` : `₦${v}`;
}

function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>{label}</span>;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
      <div className="text-2xl font-bold mb-1" style={{ color: color ?? TEXT }}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: MUTED }}>{label}</div>
      {sub && <div className="text-xs" style={{ color: SUBTLE }}>{sub}</div>}
    </div>
  );
}

// Real login gate against central-server/'s /auth/org/login -- entirely
// separate session from the branch-local app.
function OrgPortalLogin({ onLoggedIn, onBack }: { onLoggedIn: (u: OrgUser) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const { user } = await orgAuthApi.login(email, password);
      onLoggedIn(user);
    } catch (e) {
      if (e instanceof CentralApiError && e.code === "INVALID_CREDENTIALS") setError("Incorrect email or password.");
      else if (e instanceof CentralNetworkError) setError("Couldn't reach the central server. Start it with: cd central-server && npm run dev");
      else setError("Login failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}><Building2 size={18} color="white" /></div>
          <div className="text-lg font-bold" style={{ color: TEXT }}>Organization Portal</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border shadow-sm" style={{ borderColor: BORDER }}>
          <p className="text-xs mb-4" style={{ color: MUTED }}>Remote cross-branch access for Organization Super Admins. Separate login from the branch-local app (Auth doc Part 4.2).</p>
          {error && <div className="px-3 py-2 rounded-lg mb-3 text-xs" style={{ backgroundColor: "#FEF2F2", color: ERROR, border: "1px solid #FECACA" }}>{error}</div>}
          <div className="space-y-3">
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
            <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
          </div>
          <button onClick={submit} disabled={loading} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{loading ? "Signing in…" : "Sign In"}</button>
          <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "#F1F5F9", color: SUBTLE }}>Seeded demo: <span style={{ fontFamily: "monospace" }}>superadmin@grandpalms.ng</span> / <span style={{ fontFamily: "monospace" }}>demo123</span> (central-server/src/seed.ts)</div>
        </div>
        <button onClick={onBack} className="w-full mt-4 text-xs text-center" style={{ color: MUTED }}>← Back to branch login</button>
      </div>
    </div>
  );
}

export default function OrgPortal({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<OrgUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [tab, setTab] = useState<"overview" | "comparison" | "reports" | "sync" | "settings">("overview");
  const [userMenu, setUserMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [comparison, setComparison] = useState<OrgComparison | null>(null);
  const [syncStatus, setSyncStatus] = useState<OrgSyncStatusEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => { orgAuthApi.me().then(setMe).catch(() => {}).finally(() => setCheckingSession(false)); }, []);

  const loadData = () => {
    setLoadingData(true);
    Promise.all([orgPortalApi.overview(), orgPortalApi.comparison(14), orgPortalApi.syncStatus()])
      .then(([o, c, s]) => { setOverview(o); setComparison(c); setSyncStatus(s); })
      .catch(() => showToast("Couldn't load portal data"))
      .finally(() => setLoadingData(false));
  };
  useEffect(() => { if (me) loadData(); }, [me]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const signOut = async () => {
    setUserMenu(false);
    try { await orgAuthApi.logout(); } catch { /* best-effort */ }
    setMe(null);
    onLogout();
  };

  if (checkingSession) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F0F4F8" }}><div className="text-sm" style={{ color: MUTED }}>Loading…</div></div>;
  if (!me) return <OrgPortalLogin onLoggedIn={setMe} onBack={onLogout} />;
  if (loadingData || !overview) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F0F4F8" }}><div className="text-sm" style={{ color: MUTED }}>Loading branch data…</div></div>;

  const revCat = overview.branches.filter(b => b.revenueToday != null).map((b, i) => ({ name: b.branchName, value: b.revenueToday!, color: [PRIMARY, TEAL, ORANGE, "#8B5CF6", "#EC4899"][i % 5] }));
  const totalRevForShare = revCat.reduce((s, c) => s + c.value, 0);

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
            <span className="text-white font-semibold text-sm">{overview.organizationName}</span>
            <span className="text-xs ml-2 px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(27,163,156,0.2)", color: TEAL }}>Organization Portal</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#22C55E" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#22C55E" }} />portal.nexura.app
          </div>
          <button onClick={loadData} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10" title="Refresh"><RefreshCw size={15} color="white" /></button>
          <div className="relative">
            <button onClick={() => setUserMenu(p => !p)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: ORANGE }}>{me.firstName[0]}{me.lastName[0]}</div>
              <span className="text-xs text-white font-medium hidden sm:block">{me.firstName} {me.lastName}</span>
              <ChevronDown size={11} color="#94A3B8" />
            </button>
            {userMenu && (
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-2xl border overflow-hidden z-50" style={{ backgroundColor: "white", borderColor: BORDER }}>
                <div className="px-3 py-2.5 border-b" style={{ borderColor: "#F1F5F9" }}>
                  <div className="text-xs font-semibold" style={{ color: TEXT }}>{me.firstName} {me.lastName}</div>
                  <div className="text-xs mt-0.5" style={{ color: MUTED }}>{me.email} · Org Super Admin</div>
                </div>
                <button onClick={() => { setUserMenu(false); showToast("Live branch access requires VPN connection to hotel LAN"); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: TEXT }}>
                  <Globe size={14} style={{ color: MUTED }} />Access Branch App (VPN)
                </button>
                <button onClick={signOut}
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
        <span style={{ color: PRIMARY }}>Showing aggregated data from last branch sync{overview.branches.length > 0 && ` · ${overview.branches.map(b => `${b.branchName} ${b.snapshotAt ? new Date(b.snapshotAt).toLocaleString() : "never synced"}`).join(", ")}`}</span>
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
              <Stat label="Total Revenue Today" value={fmtN(overview.totalRevenueToday)} sub={`Across ${overview.totalBranches} branches`} color={SUCCESS} />
              <Stat label="Avg Occupancy" value={`${overview.avgOccupancy}%`} sub="Weighted across synced branches" color={PRIMARY} />
              <Stat label="Active Guests" value={overview.totalActiveGuests.toString()} sub="As of last sync" />
              <Stat label="Open Issues" value={overview.totalOpenIssues.toString()} sub="Across all branches" color={WARNING} />
            </div>

            {overview.branches.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: BORDER }}><Building2 size={28} className="mx-auto mb-2" style={{ color: SUBTLE }} /><p className="text-sm" style={{ color: MUTED }}>No branches provisioned yet.</p></div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                {overview.branches.map(b => (
                  <div key={b.branchId} className="bg-white rounded-xl border p-5 hover:shadow-md transition-shadow" style={{ borderColor: BORDER }}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="text-base font-bold" style={{ color: TEXT }}>{b.branchName}</div>
                        <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: MUTED }}><MapPin size={11} />{b.branchManagerName ?? "No manager on file"}</div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.lastSyncStatus === "ok" ? SUCCESS : WARNING }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.lastSyncStatus === "ok" ? SUCCESS : WARNING }} />
                        {b.lastSyncStatus === "ok" ? "Synced" : b.lastSyncStatus === "error" ? "Error" : "Never Synced"}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { l: "Occupancy", v: b.occupancyRate != null ? `${b.occupancyRate}%` : "—", c: (b.occupancyRate ?? 0) > 80 ? SUCCESS : (b.occupancyRate ?? 0) > 60 ? WARNING : ERROR },
                        { l: "Revenue Today", v: b.revenueToday != null ? fmtN(b.revenueToday) : "—", c: TEXT },
                        { l: "Active Guests", v: b.activeGuests?.toString() ?? "—", c: PRIMARY },
                        { l: "Open Issues", v: b.openIssues?.toString() ?? "—", c: (b.openIssues ?? 0) > 5 ? ERROR : (b.openIssues ?? 0) > 2 ? WARNING : SUCCESS },
                      ].map(s => (
                        <div key={s.l} className="rounded-xl p-3 text-center" style={{ backgroundColor: "#F8FAFC" }}>
                          <div className="text-lg font-bold" style={{ color: s.c }}>{s.v}</div>
                          <div className="text-xs" style={{ color: MUTED }}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs pt-3 border-t" style={{ borderColor: "#F1F5F9" }}>
                      <span style={{ color: MUTED }}>Manager: <strong style={{ color: TEXT }}>{b.branchManagerName ?? "—"}</strong></span>
                      <span style={{ color: SUBTLE }}>{b.snapshotAt ? `Synced ${new Date(b.snapshotAt).toLocaleString()}` : "Never synced"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "comparison" && (
          <>
            {comparison && comparison.branches.every(b => b.history.length === 0) ? (
              <div className="bg-white rounded-xl border p-8 text-center mb-5" style={{ borderColor: BORDER }}><BarChart3 size={28} className="mx-auto mb-2" style={{ color: SUBTLE }} /><p className="text-sm" style={{ color: MUTED }}>No sync history yet — branches build up a real trend here as they push snapshots over time.</p></div>
            ) : (
              <div className="bg-white rounded-xl border p-5 mb-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy Trend by Branch (real sync history)</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="syncedAt" tick={{ fontSize: 10, fill: SUBTLE }} tickFormatter={(v: string) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })} axisLine={false} tickLine={false} allowDuplicatedCategory={false} />
                    <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} labelFormatter={(v: any) => new Date(v).toLocaleString()} formatter={(v: any, n: any) => [`${v}%`, n]} />
                    {comparison?.branches.map((b, i) => (
                      <Area key={b.branchId} data={b.history} type="monotone" dataKey="occupancyRate" name={b.branchName} stroke={[PRIMARY, TEAL, ORANGE, "#8B5CF6"][i % 4]} strokeWidth={2} fill={[PRIMARY, TEAL, ORANGE, "#8B5CF6"][i % 4] + "15"} dot={false} />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
              <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Occupancy % by Branch (latest)</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={overview.branches.map(b => ({ name: b.branchName, occ: b.occupancyRate ?? 0 }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: SUBTLE }} axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}%`]} />
                    <Bar key="occ-bar" dataKey="occ" name="Occupancy" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Revenue Share by Branch (today)</h3>
                {revCat.length === 0 ? <div className="text-sm text-center py-8" style={{ color: MUTED }}>No revenue data yet.</div> : (
                  <>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie key="portal-pie" data={revCat} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                          {revCat.map((e, i) => <Cell key={`cell-${i}`} fill={e.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: any) => [fmtN(v)]} contentStyle={{ border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 mt-2">
                      {revCat.map(c => (
                        <div key={c.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color }} /><span className="text-xs" style={{ color: MUTED }}>{c.name}</span></div>
                          <span className="text-xs font-semibold" style={{ color: TEXT }}>{totalRevForShare > 0 ? Math.round((c.value / totalRevForShare) * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>KPI Comparison Table</h3></div>
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Metric</th>{overview.branches.map(b => <th key={b.branchId} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{b.branchName}</th>)}</tr></thead>
                <tbody>
                  {[
                    { metric: "Occupancy %", vals: overview.branches.map(b => b.occupancyRate != null ? `${b.occupancyRate}%` : "—") },
                    { metric: "Revenue Today", vals: overview.branches.map(b => b.revenueToday != null ? fmtN(b.revenueToday) : "—") },
                    { metric: "Active Guests", vals: overview.branches.map(b => b.activeGuests?.toString() ?? "—") },
                    { metric: "Open Issues", vals: overview.branches.map(b => b.openIssues?.toString() ?? "—") },
                    { metric: "Total Rooms", vals: overview.branches.map(b => b.roomsTotal?.toString() ?? "—") },
                    { metric: "Manager", vals: overview.branches.map(b => b.branchManagerName ?? "—") },
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
          <div className="bg-white rounded-xl border p-8 text-center" style={{ borderColor: BORDER }}>
            <TrendingUp size={28} className="mx-auto mb-2" style={{ color: SUBTLE }} />
            <p className="text-sm" style={{ color: MUTED }}>Consolidated cross-branch reports (occupancy, revenue, guest analytics, staff attendance) aren't built centrally yet — only the Overview and Branch Comparison aggregations exist so far. Per-branch reports are real today in each branch's own Reports module.</p>
          </div>
        )}

        {tab === "sync" && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}>
                <div className="text-2xl font-bold mb-1" style={{ color: SUCCESS }}>{syncStatus.filter(s => s.lastSyncStatus === "ok").length}/{syncStatus.length}</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>Fully Synced</div>
              </div>
              <div className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}>
                <div className="text-2xl font-bold mb-1" style={{ color: ERROR }}>{syncStatus.filter(s => s.lastSyncStatus === "error").length}</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>Sync Errors</div>
              </div>
              <div className="bg-white rounded-xl p-5 border text-center" style={{ borderColor: BORDER }}>
                <div className="text-2xl font-bold mb-1" style={{ color: WARNING }}>{syncStatus.filter(s => s.lastSyncStatus === "never").length}</div>
                <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>Never Synced</div>
              </div>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Branch Sync Status</h3>
                <span className="text-xs" style={{ color: SUBTLE }}>Read-only — a branch can only push itself, this portal can't trigger it remotely</span>
              </div>
              {syncStatus.map(b => (
                <div key={b.branchId} className="flex items-center gap-4 px-5 py-4 border-b hover:bg-[#FAFBFD]" style={{ borderColor: "#F8FAFC" }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: b.lastSyncStatus === "ok" ? "#DCFCE7" : b.lastSyncStatus === "error" ? "#FEE2E2" : "#FEF3C7" }}>
                    <RefreshCw size={16} style={{ color: b.lastSyncStatus === "ok" ? SUCCESS : b.lastSyncStatus === "error" ? ERROR : WARNING }} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: TEXT }}>{b.branchName}</div>
                    <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>{b.lastSyncError ?? "No errors"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: SUBTLE }}>Last sync: {b.lastSyncAt ? new Date(b.lastSyncAt).toLocaleString() : "Never"}</div>
                  </div>
                  <Badge label={b.lastSyncStatus === "ok" ? "Synced" : b.lastSyncStatus === "error" ? "Error" : "Never Synced"} colors={b.lastSyncStatus === "ok" ? { bg: "#DCFCE7", text: "#166534" } : b.lastSyncStatus === "error" ? { bg: "#FEE2E2", text: "#991B1B" } : { bg: "#FEF3C7", text: "#92400E" }} />
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
                {[["Organization Name", overview.organizationName], ["Signed in as", `${me.firstName} ${me.lastName}`], ["Email", me.email], ["Plan Tier", overview.planTier]].map(([k, v]) => (
                  <div key={k}><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{k}</label><div className="px-3 py-2.5 rounded-xl border text-sm" style={{ borderColor: BORDER, color: TEXT }}>{v}</div></div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Remote Access</h3>
              <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}>
                <div className="text-sm font-semibold mb-1" style={{ color: "#92400E" }}>Live Branch Access</div>
                <p className="text-xs" style={{ color: "#92400E" }}>This portal shows synced data only. For live operational access (real-time reservation grid, live check-ins), connect via VPN to the hotel LAN and navigate to http://nexura.local</p>
              </div>
              <button onClick={() => showToast(`VPN configuration guide sent to ${me.email}`)} className="w-full py-2.5 rounded-xl text-sm font-medium border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>
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
