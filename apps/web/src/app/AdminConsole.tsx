// Platform Admin Console — Platform Owner (Gideon) only (Auth doc Part 3).
// Served from: admin.nexura.app (cloud, central-server/)
// Real central-server login, real organization/branch data from
// GET /organizations, /organizations/branches/all, /organizations/:id/*.
// TOTP MFA (Auth doc 3.5, "mandatory, no bypass") is NOT implemented -- see
// central-server/src/routes/auth.ts and ROADMAP.md. Updates/deployment
// controls (Phase 4: Docker packaging, auto-updater, staged rollout) and
// billing/MRR (no payment processor integrated, and Blueprint 0.8 itself
// says pricing needs validating before it's locked in) stay honest
// placeholders, not faked.
import { useState, useEffect } from "react";
import {
  Building2, Users, Package, BarChart3, Settings, Bell, LogOut,
  Plus, Search, MoreHorizontal, CheckCircle2, AlertTriangle,
  RefreshCw, Shield, DollarSign, ChevronDown, X, Eye, Edit3,
  Server, Zap, Download, TrendingUp, Clock, Globe, Activity,
} from "lucide-react";
import {
  adminAuthApi, platformApi, CentralApiError, CentralNetworkError,
  type AdminUser, type OrganizationSummary, type OrganizationDetail, type AllBranchesEntry, type PlatformAuditEntry,
} from "./lib/centralApi";

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

const PLAN_COLORS: Record<string, { bg: string; text: string }> = {
  business: { bg: "#EFF6FF", text: PRIMARY },
  growth: { bg: "#CCFBF1", text: "#0F766E" },
  starter: { bg: "#F3F4F6", text: MUTED },
};
const BILLING_COLORS: Record<string, { bg: string; text: string }> = {
  current: { bg: "#DCFCE7", text: "#166534" },
  overdue: { bg: "#FEF3C7", text: "#92400E" },
  suspended: { bg: "#FEE2E2", text: "#991B1B" },
};
const MODULE_KEYS = ["restaurant", "inventory", "multiBranch", "doorLock"] as const;

function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize" style={{ backgroundColor: colors.bg, color: colors.text }}>{label}</span>;
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

// Auth doc 3.5: TOTP mandatory, no bypass. Three steps: password, then
// either first-time enrollment (show secret, confirm a code) or plain
// verification (just a code) depending on what /auth/admin/login reports.
function AdminLogin({ onLoggedIn, onBack }: { onLoggedIn: (u: AdminUser) => void; onBack: () => void }) {
  const [step, setStep] = useState<"credentials" | "enroll" | "verify">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [enrollSecret, setEnrollSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const describeError = (e: unknown, fallback: string) => {
    if (e instanceof CentralApiError && e.code === "LOCKED_OUT") {
      const until = typeof e.body.lockedUntil === "string" ? new Date(e.body.lockedUntil).toLocaleTimeString() : "shortly";
      return `Too many failed attempts. Locked out until ${until}.`;
    }
    if (e instanceof CentralApiError && e.code === "INVALID_CREDENTIALS") return "Incorrect email or password.";
    if (e instanceof CentralApiError && e.code === "INVALID_CODE") return "Incorrect code — check your authenticator app and try again.";
    if (e instanceof CentralNetworkError) return "Couldn't reach the central server. Start it with: cd central-server && npm run dev";
    return fallback;
  };

  const submitCredentials = async () => {
    setLoading(true); setError("");
    try {
      const res = await adminAuthApi.login(email, password);
      if (res.setupRequired) {
        const enroll = await adminAuthApi.mfaEnrollStart();
        setEnrollSecret(enroll);
        setStep("enroll");
      } else {
        setStep("verify");
      }
    } catch (e) { setError(describeError(e, "Login failed.")); }
    finally { setLoading(false); }
  };

  const submitEnrollConfirm = async () => {
    setLoading(true); setError("");
    try {
      const { user } = await adminAuthApi.mfaEnrollConfirm(code);
      onLoggedIn(user);
    } catch (e) { setError(describeError(e, "Couldn't confirm MFA setup.")); }
    finally { setLoading(false); }
  };

  const submitVerify = async () => {
    setLoading(true); setError("");
    try {
      const { user } = await adminAuthApi.mfaVerify(code);
      onLoggedIn(user);
    } catch (e) { setError(describeError(e, "Couldn't verify code.")); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}><Shield size={18} color="white" /></div>
          <div className="text-lg font-bold" style={{ color: TEXT }}>Platform Admin Console</div>
        </div>
        <div className="bg-white rounded-2xl p-6 border shadow-sm" style={{ borderColor: BORDER }}>
          {error && <div className="px-3 py-2 rounded-lg mb-3 text-xs" style={{ backgroundColor: "#FEF2F2", color: ERROR, border: "1px solid #FECACA" }}>{error}</div>}

          {step === "credentials" && (
            <>
              <p className="text-xs mb-4" style={{ color: MUTED }}>Platform Owner only (Auth doc Part 3). TOTP MFA is mandatory — you'll be prompted for a code next.</p>
              <div className="space-y-3">
                <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && submitCredentials()} className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && submitCredentials()} className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
              <button onClick={submitCredentials} disabled={loading} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{loading ? "Signing in…" : "Sign In"}</button>
              <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "#F1F5F9", color: SUBTLE }}>Seeded demo: <span style={{ fontFamily: mono }}>platform-owner@nexura.app</span> / <span style={{ fontFamily: mono }}>demo123</span></div>
            </>
          )}

          {step === "enroll" && enrollSecret && (
            <>
              <p className="text-xs mb-3" style={{ color: MUTED }}>First login — set up an authenticator app (Google Authenticator, Authy, 1Password, etc). Add this key manually, since there's no QR scanner here:</p>
              <div className="px-3 py-2.5 rounded-lg mb-3 text-center" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${BORDER}` }}>
                <div className="text-sm font-semibold select-all" style={{ color: TEXT, fontFamily: mono, letterSpacing: "0.05em" }}>{enrollSecret.secret.match(/.{1,4}/g)?.join(" ")}</div>
              </div>
              <p className="text-xs mb-1" style={{ color: MUTED }}>Then enter the 6-digit code it generates:</p>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && submitEnrollConfirm()} placeholder="000000" className="w-full px-3 py-2.5 rounded-lg border text-center text-lg outline-none" style={{ borderColor: BORDER, fontFamily: mono, letterSpacing: "0.3em" }} />
              <button onClick={submitEnrollConfirm} disabled={loading || code.length !== 6} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{loading ? "Confirming…" : "Confirm & Enable MFA"}</button>
            </>
          )}

          {step === "verify" && (
            <>
              <p className="text-xs mb-3" style={{ color: MUTED }}>Enter the 6-digit code from your authenticator app.</p>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={e => e.key === "Enter" && submitVerify()} placeholder="000000" autoFocus className="w-full px-3 py-2.5 rounded-lg border text-center text-lg outline-none" style={{ borderColor: BORDER, fontFamily: mono, letterSpacing: "0.3em" }} />
              <button onClick={submitVerify} disabled={loading || code.length !== 6} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: PRIMARY }}>{loading ? "Verifying…" : "Verify"}</button>
            </>
          )}
        </div>
        <button onClick={onBack} className="w-full mt-4 text-xs text-center" style={{ color: MUTED }}>← Back to branch login</button>
      </div>
    </div>
  );
}

export default function AdminConsole({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<AdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [tab, setTab] = useState<"orgs" | "branches" | "billing" | "updates" | "audit">("orgs");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrganizationDetail | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [orgs, setOrgs] = useState<OrganizationSummary[]>([]);
  const [allBranches, setAllBranches] = useState<AllBranchesEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [newOrg, setNewOrg] = useState({ name: "", planTier: "starter" as const, adminEmail: "", adminFirstName: "", adminLastName: "" });
  const [auditOrgId, setAuditOrgId] = useState<string>("");
  const [auditLog, setAuditLog] = useState<PlatformAuditEntry[]>([]);
  const [provisionName, setProvisionName] = useState("");
  const [provisionedKey, setProvisionedKey] = useState<{ name: string; syncKey: string } | null>(null);
  const [rollbackInputs, setRollbackInputs] = useState<Record<string, string>>({});

  useEffect(() => { adminAuthApi.me().then(setMe).catch(() => {}).finally(() => setCheckingSession(false)); }, []);

  const loadData = () => {
    setLoadingData(true);
    Promise.all([platformApi.listOrganizations(), platformApi.listAllBranches()])
      .then(([o, b]) => { setOrgs(o); setAllBranches(b); })
      .catch(() => showToast("Couldn't load platform data"))
      .finally(() => setLoadingData(false));
  };
  useEffect(() => { if (me) loadData(); }, [me]);
  useEffect(() => { if (orgs.length > 0 && !auditOrgId) setAuditOrgId(orgs[0].id); }, [orgs]);
  useEffect(() => { if (auditOrgId) platformApi.orgAuditLog(auditOrgId).then(setAuditLog).catch(() => {}); }, [auditOrgId]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const signOut = async () => {
    setUserMenu(false);
    try { await adminAuthApi.logout(); } catch { /* best-effort */ }
    setMe(null);
    onLogout();
  };

  const openOrg = async (id: string) => {
    if (selectedOrg === id) { setSelectedOrg(null); setOrgDetail(null); return; }
    setSelectedOrg(id);
    try { setOrgDetail(await platformApi.getOrganization(id)); } catch { showToast("Couldn't load organization detail"); }
  };

  const toggleBilling = async (o: OrganizationSummary) => {
    const next = o.billingStatus === "suspended" ? "current" : "suspended";
    try {
      await platformApi.setBillingStatus(o.id, next);
      showToast(`${o.name} ${next === "suspended" ? "suspended" : "reactivated"}`);
      loadData();
    } catch { showToast("Couldn't update billing status"); }
  };

  const toggleModule = async (o: OrganizationSummary, key: string) => {
    const next = o.enabledModules.includes(key) ? o.enabledModules.filter(m => m !== key) : [...o.enabledModules, key];
    try {
      await platformApi.setModules(o.id, next);
      showToast(`${o.name}: ${key} ${next.includes(key) ? "enabled" : "disabled"}`);
      loadData();
    } catch { showToast("Couldn't update module licensing"); }
  };

  const createOrg = async () => {
    if (!newOrg.name.trim() || !newOrg.adminEmail.trim() || !newOrg.adminFirstName.trim() || !newOrg.adminLastName.trim()) { showToast("Fill in organization name and Super Admin details"); return; }
    try {
      const res = await platformApi.createOrganization(newOrg);
      setShowCreate(false);
      setNewOrg({ name: "", planTier: "starter", adminEmail: "", adminFirstName: "", adminLastName: "" });
      showToast(`${newOrg.name} created — Super Admin temp password: ${res.superAdmin.tempPassword}`);
      loadData();
    } catch (e) { showToast(e instanceof CentralApiError && e.code === "EMAIL_IN_USE" ? "That admin email is already in use" : "Couldn't create organization"); }
  };

  const forceUpdate = async (b: AllBranchesEntry) => {
    try { await platformApi.forceUpdateBranch(b.id); showToast(`Force update requested — ${b.name} will pick it up on its next sync pull`); loadData(); }
    catch { showToast("Couldn't request force update"); }
  };

  const rollback = async (b: AllBranchesEntry) => {
    const version = (rollbackInputs[b.id] ?? "").trim();
    if (!version) { showToast("Enter a version to roll back to"); return; }
    try {
      await platformApi.rollbackBranch(b.id, version);
      showToast(`Rollback to ${version} requested for ${b.name}`);
      setRollbackInputs(p => ({ ...p, [b.id]: "" }));
      loadData();
    } catch { showToast("Couldn't request rollback"); }
  };

  const setBranchChannel = async (b: AllBranchesEntry, channel: "stable" | "beta") => {
    try { await platformApi.setBranchChannel(b.id, channel); showToast(`${b.name} moved to ${channel} channel`); loadData(); }
    catch { showToast("Couldn't update update channel"); }
  };

  const provisionBranch = async () => {
    if (!selectedOrg || !provisionName.trim()) return;
    try {
      const res = await platformApi.provisionBranch(selectedOrg, provisionName);
      setProvisionedKey({ name: res.name, syncKey: res.syncKey });
      setProvisionName("");
      setOrgDetail(await platformApi.getOrganization(selectedOrg));
      loadData();
    } catch { showToast("Couldn't provision branch"); }
  };

  if (checkingSession) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F0F4F8" }}><div className="text-sm" style={{ color: MUTED }}>Loading…</div></div>;
  if (!me) return <AdminLogin onLoggedIn={setMe} onBack={onLogout} />;
  if (loadingData) return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#F0F4F8" }}><div className="text-sm" style={{ color: MUTED }}>Loading platform data…</div></div>;

  const filteredOrgs = orgs.filter(o => !search || o.name.toLowerCase().includes(search.toLowerCase()));
  const onlineBranches = allBranches.filter(b => b.lastSyncStatus === "ok").length;
  const needsAttention = allBranches.filter(b => b.lastSyncStatus !== "ok").length;

  const tabs = [
    { id: "orgs", label: "Organizations", icon: Building2, count: orgs.length },
    { id: "branches", label: "Branch Tracker", icon: Server, count: allBranches.length },
    { id: "billing", label: "Billing", icon: DollarSign },
    { id: "updates", label: "Updates", icon: RefreshCw },
    { id: "audit", label: "Audit Log", icon: Shield },
  ] as const;

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>

      {/* Header */}
      <header className="h-14 flex items-center px-6 gap-4 shadow-sm" style={{ backgroundColor: NAV, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}><Shield size={14} color="white" /></div>
          <div>
            <span className="text-white font-semibold text-sm">Platform Admin Console</span>
            <span className="text-xs ml-2" style={{ color: "#64748B" }}>admin.nexura.app</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10" title="Refresh"><RefreshCw size={16} color="white" /></button>
          <div className="relative">
            <button onClick={() => setUserMenu(p => !p)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: TEAL }}>{me.firstName[0]}</div>
              <span className="text-xs text-white font-medium hidden sm:block">{me.firstName}</span>
              <ChevronDown size={11} color="#94A3B8" />
            </button>
            {userMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-xl shadow-2xl border overflow-hidden z-50" style={{ backgroundColor: "white", borderColor: BORDER }}>
                <div className="px-3 py-2.5 border-b text-xs" style={{ borderColor: "#F1F5F9", color: MUTED }}>{me.email}</div>
                <button onClick={signOut} className="flex items-center gap-2 w-full px-3 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: ERROR }}><LogOut size={14} />Sign Out</button>
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
                <Icon size={15} />{t.label}
                {"count" in t && <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: tab === t.id ? "#EFF6FF" : "#F1F5F9", color: tab === t.id ? PRIMARY : MUTED }}>{t.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">

        {tab === "orgs" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <Stat label="Total Organizations" value={orgs.length.toString()} />
              <Stat label="Total Branches" value={allBranches.length.toString()} sub={`${onlineBranches} synced · ${needsAttention} need attention`} color={PRIMARY} />
              <Stat label="Overdue Accounts" value={orgs.filter(o => o.billingStatus === "overdue").length.toString()} sub="Action required" color={WARNING} />
              <Stat label="Suspended" value={orgs.filter(o => o.billingStatus === "suspended").length.toString()} sub="Access blocked" color={ERROR} />
            </div>

            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
                <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Client Organizations</h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations…" className="pl-7 pr-3 py-1.5 text-xs rounded-lg border bg-white outline-none w-48" style={{ borderColor: BORDER }} />
                  </div>
                  <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}><Plus size={14} />New Organization</button>
                </div>
              </div>
              {filteredOrgs.length === 0 ? <div className="p-8 text-center text-sm" style={{ color: MUTED }}>No organizations match.</div> : (
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Organization", "Plan", "Branches", "Modules", "Billing", "Last Sync", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {filteredOrgs.map(o => (
                      <tr key={o.id} className="border-t hover:bg-[#FAFBFD] cursor-pointer transition-colors" style={{ borderColor: "#F1F5F9" }} onClick={() => openOrg(o.id)}>
                        <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: PRIMARY }}>{o.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</div><div className="text-sm font-semibold" style={{ color: TEXT }}>{o.name}</div></div></td>
                        <td className="px-5 py-4"><Badge label={o.planTier} colors={PLAN_COLORS[o.planTier] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                        <td className="px-5 py-4 text-sm font-semibold" style={{ color: TEXT }}>{o.branchCount}</td>
                        <td className="px-5 py-4 text-xs" style={{ color: MUTED }}>{o.enabledModules.length}/{MODULE_KEYS.length}</td>
                        <td className="px-5 py-4"><Badge label={o.billingStatus} colors={BILLING_COLORS[o.billingStatus] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                        <td className="px-5 py-4 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{o.lastSyncAt ? new Date(o.lastSyncAt).toLocaleString() : "Never"}</td>
                        <td className="px-5 py-4">
                          <div className="flex gap-1">
                            <button onClick={e => { e.stopPropagation(); openOrg(o.id); }} className="text-xs px-2 py-1 rounded border" style={{ color: PRIMARY, borderColor: `${PRIMARY}30` }}>Manage</button>
                            <button onClick={e => { e.stopPropagation(); toggleBilling(o); }} className="text-xs px-2 py-1 rounded border" style={{ color: o.billingStatus === "suspended" ? SUCCESS : ERROR, borderColor: o.billingStatus === "suspended" ? `${SUCCESS}30` : `${ERROR}20` }}>{o.billingStatus === "suspended" ? "Reactivate" : "Suspend"}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedOrg && orgDetail && (
              <div className="mt-4 bg-white rounded-xl border p-5" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold" style={{ color: TEXT }}>{orgDetail.name} — Details</h3>
                  <button onClick={() => { setSelectedOrg(null); setOrgDetail(null); setProvisionedKey(null); }} style={{ color: SUBTLE }}><X size={16} /></button>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Enabled Modules</div>
                  <div className="flex gap-2 flex-wrap">{MODULE_KEYS.map(k => { const on = orgDetail.enabledModules.includes(k); return <button key={k} onClick={() => toggleModule(orgs.find(o => o.id === selectedOrg)!, k)} className="text-xs px-3 py-1.5 rounded-lg border capitalize" style={{ backgroundColor: on ? "#EFF6FF" : "white", color: on ? PRIMARY : MUTED, borderColor: on ? `${PRIMARY}40` : BORDER }}>{k}{on ? " ✓" : ""}</button>; })}</div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Super Admins</div>
                  <div className="space-y-1">{orgDetail.admins.map(a => <div key={a.id} className="text-sm" style={{ color: TEXT }}>{a.firstName} {a.lastName} — <span style={{ color: MUTED, fontFamily: mono }}>{a.email}</span></div>)}</div>
                </div>

                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: MUTED }}>Branches</div>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
                    {orgDetail.branches.map(b => (
                      <div key={b.id} className="p-4 rounded-xl border" style={{ borderColor: BORDER }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-semibold" style={{ color: TEXT }}>{b.name}</div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: b.lastSyncStatus === "ok" ? SUCCESS : WARNING }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.lastSyncStatus === "ok" ? SUCCESS : WARNING }} />{b.lastSyncStatus === "ok" ? "Synced" : b.lastSyncStatus === "error" ? "Error" : "Never"}</div>
                        </div>
                        <div className="text-xs" style={{ color: MUTED }}>Last sync: {b.lastSyncAt ? new Date(b.lastSyncAt).toLocaleString() : "Never"}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={provisionName} onChange={e => setProvisionName(e.target.value)} placeholder="New branch name" className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: BORDER }} />
                    <button onClick={provisionBranch} className="px-3 py-2 rounded-lg text-xs font-medium text-white" style={{ backgroundColor: TEAL }}>Provision Branch</button>
                  </div>
                  {provisionedKey && (
                    <div className="mt-3 p-3 rounded-lg text-xs" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
                      <strong>{provisionedKey.name}</strong> provisioned. Sync key (shown once — configure the branch's local server with this): <span style={{ fontFamily: mono }}>{provisionedKey.syncKey}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === "branches" && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-5">
              <Stat label="Total Branches" value={allBranches.length.toString()} sub="Across all clients" />
              <Stat label="Synced" value={onlineBranches.toString()} color={SUCCESS} />
              <Stat label="Need Attention" value={needsAttention.toString()} color={WARNING} />
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Branch Provisioning Tracker</h3></div>
              {allBranches.length === 0 ? <div className="p-8 text-center text-sm" style={{ color: MUTED }}>No branches provisioned yet.</div> : (
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Branch", "Organization", "Last Sync", "Status"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {allBranches.map(b => (
                      <tr key={b.id} className="border-t hover:bg-[#FAFBFD] transition-colors" style={{ borderColor: "#F1F5F9" }}>
                        <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{b.name}</td>
                        <td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{b.organizationName}</td>
                        <td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{b.lastSyncAt ? new Date(b.lastSyncAt).toLocaleString() : "Never"}</td>
                        <td className="px-5 py-3"><div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.lastSyncStatus === "ok" ? SUCCESS : ERROR }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.lastSyncStatus === "ok" ? SUCCESS : ERROR }} />{b.lastSyncStatus === "ok" ? "Synced" : b.lastSyncStatus === "error" ? `Error: ${b.lastSyncError}` : "Never Synced"}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "billing" && (
          <div>
            <div className="bg-white rounded-xl border p-4 mb-5 text-xs" style={{ borderColor: BORDER, backgroundColor: "#FFFBEB", color: "#92400E" }}>
              No payment processor is integrated — billing status below is a real flag (gates nothing yet but is genuinely persisted and toggleable), not live invoicing. Blueprint 0.8's pricing tiers are explicitly illustrative, "validate before locking in."
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Billing Status</h3></div>
              <table className="w-full">
                <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Organization", "Plan", "Branches", "Status", ""].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>
                  {orgs.map(o => (
                    <tr key={o.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}>
                      <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{o.name}</td>
                      <td className="px-5 py-3"><Badge label={o.planTier} colors={PLAN_COLORS[o.planTier] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                      <td className="px-5 py-3 text-sm" style={{ color: MUTED }}>{o.branchCount}</td>
                      <td className="px-5 py-3"><Badge label={o.billingStatus} colors={BILLING_COLORS[o.billingStatus] ?? { bg: "#F1F5F9", text: MUTED }} /></td>
                      <td className="px-5 py-3"><button onClick={() => toggleBilling(o)} className="text-xs px-2 py-1 rounded border" style={{ color: o.billingStatus === "suspended" ? SUCCESS : ERROR, borderColor: o.billingStatus === "suspended" ? `${SUCCESS}30` : `${ERROR}20` }}>{o.billingStatus === "suspended" ? "Reactivate" : "Suspend"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "updates" && (
          <div>
            <div className="bg-white rounded-xl border p-4 mb-5 text-xs" style={{ borderColor: BORDER, backgroundColor: "#EFF6FF", color: PRIMARY }}>
              Force Update and Rollback only set a flag/target-version here — the branch's local server picks it up on its own next sync pull and applies it, then acknowledges. This can't reach into a branch's LAN directly (Auth/Distribution doc Part 11, offline-first). The actual container swap on the branch side requires a real Docker daemon and registry, which this environment doesn't have — see ROADMAP.md for what's verified vs. not.
            </div>
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}><h3 className="text-sm font-semibold" style={{ color: TEXT }}>Deployment Control</h3></div>
              {allBranches.length === 0 ? <div className="p-8 text-center text-sm" style={{ color: MUTED }}>No branches provisioned yet.</div> : (
                <table className="w-full">
                  <thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Branch", "Version", "Channel", "Last Check", "Status", "Actions"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {allBranches.map(b => (
                      <tr key={b.id} className="border-t hover:bg-[#FAFBFD] transition-colors align-top" style={{ borderColor: "#F1F5F9" }}>
                        <td className="px-5 py-3 text-sm font-medium" style={{ color: TEXT }}>{b.name}<div className="text-xs font-normal" style={{ color: SUBTLE }}>{b.organizationName}</div></td>
                        <td className="px-5 py-3 text-xs" style={{ color: TEXT, fontFamily: mono }}>{b.currentVersion ?? "—"}{b.rollbackToVersion && <div style={{ color: WARNING }}>→ {b.rollbackToVersion} requested</div>}</td>
                        <td className="px-5 py-3">
                          <select value={b.updateChannel ?? "stable"} onChange={e => setBranchChannel(b, e.target.value as "stable" | "beta")} className="px-2 py-1 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }}>
                            <option value="stable">stable</option>
                            <option value="beta">beta</option>
                          </select>
                        </td>
                        <td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{b.lastUpdateCheckAt ? new Date(b.lastUpdateCheckAt).toLocaleString() : "Never"}</td>
                        <td className="px-5 py-3"><div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: b.lastUpdateStatus === "failed" ? ERROR : b.lastUpdateStatus === "update_available" ? WARNING : MUTED }}><span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.lastUpdateStatus === "failed" ? ERROR : b.lastUpdateStatus === "update_available" ? WARNING : SUCCESS }} />{(b.lastUpdateStatus ?? "unknown").replace("_", " ")}{b.forceUpdateRequestedAt && <span style={{ color: WARNING }}> · pending</span>}</div></td>
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-1.5">
                            <button onClick={() => forceUpdate(b)} className="text-xs px-2 py-1 rounded border font-medium" style={{ color: TEAL, borderColor: `${TEAL}40` }}>Force Update Now</button>
                            <div className="flex gap-1">
                              <input value={rollbackInputs[b.id] ?? ""} onChange={e => setRollbackInputs(p => ({ ...p, [b.id]: e.target.value }))} placeholder="version" className="w-20 px-2 py-1 text-xs rounded border outline-none" style={{ borderColor: BORDER, fontFamily: mono }} />
                              <button onClick={() => rollback(b)} className="text-xs px-2 py-1 rounded border font-medium" style={{ color: ERROR, borderColor: `${ERROR}30` }}>Rollback</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
              <h3 className="text-sm font-semibold" style={{ color: TEXT }}>Platform Audit Log</h3>
              <select value={auditOrgId} onChange={e => setAuditOrgId(e.target.value)} className="px-3 py-1.5 text-xs rounded-lg border bg-white outline-none" style={{ borderColor: BORDER }}>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            {auditLog.length === 0 ? <div className="p-8 text-center text-sm" style={{ color: MUTED }}>No audit events for this organization yet.</div> : (
              <table className="w-full"><thead><tr style={{ backgroundColor: "#F8FAFC" }}>{["Timestamp", "Actor", "Action", "Branch", "IP"].map(h => <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>{h}</th>)}</tr></thead>
                <tbody>{auditLog.map(l => <tr key={l.id} className="border-t hover:bg-[#FAFBFD]" style={{ borderColor: "#F1F5F9" }}><td className="px-5 py-3 text-xs" style={{ color: MUTED, fontFamily: mono }}>{new Date(l.createdAt).toLocaleString()}</td><td className="px-5 py-3 text-sm font-medium capitalize" style={{ color: TEXT }}>{l.actorType.replace("_", " ")}</td><td className="px-5 py-3 text-sm" style={{ color: TEXT }}>{l.action}{l.details && <div className="text-xs" style={{ color: MUTED }}>{l.details}</div>}</td><td className="px-5 py-3 text-xs" style={{ color: MUTED }}>{l.branchId ?? "—"}</td><td className="px-5 py-3 text-xs" style={{ color: SUBTLE, fontFamily: mono }}>{"—"}</td></tr>)}</tbody>
              </table>
            )}
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
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Organization Name</label><input value={newOrg.name} onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))} placeholder="Grand Meridian Hotels" className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Super Admin First Name</label><input value={newOrg.adminFirstName} onChange={e => setNewOrg(p => ({ ...p, adminFirstName: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} /></div>
                <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Super Admin Last Name</label><input value={newOrg.adminLastName} onChange={e => setNewOrg(p => ({ ...p, adminLastName: e.target.value }))} className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              </div>
              <div><label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Super Admin Email</label><input type="email" value={newOrg.adminEmail} onChange={e => setNewOrg(p => ({ ...p, adminEmail: e.target.value }))} placeholder="owner@example.ng" className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }} /></div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider block mb-1" style={{ color: MUTED }}>Subscription Plan</label>
                <select value={newOrg.planTier} onChange={e => setNewOrg(p => ({ ...p, planTier: e.target.value as any }))} className="w-full px-3 py-2.5 border rounded-xl text-sm outline-none" style={{ borderColor: BORDER }}>
                  <option value="starter">Starter — 5–15 rooms</option>
                  <option value="growth">Growth — 15–50 rooms</option>
                  <option value="business">Business — 50+ rooms</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm border" style={{ color: MUTED, borderColor: BORDER }}>Cancel</button>
              <button onClick={createOrg} className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>Create Organization</button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border" style={{ backgroundColor: "#F0FDF4", borderColor: "#BBF7D0", minWidth: 320 }}>
          <CheckCircle2 size={16} style={{ color: SUCCESS, flexShrink: 0 }} />
          <span className="text-sm font-medium" style={{ color: TEXT }}>{toast}</span>
        </div>
      )}
    </div>
  );
}
