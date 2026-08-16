// Lean shell: sidebar, header, notification panel, Router, App root.
// Screen components live under ./screens/<module>/, shared UI primitives in
// Screens.tsx, and data/constants in data.tsx.
import { useState, useCallback, useEffect } from "react";
import {
  LayoutDashboard, CalendarDays, KeyRound, BedDouble, Wrench,
  UtensilsCrossed, MessageSquare, DollarSign, Package, Users,
  Building2, BarChart3, Settings, ChevronLeft, ChevronRight,
  Bell, LogOut, User, ChevronDown, AlertTriangle, Plus,
  MoreHorizontal, ArrowRight, Home, Layers, X, Lock, Globe,
  ClipboardList, CalendarCheck, Star, AlertCircle, FileText, CreditCard, Truck,
  Shield, Cpu, Activity, RefreshCw, Hash, Phone, Edit3, Eye, Trash2,
  Download, Send, Menu as MenuIcon, HelpCircle, CheckCircle2, Search, WifiOff, Clock,
  TrendingUp, TrendingDown, UserCheck,
} from "lucide-react";

// ─── Shared data & types ─────────────────────────────────────────────────────
import {
  type Role, type Toast, type ToastType, type AddToast,
  uid, fmtN,
  mono, sans, NAV_BG, PRIMARY, TEAL, ORANGE, SUCCESS, WARNING, ERROR, BORDER, TEXT, MUTED, SUBTLE,
  NOTIFS, BRANCHES,
} from "./data";
// UI Adoption F11 — the single source of truth for navigation. The `Screen`
// union, SCREEN_ROLE_MAP, DOOR_LOCK_SCREENS, the NAV tree and the 90-branch
// Router switch that used to live here have all collapsed into this table.
import {
  ROUTES, routeFor, visibleNav, isRouteVisible, landingPath,
} from "./routes";
import { LoginScreen, ForgotPasswordScreen, ForceChangePasswordScreen } from "./Auth";
import AdminConsole from "./AdminConsole";
import OrgPortal from "./OrgPortal";
import { authApi, settingsApi, doorLockApi, syncApi, type AuthUser, type ModuleKey, type LockQueueItem, type SyncStatus } from "./lib/api";
import { OfflineBanner } from "./components/OfflineBanner";
import { PermissionProvider } from "./components/RoleGate";
import { useConnection } from "./lib/connection";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router";

// REAL_ROUTES used to list the handful of screens that had graduated to a
// real URL, so nav() could send those to the router and everything else to
// the screen-switch. Every screen has a URL now (routes.tsx), so the split
// it existed to manage is gone.

type AuthState = "login" | "branch" | "admin-console" | "org-portal" | "force-change-password";

// ─── Screen components & primitives ──────────────────────────────────────────
// Primitives (Badge, StatCard, PageHeader, Inp, Sel, etc.) live in Screens.tsx;
// every screen component lives in its own per-module file under ./screens/
// per Guidelines §2.
import { EmptyState, ToastC, LiveClock, SyncPill } from "./Screens";


// ─── Placeholder for unbuilt screens ─────────────────────────────────────────
function PlaceholderScreen({ title, desc, icon: Icon }: { title: string; desc: string; icon: React.ElementType }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-xl font-bold" style={{ color: TEXT }}>{title}</h1></div></div>
      <div className="bg-white rounded-xl border" style={{ borderColor: BORDER }}>
        <EmptyState icon={Icon} message={desc} cta={`Open ${title}`} />
      </div>
    </div>
  );
}

// ─── Nav type ─────────────────────────────────────────────────────────────────

// ─── App Root ─────────────────────────────────────────────────────────────────
// ─── App Root — manages auth layer routing ────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState<AuthState>("login");
  const [loggedUser, setLoggedUser] = useState<AuthUser | null>(null);

  // Real local-server login always lands in the branch app (Nexura_Auth
  // Part 4.1 — even an on-site Org Super Admin authenticates against the
  // local server, not a separate portal). "admin-console" / "org-portal"
  // are reached via the links below the login form; each has its own real
  // central-server login gate inside OrgPortal.tsx/AdminConsole.tsx (Phase 3),
  // entirely separate from this local-server session.
  const handleLogin = (user: AuthUser) => {
    setLoggedUser(user);
    setAuthState("branch");
  };

  const handleLogout = () => {
    authApi.logout().catch(() => { /* best-effort — clear local state regardless */ });
    setLoggedUser(null);
    setAuthState("login");
  };

  if (authState === "login") {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onPreviewAdminConsole={() => setAuthState("admin-console")}
        onPreviewOrgPortal={() => setAuthState("org-portal")}
      />
    );
  }
  if (authState === "admin-console") return <AdminConsole onLogout={handleLogout} />;
  if (authState === "org-portal") return <OrgPortal onLogout={handleLogout} />;
  if (authState === "force-change-password") return <ForceChangePasswordScreen onComplete={() => setAuthState("branch")} />;

  if (!loggedUser) { setAuthState("login"); return null; }
  // UI Adoption F9 — the session's effective permission keys, from
  // GET /auth/me, so <RoleGate> can hide actions the server would refuse.
  // Undefined (an older cached session) means "unknown" and fails open; see
  // components/RoleGate.tsx for why that is the right direction here.
  return (
    <PermissionProvider value={loggedUser.permissions}>
      <NexuraApp initialRole={loggedUser.role as Role} loggedUser={loggedUser} onLogout={handleLogout} />
    </PermissionProvider>
  );
}

// ─── Sync pill (real) ─────────────────────────────────────────────────────────
// Reports GET /sync/status. Three states worth distinguishing, because they
// mean different things to whoever is looking at the header:
//
//   not configured  -- single-property install, no central server. NORMAL.
//                      Showing "Offline" here would be wrong; there is
//                      nothing it is supposed to be connected to.
//   pending > 0     -- sync works, N records still waiting to go up.
//   failed          -- the last push errored. This is the one that matters.
function SyncPillLive({ add }: { add: AddToast }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    syncApi.status().then(setStatus).catch(() => { /* pill just stays quiet */ });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!status) return null;
  if (!status.configured) return null;   // nothing to sync to — say nothing

  const failed = status.lastPushStatus === "error" || status.lastPullStatus === "error";
  const pending = status.pendingItemCount;
  const colour = failed ? "#EF4444" : pending > 0 ? "#F59E0B" : "#22C55E";
  const label = failed ? "Sync failed" : pending > 0 ? `${pending} pending` : "Synced";

  return (
    <button
      onClick={async () => {
        setSyncing(true);
        try {
          const r = await syncApi.syncNow();
          const ok = r.push.ok && r.pull.ok;
          add({
            type: ok ? "success" : "error",
            title: ok ? "Sync complete" : "Sync failed",
            body: ok ? undefined : (r.push.error ?? r.pull.error ?? undefined),
          });
        } catch {
          add({ type: "error", title: "Sync failed", body: "Couldn't reach the local server." });
        } finally {
          setSyncing(false);
          load();
        }
      }}
      disabled={syncing}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80"
      style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
      title={status.lastPushError ?? (status.lastPushAt ? `Last push ${new Date(status.lastPushAt).toLocaleString()}` : "Never pushed")}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colour, boxShadow: `0 0 6px ${colour}` }} />
      {syncing ? "Syncing…" : label}
    </button>
  );
}

// ─── Nexura App Shell ─────────────────────────────────────────────────────────
// ─── Session Expired Modal (Nexura_Auth Part 7.1) ─────────────────────────────
function SessionExpiredModal({ offline, onStay, onSignOut }: { offline: boolean; onStay: () => void; onSignOut: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.6)" }} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ backgroundColor: "#FEF3C7" }}>
          <Clock size={22} style={{ color: "#D97706" }} />
        </div>
        <h3 className="text-base font-bold text-center mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
          {offline ? "Session Extended (Offline)" : "Session About to Expire"}
        </h3>
        <p className="text-sm text-center mb-5 leading-relaxed" style={{ color: "#64748B" }}>
          {offline
            ? "Your session token expired while offline. An 8-hour grace period extension has been issued automatically (Nexura_Auth §7.1). Please re-authenticate when connectivity returns."
            : "Your 12-hour session will expire in 5 minutes. Stay signed in or you'll be redirected to the login screen."}
        </p>
        <div className="flex gap-3">
          <button onClick={onSignOut} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors hover:bg-[#F8FAFC]" style={{ color: "#64748B", borderColor: "#E2E8F0" }}>
            Sign Out
          </button>
          <button onClick={onStay} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-md" style={{ backgroundColor: "#123A73" }}>
            {offline ? "Continue Offline" : "Stay Signed In"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Permissions Changed Dialog (Nexura_Auth Part 6.3) ────────────────────────
function PermissionsChangedDialog({ onReLogin }: { onReLogin: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 backdrop-blur-sm" style={{ backgroundColor: "rgba(13,27,46,0.6)" }} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" style={{ border: "1px solid #E2E8F0" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 mx-auto" style={{ backgroundColor: "#EEF2FF" }}>
          <Shield size={22} style={{ color: "#4F46E5" }} />
        </div>
        <h3 className="text-base font-bold text-center mb-1" style={{ color: "#0D1B2E", fontFamily: "'Plus Jakarta Sans','Inter',sans-serif" }}>
          Account Permissions Updated
        </h3>
        <p className="text-sm text-center mb-2 leading-relaxed" style={{ color: "#64748B" }}>
          Your role permissions were changed by a manager while you were logged in. Your current session has been invalidated (Nexura_Auth §6.3).
        </p>
        <p className="text-xs text-center mb-5" style={{ color: "#94A3B8" }}>Please sign in again to receive your updated permissions.</p>
        <button onClick={onReLogin} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: "#123A73" }}>
          Sign In Again
        </button>
      </div>
    </>
  );
}

function NexuraApp({ initialRole, loggedUser, onLogout }: { initialRole: Role; loggedUser: AuthUser; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>("Front Desk");
  // D-01/D-02: MGT/ORG get the branch-wide Management Overview; every other
  // role lands on their own role-adaptive "My Dashboard". The current screen
  // and its title are no longer state — they are read from the URL, so a
  // reload, a bookmark and the back button all land where they should.
  const [role, setRole] = useState<Role>(initialRole);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState("All");
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Real connection state, not a simulated toggle. Still consumed by
  // SessionExpiredModal, which words itself differently when a token expires
  // with the server unreachable (Nexura_Auth §7.1's offline grace period).
  const offline = useConnection().state === "offline";
  // Auth event dialogs (Nexura_Auth §6.3, §7.1)
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const [showPermsChanged, setShowPermsChanged] = useState(false);
  // ST-01 Enabled Modules -- fetched once per session; HotelConfig's own
  // save doesn't need to push a live update here, a reload picks it up,
  // same as any other settings change in this app.
  const [enabledModules, setEnabledModules] = useState<ModuleKey[] | null>(null);
  useEffect(() => { settingsApi.getBranch().then(s => setEnabledModules(s.enabledModules)).catch(() => setEnabledModules(["restaurant", "inventory", "multiBranch", "doorLock"])); }, []);
  // 6.10 Lock Command Queue Monitor -- only appears with real pending
  // items, polled every 30s (server itself retries every 2 min, see
  // server/src/services/locks/queue.ts; this is just the UI staying
  // current between those retries).
  const [lockQueue, setLockQueue] = useState<LockQueueItem[]>([]);
  const [lockQueueOpen, setLockQueueOpen] = useState(false);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const doorLockOn = enabledModules?.includes("doorLock") ?? false;
  useEffect(() => {
    if (!doorLockOn) return;
    const poll = () => doorLockApi.queue().then(setLockQueue).catch(() => {});
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, [doorLockOn]);
  const retryQueueNow = async () => {
    setRetryingQueue(true);
    try { await doorLockApi.retryQueueNow(); const q = await doorLockApi.queue(); setLockQueue(q); }
    finally { setRetryingQueue(false); }
  };
  // Role and module filtering now come from the route table (routes.tsx),
  // which is also what builds <Routes> below — so a sidebar entry and the
  // route it points at can no longer disagree about who may see it.
  const navSections = visibleNav(role, enabledModules);

  const add = useCallback((t: Omit<Toast, "id">) => {
    const id = uid();
    setToasts(p => [...p, { ...t, id }]);
    setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 4500);
  }, []);
  const dismiss = useCallback((id: string) => setToasts(p => p.filter(t => t.id !== id)), []);

  const routerNavigate = useNavigate();
  const routerLocation = useLocation();
  /** Navigate by PATH and close any open menus. The label is no longer
      passed — it comes from the route definition, so the header title and
      the sidebar entry cannot drift apart. */
  const nav = (path: string) => {
    setNotifOpen(false); setUserMenuOpen(false); setBranchMenuOpen(false);
    routerNavigate(path);
  };

  // The active route, derived from the URL rather than tracked in state.
  // `useMatch`-free on purpose: an exact hit covers every sidebar entry,
  // and detail routes fall back to their section via `startsWith`.
  const activePath = routerLocation.pathname;
  const activeRoute = routeFor(activePath);
  const activeLabel = activeRoute?.label
    ?? ROUTES.find(r => r.path.includes(":") && activePath.startsWith(r.path.split("/:")[0]))?.label
    ?? "Dashboard";

  const unread = NOTIFS.filter(n => n.unread).length;
  const parent = navSections.find(s => s.children?.some(p => p === activePath));
  const filteredN = notifFilter === "All" ? NOTIFS
    : notifFilter === "Urgent" ? NOTIFS.filter(n => n.category === "Emergency")
    : notifFilter === "Door Lock" ? NOTIFS.filter(n => n.category === "Door Lock")
    : notifFilter === "System" ? NOTIFS.filter(n => ["System", "Chat"].includes(n.category))
    : NOTIFS.filter(n => ["Reservation", "Housekeeping", "Maintenance", "Finance", "Restaurant"].includes(n.category));

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: sans, backgroundColor: "#F5F7FA" }}>

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="flex flex-col h-full flex-shrink-0 transition-all duration-200 z-20"
        style={{ width: collapsed ? 64 : 240, backgroundColor: NAV_BG, borderRight: "1px solid rgba(255,255,255,0.06)", overflowY: "auto", overflowX: "hidden", scrollbarWidth: "none" }}>
        <div className="h-16 flex items-center flex-shrink-0 px-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: TEAL }}><Home size={16} color="white" /></div>
          {!collapsed && <div className="ml-3 overflow-hidden"><div className="text-white font-semibold text-sm leading-none truncate">Grand Palms Hotel</div><div className="text-xs mt-0.5 truncate" style={{ color: SUBTLE }}>Abuja Branch</div></div>}
        </div>
        <nav className="flex-1 py-2 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          {navSections.map(item => {
            const Icon = item.icon;
            // Dashboard is one entry pointing at two routes — MGT/ORG get the
            // branch-wide overview, everyone else their role dashboard — so
            // both count as "active" for it.
            const sectionPath = item.path === "/dashboard" ? landingPath(role) : item.path;
            const isActive = activePath === sectionPath || item.children?.some(p => p === activePath);
            const isExp = expanded === item.label;
            const hasChild = !!item.children?.length;
            return (
              <div key={item.label}>
                <button
                  onClick={() => {
                    if (sectionPath) nav(sectionPath);
                    if (hasChild) {
                      if (collapsed) { setCollapsed(false); setExpanded(item.label); }
                      else setExpanded(p => p === item.label ? null : item.label);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors relative group"
                  style={{ backgroundColor: isActive ? "rgba(255,255,255,0.08)" : "transparent", borderLeft: isActive ? `3px solid ${ORANGE}` : "3px solid transparent", minHeight: 44 }}
                  title={collapsed ? item.label : undefined}>
                  <div className="relative flex-shrink-0">
                    <Icon size={18} color={isActive ? "white" : SUBTLE} />
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center" style={{ fontSize: 8, color: "white", fontWeight: 700 }}>{item.badge}</span>
                    )}
                  </div>
                  {!collapsed && (
                    <>
                      <span className={`flex-1 text-sm truncate ${isActive ? "text-white font-medium" : "text-[#CBD5E1]"}`}>{item.label}</span>
                      {hasChild && <ChevronDown size={13} color="#64748B" style={{ flexShrink: 0, transform: isExp ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }} />}
                    </>
                  )}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 rounded text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50"
                      style={{ backgroundColor: NAV_BG, border: "1px solid rgba(255,255,255,0.1)" }}>
                      {item.label}
                    </div>
                  )}
                </button>
                {!collapsed && hasChild && isExp && (
                  <div style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", marginLeft: 28 }}>
                    {item.children!.map(p => {
                      const r = routeFor(p)!;   // guaranteed by routes.tsx's dev assertion
                      return (
                        <button key={p} onClick={() => nav(p)}
                          className="w-full text-left px-4 py-1.5 text-xs truncate transition-colors hover:text-white"
                          style={{ color: activePath === p ? TEAL : SUBTLE, fontWeight: activePath === p ? 600 : 400, minHeight: 32 }}>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!collapsed && (
            <>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Quick Actions</div>
                {[
                  { icon: Plus, label: "New Reservation", s: "/reservations/new" },
                  { icon: KeyRound, label: "Quick Check-In", s: "/front-desk/check-in" },
                  { icon: ArrowRight, label: "Quick Check-Out", s: "/front-desk/check-out" },
                  { icon: AlertTriangle, label: "Emergency Alert", s: "/communications/chat", c: ERROR },
                ].filter(qa => {
                  const r = routeFor(qa.s);
                  return r != null && isRouteVisible(r, role, enabledModules);
                }).map(qa => {
                  const Icon = qa.icon;
                  return (
                    <button key={qa.label} onClick={() => nav(qa.s)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-white/5 transition-colors" style={{ minHeight: 40 }}>
                      <Icon size={15} style={{ color: (qa as any).c ?? SUBTLE, flexShrink: 0 }} />
                      <span className="text-sm" style={{ color: (qa as any).c ?? "#CBD5E1" }}>{qa.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748B" }}>Settings</div>
                {["/settings/property", "/settings/door-lock", "/settings/sync", "/settings/preferences"]
                  .map(p => routeFor(p)!)
                  .filter(r => isRouteVisible(r, role, enabledModules))
                  .map(r => (
                    <button key={r.path} onClick={() => nav(r.path)}
                      className="w-full text-left px-4 py-1.5 text-xs truncate transition-colors hover:text-white"
                      style={{ color: activePath === r.path ? TEAL : SUBTLE, fontWeight: activePath === r.path ? 600 : 400, minHeight: 32 }}>
                      {r.label}
                    </button>
                  ))}
                <button className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors" style={{ minHeight: 40 }}>
                  <HelpCircle size={16} color={SUBTLE} /><span className="text-sm text-[#CBD5E1]">Help</span>
                </button>
              </div>
            </>
          )}
        </nav>
        <button onClick={() => setCollapsed(p => !p)}
          className="flex items-center justify-center py-3 mx-3 mb-3 rounded-lg text-[#64748B] hover:text-white hover:bg-white/5 gap-2 text-xs"
          style={{ minHeight: 40, border: "1px solid rgba(255,255,255,0.08)" }}>
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
        </button>
      </aside>

      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center px-5 flex-shrink-0 z-10 gap-4"
          style={{ height: 64, backgroundColor: NAV_BG, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button onClick={() => setCollapsed(p => !p)} className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10 flex-shrink-0">
              <MenuIcon size={20} color="white" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: TEAL }}><Home size={13} color="white" /></div>
              <span className="text-white font-semibold text-sm hidden md:block">Grand Palms</span>
              <span className="hidden md:block" style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: SUBTLE }}>
              {parent && <><span className="hidden md:block">{parent.label}</span><span style={{ color: "rgba(255,255,255,0.2)" }}>›</span></>}
              <span className="text-white font-medium truncate">{activeLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => nav("/communications/shift-handover")}
              className="hidden lg:flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-medium text-white hover:opacity-80"
              style={{ backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22C55E", boxShadow: "0 0 6px #22C55E" }} />
              <span>Morning</span><span style={{ color: SUBTLE }}>07:00–15:00</span>
            </button>
            <LiveClock />
            {/* Sync status — REAL, from GET /sync/status.
                This used to be a toggle that flipped a local boolean and
                toasted "Simulating offline mode" / "5 pending items pushed":
                a demo prop that told staff a fixed number of items had synced
                when nothing had. Same class of defect as Phase 0.1's no-op
                controls. It now reports the actual push state and the actual
                pending count, and clicking it runs a real sync. */}
            <SyncPillLive add={add} />
            {/* 6.10 Lock Command Queue Monitor -- only rendered when there's
                a real pending item, not a decorative fixed count. */}
            {lockQueue.length > 0 && (
              <div className="relative hidden lg:block">
                <button onClick={() => setLockQueueOpen(p => !p)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium text-white hover:opacity-80"
                  style={{ backgroundColor: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}>
                  <Lock size={12} style={{ color: "#8B5CF6" }} /><span className="hidden xl:inline">{lockQueue.length} queued</span>
                </button>
                {lockQueueOpen && (
                  <div className="absolute right-0 top-full mt-1 w-80 rounded-xl shadow-2xl z-50 border overflow-hidden" style={{ backgroundColor: "white", borderColor: BORDER }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "#F1F5F9" }}><span className="text-sm font-semibold" style={{ color: TEXT }}>🔒 Lock Command Queue</span></div>
                    <div className="max-h-64 overflow-y-auto">
                      {lockQueue.map(item => (
                        <div key={item.id} className="px-4 py-2.5 border-b text-xs" style={{ borderColor: "#F8FAFC" }}>
                          <div className="font-medium" style={{ color: TEXT }}>{item.commandType.replace("_", " ")} — Room {item.room}</div>
                          <div style={{ color: MUTED }}>Queued: {new Date(item.createdAt).toLocaleTimeString()} · Expires: {new Date(item.expiresAt).toLocaleString()}</div>
                          {item.lastRetryAt && <div style={{ color: WARNING }}>Last attempt: {new Date(item.lastRetryAt).toLocaleTimeString()} — {item.errorLog ?? "failed"}</div>}
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 text-xs" style={{ color: SUBTLE }}>Retrying every 2 min…</div>
                    <button onClick={retryQueueNow} disabled={retryingQueue} className="w-full text-center py-2.5 text-xs font-semibold border-t disabled:opacity-50" style={{ color: PRIMARY, borderColor: "#F1F5F9" }}>{retryingQueue ? "Retrying…" : "Retry Now"}</button>
                  </div>
                )}
              </div>
            )}
            {/* Auth demo triggers — Nexura_Auth §6.3 and §7.1 */}
            <div className="relative hidden xl:block group">
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-white/60 hover:text-white/90 hover:bg-white/10 transition-colors" title="Demo: Auth Events (Nexura_Auth §6.3 / §7.1)">
                <Shield size={12} /><span>Auth Demo</span>
              </button>
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl shadow-2xl border overflow-hidden z-50 hidden group-hover:block" style={{ backgroundColor: "white", borderColor: "#E2E8F0" }}>
                <div className="px-3 py-2 border-b text-xs font-semibold" style={{ color: "#64748B", borderColor: "#F1F5F9" }}>Auth Event Demos</div>
                <button onClick={() => setShowSessionExpired(true)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#F5F7FA] text-left" style={{ color: "#0D1B2E" }}>
                  <Clock size={12} style={{ color: "#D97706" }} />Session Expired (§7.1)
                </button>
                <button onClick={() => setShowPermsChanged(true)} className="flex items-center gap-2 w-full px-3 py-2.5 text-xs hover:bg-[#F5F7FA] text-left" style={{ color: "#0D1B2E" }}>
                  <Shield size={12} style={{ color: "#4F46E5" }} />Permissions Changed (§6.3)
                </button>
              </div>
            </div>
            <div className="relative hidden md:block">
              <button onClick={() => { setBranchMenuOpen(p => !p); setUserMenuOpen(false); setNotifOpen(false); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                <Globe size={13} /><span>Abuja</span><ChevronDown size={11} color={SUBTLE} />
              </button>
              {branchMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-2xl z-50 border overflow-hidden" style={{ backgroundColor: "white", borderColor: BORDER }}>
                  {BRANCHES.map(b => (
                    <button key={b.id} onClick={() => { setBranchMenuOpen(false); add({ type: "info", title: `Switched to ${b.name}` }); }}
                      className="flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-[#F5F7FA]" style={{ color: TEXT }}>
                      <span>{b.name}</span>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.status === "synced" ? SUCCESS : WARNING }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => { setNotifOpen(p => !p); setUserMenuOpen(false); setBranchMenuOpen(false); }}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              <Bell size={18} color="white" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-white font-bold" style={{ fontSize: 9 }}>{unread}</span>
              )}
            </button>
            <select value={role} onChange={e => setRole(e.target.value as Role)}
              className="hidden xl:block text-xs px-2 py-1.5 rounded-lg border text-[#0F172A] outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.9)", borderColor: "rgba(255,255,255,0.2)" }}
              title="Switch role (demo)">
              {(["MGT", "ORG", "FD", "HK", "MX", "FIN", "RT", "RSV", "IT"] as Role[]).map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="relative">
              <button onClick={() => { setUserMenuOpen(p => !p); setNotifOpen(false); setBranchMenuOpen(false); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: TEAL }}>{(loggedUser.firstName[0] ?? "") + (loggedUser.lastName[0] ?? "")}</div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-medium text-white leading-none">{loggedUser.firstName} {loggedUser.lastName}</div>
                  <div className="text-xs mt-0.5 uppercase tracking-wider" style={{ color: SUBTLE, fontSize: 9 }}>{role}</div>
                </div>
                <ChevronDown size={11} color={SUBTLE} />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl shadow-2xl z-50 border overflow-hidden" style={{ backgroundColor: "white", borderColor: BORDER }}>
                  <div className="px-3 py-2.5 border-b" style={{ borderColor: "#F1F5F9" }}>
                    <div className="text-xs font-semibold" style={{ color: TEXT }}>{loggedUser.firstName} {loggedUser.lastName}</div>
                    <div className="text-xs mt-0.5" style={{ color: MUTED }}>{loggedUser.email} · {role}</div>
                  </div>
                  {[
                    { icon: User, label: "My Profile", fn: () => { setUserMenuOpen(false); nav("/settings/preferences"); } },
                    { icon: KeyRound, label: "Change Password", fn: () => { setUserMenuOpen(false); add({ type: "info", title: "Change Password", body: "Go to My Preferences → Security" }); } },
                    { icon: Layers, label: "Switch Role (Demo)", fn: () => setUserMenuOpen(false) },
                    { icon: LogOut, label: "Sign Out", fn: () => { setUserMenuOpen(false); onLogout(); }, danger: true },
                  ].map(({ icon: Icon, label, fn, danger }) => (
                    <button key={label} onClick={fn}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm hover:bg-[#F5F7FA]"
                      style={{ color: danger ? ERROR : TEXT }}>
                      <Icon size={14} style={{ color: danger ? ERROR : MUTED }} />{label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: "none" }}>
          <div className="max-w-screen-2xl mx-auto">
            {/* UI Adoption F2. Replaces a hand-rolled banner driven by the
                simulated `offline` boolean, which claimed "Changes will sync
                automatically when reconnected" — untrue, since there is no
                client-side write queue. Its "Go Online" button just cleared
                the local flag. <OfflineBanner> reads the real signal (a
                request that failed to reach the server) and says what is
                actually true: nothing can be saved until it is back. */}
            <OfflineBanner />
            {/* Every screen, generated from the one route table. There is no
                longer a `*` catch-all falling into a switch — an unknown URL
                lands on the role's dashboard rather than a "coming soon"
                placeholder that looked like an unbuilt feature. */}
            <Routes>
              {ROUTES.map(r => (
                <Route key={r.path} path={r.path} element={r.element({ add, role })} />
              ))}
              <Route path="/" element={<Navigate to={landingPath(role)} replace />} />
              <Route path="*" element={<Navigate to={landingPath(role)} replace />} />
            </Routes>
          </div>
        </main>
      </div>

      {/* ── Notification panel ───────────────────────────────────────────── */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-30" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} onClick={() => setNotifOpen(false)} />
          <div className="fixed right-0 top-0 h-full z-40 flex flex-col shadow-2xl" style={{ width: 400, backgroundColor: "white", borderLeft: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#F1F5F9" }}>
              <h2 className="text-base font-semibold" style={{ color: TEXT }}>Notifications</h2>
              <div className="flex items-center gap-2">
                <button className="text-xs font-medium hover:underline" style={{ color: TEAL }}>Mark all read</button>
                <button onClick={() => setNotifOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#F1F5F9]" style={{ color: SUBTLE }}><X size={15} /></button>
              </div>
            </div>
            <div className="flex border-b" style={{ borderColor: "#F1F5F9" }}>
              {["All", "Urgent", "Operational", "System", "Door Lock"].map(tab => (
                <button key={tab} onClick={() => setNotifFilter(tab)} className="flex-1 text-xs font-medium py-2.5"
                  style={{ color: notifFilter === tab ? PRIMARY : MUTED, borderBottom: notifFilter === tab ? `2px solid ${PRIMARY}` : "2px solid transparent" }}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              {filteredN.length === 0 && <EmptyState icon={Bell} message="No notifications in this category." />}
              {filteredN.map(n => {
                const NIcon = n.icon;
                return (
                  <div key={n.id} className="flex gap-3 px-5 py-4 border-b hover:bg-[#FAFBFD] cursor-pointer group"
                    style={{ borderLeft: `4px solid ${n.color}`, minHeight: 72, borderColor: "#F8FAFC" }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${n.color}18` }}>
                      <NIcon size={16} style={{ color: n.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold" style={{ color: TEXT }}>{n.title}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {n.unread && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#3B82F6" }} />}
                          <button className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center" style={{ color: SUBTLE }}><X size={12} /></button>
                        </div>
                      </div>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: MUTED }}>{n.body}</p>
                      <span className="text-xs mt-1 inline-block" style={{ color: SUBTLE }}>{n.time} ago</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t" style={{ borderColor: "#F1F5F9" }}>
              <button className="w-full py-2 text-sm font-medium rounded-lg hover:bg-[#ECFDF5]" style={{ color: TEAL }}>View all notifications</button>
            </div>
          </div>
        </>
      )}

      <ToastC toasts={toasts} dismiss={dismiss} />

      {/* Nexura_Auth §7.1 — Session Expired */}
      {showSessionExpired && (
        <SessionExpiredModal
          offline={offline}
          onStay={() => { setShowSessionExpired(false); add({ type: "success", title: "Session extended", body: "Token refreshed — 12 hours remaining" }); }}
          onSignOut={() => { setShowSessionExpired(false); onLogout(); }}
        />
      )}

      {/* Nexura_Auth §6.3 — Permissions Changed */}
      {showPermsChanged && (
        <PermissionsChangedDialog onReLogin={() => { setShowPermsChanged(false); onLogout(); }} />
      )}
    </div>
  );
}
