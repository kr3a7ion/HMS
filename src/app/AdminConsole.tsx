// Platform Admin Console — Platform Owner (Gideon) only.
// Served from: admin.yourplatform.com (cloud)
// This is a completely separate app layer from the hotel-facing HMS.
import { useState } from "react";
import {
  Building2, Users, Package, BarChart3, Settings, Bell, LogOut,
  Plus, Search, MoreHorizontal, CheckCircle2, AlertTriangle,
  RefreshCw, Shield, DollarSign, ChevronDown, X, Eye, Edit3,
  Server, Zap, Download, TrendingUp, Clock, Globe, Activity,
} from "lucide-react";

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
const NAV = "#0C1A36";
const sans = "'Inter', system-ui, sans-serif";
const mono = "'JetBrains Mono', monospace";

function fmtN(v: number) {
  return v >= 1e6 ? `₦${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `₦${(v / 1e3).toFixed(0)}K` : `₦${v}`;
}

const ORGS = [
  { id: "ORG-001", name: "Grand Palms Group", contact: "Alhaji Musa Ibrahim", email: "owner@grandpalms.ng", plan: "Business", branches: 3, billing: "Current", mrr: 285000, lastSync: "2m ago", status: "Active" },
  { id: "ORG-002", name: "Ibis Suites Ltd", contact: "Mrs. Toyin Adeyemi", email: "ceo@ibissuites.ng", plan: "Growth", branches: 2, billing: "Current", mrr: 95000, lastSync: "18m ago", status: "Active" },
  { id: "ORG-003", name: "Oasis Hotels", contact: "Dr. Emeka Obi", email: "admin@oasishotels.ng", plan: "Starter", branches: 1, billing: "Overdue", mrr: 25000, lastSync: "2d ago", status: "Active" },
  { id: "ORG-004", name: "Sahara Guesthouse", contact: "Mr. Babatunde Afolabi", email: "info@saharaguesthouse.ng", plan: "Starter", branches: 1, billing: "Suspended", mrr: 0, lastSync: "14d ago", status: "Suspended" },
  { id: "ORG-005", name: "Victoria Crown Hotel", contact: "Mrs. Chioma Eze", email: "accounts@victoriacrown.ng", plan: "Business", branches: 4, billing: "Current", mrr: 380000, lastSync: "5m ago", status: "Active" },
];

const BRANCHES_ALL = [
  { org: "Grand Palms Group", name: "Abuja Branch", ip: "192.168.1.1", lastSync: "2m ago", pendingItems: 0, version: "v2.4.1", status: "Online", rooms: 100 },
  { org: "Grand Palms Group", name: "Lagos Branch", ip: "10.0.0.1", lastSync: "45m ago", pendingItems: 5, version: "v2.4.1", status: "Online", rooms: 75 },
  { org: "Grand Palms Group", name: "Port Harcourt", ip: "172.16.0.1", lastSync: "3h ago", pendingItems: 0, version: "v2.4.0", status: "Online", rooms: 50 },
  { org: "Ibis Suites Ltd", name: "Victoria Island", ip: "192.168.2.1", lastSync: "18m ago", pendingItems: 2, version: "v2.4.1", status: "Online", rooms: 60 },
  { org: "Ibis Suites Ltd", name: "Ikeja Branch", ip: "192.168.3.1", lastSync: "1h ago", pendingItems: 0, version: "v2.3.9", status: "Online", rooms: 45 },
  { org: "Oasis Hotels", name: "Kano Branch", ip: "10.10.1.1", lastSync: "2d ago", pendingItems: 47, version: "v2.4.1", status: "Offline", rooms: 30 },
];

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  Business: { bg: "#EFF6FF", text: PRIMARY },
  Growth: { bg: "#CCFBF1", text: "#0F766E" },
  Starter: { bg: "#F3F4F6", text: MUTED },
};

const BILLING_COLORS: Record<string, { bg: string; text: string }> = {
  Current: { bg: "#DCFCE7", text: "#166534" },
  Overdue: { bg: "#FEF3C7", text: "#92400E" },
  Suspended: { bg: "#FEE2E2", text: "#991B1B" },
};

function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>{label}</span>;
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl p-5 border" style={{ borderColor: BORDER }}>
      <div className="text-2xl font-bold mb-1" style={{ color: color ?? TEXT }}>{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>{sub}</div>}
    </div>
  );
}

export default function AdminConsole({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<"orgs" | "branches" | "billing" | "updates" | "audit">("orgs");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const filteredOrgs = ORGS.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase()) || o.contact.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: "orgs", label: "Organizations", icon: Building2, count: ORGS.length },
    { id: "branches", label: "Branch Tracker", icon: Server, count: BRANCHES_ALL.length },
    { id: "billing", label: "Billing", icon: DollarSign },
    { id: "updates", label: "Updates", icon: RefreshCw },
    { id: "audit", label: "Audit Log", icon: Shield },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>

      {/* Header */}
      <header className="h-14 flex items-center px-6 gap-4 shadow-sm" style={{ backgroundColor: NAV, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}>
            <Shield size={14} color="white" />
          </div>
          <div>
            <span className="text-white font-semibold text-sm">Platform Admin Console</span>
            <span className="text-xs ml-2" style={{ color: "#64748B" }}>admin.yourplatform.com</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10">
            <Bell size={16} color="white" />
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center" style={{ fontSize: 8 }}>3</span>
          </button>
          <div className="relative">
            <button onClick={() => setUserMenu(p => !p)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: TEAL }}>G</div>
              <span className="text-xs text-white font-medium hidden sm:block">Gideon</span>
              <ChevronDown size={11} color="#94A3B8" />
            </button>
            {userMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl shadow-2xl border overflow-hidden z-50" style={{ backgroundColor: "white", borderColor: BORDER }}>
                <div className="px-3 py-2.5 border-b text-xs" style={{ borderColor: "#F1F5F9", color: MUTED }}>gideon@platform.com</div>
                <button onClick={() => { setUserMenu(false); onLogout(); }}
                  className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: ERROR }}>
                  <LogOut size={14} />Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex border-b bg-white" style={{ borderColor: BORDER }}>
        <div className="flex px-6">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap transition-colors"
                style={{ color: tab === t.id ? PRIMARY : MUTED, borderBottom: tab === t.id ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>
                <Icon size={15} />
                {t.label}
                {"count" in t && <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: tab === t.id ? "#EFF6FF" : "#F1F5F9", color: tab === t.id ? PRIMARY : MUTED }}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {/* Stats row */}
        {tab === "orgs" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Stat label="Total Organizations" value={ORGS.length.toString()} sub="3 active plans" />
              <Stat label="Total Branches" value={BRANCHES_ALL.length.toString()} sub="5 online · 1 offline" color={PRIMARY} />
              <Stat label="Monthly Revenue" value={fmtN(ORGS.reduce((s, o) => s + o.mrr, 0))} sub="Across all clients" color={SUCCESS} />
              <Stat label="Overdue Accounts" value={ORGS.filter(o => o.billing === "Overdue").length.toString()} sub="Action required" color={WARNING} />
              <Stat label="Suspended" value={ORGS.filter(o => o.status === "Suspended").length.toString()} sub="Revenue at risk" color={ERROR} />
            </div>

            {/* Orgs table */}
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Client Organizations</h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations…"
                      className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} />
                  </div>
                  <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>
                    <Plus size={14} />New Organization
                  </button>
                </div>
              </div>
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Organization", "Plan", "Branches", "MRR", "Billing", "Last Sync", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredOrgs.map(o => (
                    <tr key={o.id} className="border-t hover:bg-[#FAFBFD] cursor-pointer transition-colors" style={{ borderColor: "#F1F5F9" }}
                      onClick={() => setSelectedOrg(selectedOrg === o.id ? null : o.id)}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{o.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div>
                          <div><div className="text-sm font-semibold" style={{ color: TEXT }}>{o.name}</div><div className="text-xs" style={{ color: MUTED }}>{o.contact} · {o.email}</div></div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><Badge label={o.plan} colors={PLAN_COLORS[o.plan] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                      <td className="px-5 py-4 text-sm font-semibold" style={{ color: TEXT }}>{o.branches}</td>
                      <td className="px-5 py-4 text-sm font-semibold" style={{ color: SUCCESS }}>{fmtN(o.mrr)}<span className="text-xs font-normal ml-0.5" style={{ color: SUBTLE }}>/mo</span></td>
                      <td className="px-5 py-4"><Badge label={o.billing} colors={BILLING_COLORS[o.billing] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                      <td className="px-5 py-4 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{o.lastSync}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: o.status === "Active" ? SUCCESS : ERROR }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: o.status === "Active" ? SUCCESS : ERROR }} />{o.status}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1">
                          <button onClick={e => { e.stopPropagation(); showToast(`Managing modules for ${o.name}`); }} className="text-xs px-2 py-1 rounded border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Modules</button>
                          <button onClick={e => { e.stopPropagation(); showToast(o.status === "Active" ? `${o.name} suspended` : `${o.name} reactivated`); }} className="text-xs px-2 py-1 rounded border" style={{ color: o.status === "Active" ? ERROR : SUCCESS, borderColor: o.status === "Active" ? `${ERROR}20` : `${SUCCESS}30` }}>
                            {o.status === "Active" ? "Suspend" : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Expanded org detail */}
            {selectedOrg && (() => {
              const org = ORGS.find(o => o.id === selectedOrg)!;
              const orgBranches = BRANCHES_ALL.filter(b => b.org === org.name);
              return (
                <div className="mt-4 bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold" style={{ color: TEXT }}>{org.name} — Branch Details</h3>
                    <button onClick={() => setSelectedOrg(null)} style={{ color: SUBTLE }}><X size={16} /></button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {orgBranches.map(b => (
                      <div key={b.name} className="p-4 rounded-xl border" style={{ borderColor: BORDER }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-semibold" style={{ color: TEXT }}>{b.name}</div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: b.status === "Online" ? SUCCESS : ERROR }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.status === "Online" ? SUCCESS : ERROR }} />{b.status}
                          </div>
                        </div>
                        <div className="space-y-1 text-xs" style={{ color: MUTED }}>
                          <div className="flex justify-between"><span>IP Address</span><span style={{ fontFamily: mono, color: TEXT }}>{b.ip}</span></div>
                          <div className="flex justify-between"><span>Last Sync</span><span style={{ color: b.pendingItems > 0 ? WARNING : SUBTLE }}>{b.lastSync}</span></div>
                          <div className="flex justify-between"><span>Pending Items</span><span style={{ color: b.pendingItems > 0 ? WARNING : SUBTLE }}>{b.pendingItems}</span></div>
                          <div className="flex justify-between"><span>Version</span><span style={{ fontFamily: mono, color: TEXT }}>{b.version}</span></div>
                          <div className="flex justify-between"><span>Rooms</span><span style={{ color: TEXT }}>{b.rooms}</span></div>
                        </div>
                        <div className="flex gap-1.5 mt-3">
                          <button onClick={() => showToast(`Force sync — ${b.name}`)} className="flex-1 py-1.5 rounded-lg text-xs border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Force Sync</button>
                          <button onClick={() => showToast(`Viewing logs — ${b.name}`)} className="flex-1 py-1.5 rounded-lg text-xs border" style={{ color: MUTED, borderColor: BORDER }}>Logs</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {tab === "branches" && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <Stat label="Total Branches" value={BRANCHES_ALL.length.toString()} sub="Across all clients" />
              <Stat label="Online" value={BRANCHES_ALL.filter(b => b.status === "Online").length.toString()} color={SUCCESS} />
              <Stat label="Need Attention" value={BRANCHES_ALL.filter(b => b.pendingItems > 0 || b.status === "Offline").length.toString()} color={WARNING} />
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Branch Provisioning Tracker</h3>
                <div className="flex gap-2">
                  <button onClick={() => showToast("Force update sent to all branches")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border" style={{ color: MUTED, borderColor: BORDER }}>
                    <RefreshCw size={13} />Force Update All
                  </button>
                </div>
              </div>
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Branch", "Organization", "IP Address", "Last Sync", "Pending", "Version", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>
                  {BRANCHES_ALL.map((b, i) => (
                    <tr key={i} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{b.name}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{b.org}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: TEXT, fontFamily: mono }}>{b.ip}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: SUBTLE }}>{b.lastSync}</td>
                      <td className="px-5 py-3">{b.pendingItems > 0 ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}>{b.pendingItems}</span> : <span className="text-xs" style={{ color: SUBTLE }}>—</span>}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: TEXT, fontFamily: mono }}>{b.version}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.status === "Online" ? SUCCESS : ERROR }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.status === "Online" ? SUCCESS : ERROR }} />{b.status}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => showToast(`Sync triggered — ${b.name}`)} className="text-xs px-2 py-1 rounded border" style={{ color: TEAL, borderColor: `${TEAL}30` }}>Sync</button>
                          <button onClick={() => showToast(`Update pushed — ${b.name}`)} className="text-xs px-2 py-1 rounded border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Update</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "billing" && (
          <div>
            <div className="grid grid-cols-4 gap-4 mb-5">
              <Stat label="Monthly Revenue" value={fmtN(ORGS.reduce((s, o) => s + o.mrr, 0))} sub="All active clients" color={SUCCESS} />
              <Stat label="Overdue Accounts" value="1" sub="₦25,000 at risk" color={WARNING} />
              <Stat label="Suspended" value="1" sub="₦0 MRR" color={ERROR} />
              <Stat label="Annual Run Rate" value={fmtN(ORGS.reduce((s, o) => s + o.mrr, 0) * 12)} sub="Projected" />
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Billing Overview</h3>
              </div>
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Organization", "Plan", "Branches", "MRR", "Next Invoice", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>
                  {ORGS.map(o => (
                    <tr key={o.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{o.name}</td>
                      <td className="px-5 py-3"><Badge label={o.plan} colors={PLAN_COLORS[o.plan] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                      <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{o.branches}</td>
                      <td className="px-5 py-3 text-sm font-bold" style={{ color: TEXT }}>{fmtN(o.mrr)}</td>
                      <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>1 Jul 2025</td>
                      <td className="px-5 py-3"><Badge label={o.billing} colors={BILLING_COLORS[o.billing] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => showToast(`Invoice sent — ${o.name}`)} className="text-xs px-2 py-1 rounded border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Invoice</button>
                          {o.billing === "Overdue" && <button onClick={() => showToast(`Reminder sent — ${o.name}`)} className="text-xs px-2 py-1 rounded border" style={{ color: WARNING, borderColor: `${WARNING}40` }}>Remind</button>}
                          {o.billing === "Suspended" && <button onClick={() => showToast(`${o.name} reactivated`)} className="text-xs px-2 py-1 rounded border" style={{ color: SUCCESS, borderColor: `${SUCCESS}30` }}>Reactivate</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "updates" && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <Stat label="Current Stable" value="v2.4.1" sub="Released 20 Jun 2025" />
              <Stat label="Branches Up-to-date" value="4/6" color={PRIMARY} />
              <Stat label="Pending Update" value="2" sub="v2.3.9 → v2.4.1" color={WARNING} />
            </div>
            <div className="bg-white rounded-xl border p-5 mb-4" style={{ borderColor: BORDER }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: TEXT }}>Deployment Controls</h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                  { label: "Push Stable to All", desc: "Send v2.4.1 to all branches not yet updated", action: "Push v2.4.1", color: PRIMARY },
                  { label: "Force Update All", desc: "Immediately trigger update check on all connected branches", action: "Force Update", color: TEAL },
                  { label: "Emergency Rollback", desc: "Roll back all branches to v2.4.0 (previous stable)", action: "Rollback to v2.4.0", color: ERROR },
                ].map(c => (
                  <div key={c.label} className="p-4 rounded-xl border" style={{ borderColor: BORDER }}>
                    <div className="text-sm font-semibold mb-1" style={{ color: TEXT }}>{c.label}</div>
                    <div className="text-xs mb-3" style={{ color: MUTED }}>{c.desc}</div>
                    <button onClick={() => showToast(`${c.action} initiated`)} className="px-4 py-2 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: c.color }}>{c.action}</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Version Status by Branch</h3></div>
              <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Branch", "Org", "Current Version", "Latest", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>{BRANCHES_ALL.map((b, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{b.name}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{b.org}</td><td className="px-5 py-3 text-xs font-mono" style={{ color: TEXT, fontFamily: mono }}>{b.version}</td><td className="px-5 py-3"><Badge label={b.version === "v2.4.1" ? "Up to date" : "Update available"} colors={b.version === "v2.4.1" ? { bg: "#DCFCE7", text: "#166534" } : { bg: "#FEF3C7", text: "#92400E" }} /></td><td className="px-5 py-3">{b.version !== "v2.4.1" && <button onClick={() => showToast(`Update pushed — ${b.name}`)} className="text-xs px-2 py-1 rounded border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Push Update</button>}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
              <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Platform Audit Log</h3>
              <button onClick={() => showToast("CSV downloaded")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border" style={{ color: MUTED, borderColor: BORDER }}><Download size={13} />Export</button>
            </div>
            <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "Actor", "Action", "Entity", "IP"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  { ts: "24 Jun 09:00:12", actor: "Gideon (Platform Owner)", action: "Organization Created", entity: "Victoria Crown Hotel", ip: "197.210.xx.xx" },
                  { ts: "24 Jun 08:45:30", actor: "Gideon (Platform Owner)", action: "Module Enabled: Door Lock", entity: "Grand Palms Group", ip: "197.210.xx.xx" },
                  { ts: "24 Jun 08:30:00", actor: "Gideon (Platform Owner)", action: "Force Update Pushed", entity: "Ibis Suites — Ikeja", ip: "197.210.xx.xx" },
                  { ts: "23 Jun 23:15:44", actor: "System", action: "Billing Overdue Flag Set", entity: "Oasis Hotels", ip: "—" },
                  { ts: "23 Jun 18:00:00", actor: "System", action: "Scheduled Backup Completed", entity: "All Branches", ip: "—" },
                  { ts: "23 Jun 12:00:00", actor: "Gideon (Platform Owner)", action: "Account Suspended", entity: "Sahara Guesthouse", ip: "197.210.xx.xx" },
                ].map((l, i) => <tr key={i} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{l.ts}</td><td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{l.actor}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{l.action}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{l.entity}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{l.ip}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create Org Modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-40" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={() => setShowCreate(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6" style={{ border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold" style={{ color: TEXT }}>New Organization</h3>
              <button onClick={() => setShowCreate(false)} style={{ color: SUBTLE }}><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {[["Organization Name", "Grand Meridian Hotels"], ["Contact Name", "Full name of the owner/GM"], ["Contact Email", "owner@example.ng"], ["Phone Number", "+234 8XX XXX XXXX"]].map(([label, placeholder]) => (
                <div key={label}>
                  <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>{label}</label>
                  <input placeholder={placeholder} className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Subscription Plan</label>
                <select className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }}>
                  <option>Starter — ₦15,000–₦25,000/month · 5–15 rooms</option>
                  <option>Growth — ₦35,000–₦60,000/month · 15–50 rooms</option>
                  <option>Business — ₦80,000–₦150,000/month · 50+ rooms</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Number of Branches</label>
                <input type="number" defaultValue="1" min="1" className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={() => { setShowCreate(false); showToast("Organization created. Provisioning token generated — check your email."); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>
                Create & Generate Provisioning Token
              </button>
            </div>
          </div>
        </>
      )}

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
