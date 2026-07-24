// Authentication screens: Login, Forgot Password, Force Change Password.
// Entry point for all three auth layers (Part 5 of Nexura_Auth_and_Distribution_Architecture.md).
import { useState, useEffect } from "react";
import {
  Eye, EyeOff, AlertCircle, CheckCircle2, Lock,
  WifiOff, ArrowLeft, Server, Key, Shield,
} from "lucide-react";
import { authApi, ApiError, NetworkError, type AuthUser } from "./lib/api";

const PRIMARY = "#123A73";
const TEAL = "#1BA39C";
const SUCCESS = "#2E7D32";
const WARNING = "#FFA000";
const ERROR = "#D32F2F";
const BORDER = "#E2E8F0";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const SUBTLE = "#94A3B8";
const NAV_BG = "#0F2044";
const mono = "'JetBrains Mono', monospace";
const sans = "'Inter', system-ui, sans-serif";

// Real accounts seeded by server/src/seed.ts (password "demo123" for all) —
// this list is just autofill convenience now, not a routing table. The
// Platform Owner and remote Org Portal logins are separate central-server
// auth layers (Nexura_Auth Part 3, 4.2), seeded by
// central-server/src/seed.ts with their own demo accounts (also
// "demo123") — see the links below the form to open those real,
// separately-authenticated portals.
const DEMO_LOGINS: Array<{ email: string; title: string }> = [
  { email: "owner@grandpalms.ng", title: "Org Super Admin — this hotel only" },
  { email: "manager@grandpalms.ng", title: "Hotel Manager" },
  { email: "frontdesk@grandpalms.ng", title: "Front Desk" },
  { email: "housekeeper@grandpalms.ng", title: "Housekeeping" },
  { email: "maintenance@grandpalms.ng", title: "Maintenance" },
  { email: "finance@grandpalms.ng", title: "Finance" },
  { email: "restaurant@grandpalms.ng", title: "Restaurant" },
];

function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setT(new Date()), 1000); return () => clearInterval(id); }, []);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <span style={{ fontFamily: mono, color: SUBTLE, fontSize: 12 }}>
      {p(t.getHours())}:{p(t.getMinutes())}:{p(t.getSeconds())} · {t.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
    </span>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
// Implements Part 5.1 (standard login) + 5.2 (continue offline) + 5.3 (failed login)
// against the real local server (server/) — see src/app/lib/api.ts.
export function LoginScreen({ onLogin, onPreviewAdminConsole, onPreviewOrgPortal }: {
  onLogin: (user: AuthUser) => void;
  onPreviewAdminConsole?: () => void;
  onPreviewOrgPortal?: () => void;
}) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [serverUrl, setServerUrl]     = useState("http://nexura.local");
  const [showServer, setShowServer]   = useState(false);
  const [showForgot, setShowForgot]   = useState(false);

  const isLocked = !!(lockedUntil && new Date() < lockedUntil);
  const MAX = 5;

  if (showForgot) return <ForgotPasswordScreen onBack={() => setShowForgot(false)} />;

  const handleLogin = async () => {
    if (isLocked) return;
    if (!email.trim() || !password.trim()) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");

    try {
      await authApi.login(email.trim().toLowerCase(), password);
      setLoading(false);
      setAttempts(0);
      const user = await authApi.me();
      onLogin(user);
    } catch (err) {
      setLoading(false);
      if (err instanceof NetworkError) {
        setError(`Can't reach the local server at ${serverUrl}. If this persists, use "Continue Offline" below (only works if you've logged in on this device before).`);
        return;
      }
      if (err instanceof ApiError) {
        if (err.code === "ACCOUNT_LOCKED") {
          const until = new Date((err.details as any)?.lockedUntil ?? Date.now() + 15 * 60 * 1000);
          setLockedUntil(until);
          setError(`Too many failed attempts. Account locked until ${until.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}. Contact your manager or IT to unlock immediately.`);
          return;
        }
        if (err.code === "ACCOUNT_INACTIVE") {
          setError("This account has been deactivated. Contact your manager or IT.");
          return;
        }
        const n = attempts + 1; setAttempts(n);
        const remaining = (err.details as any)?.attemptsRemaining;
        if (remaining === 1) {
          setError("Incorrect email or password. 1 attempt remaining before account lockout.");
        } else {
          setError(`Incorrect email or password.${n > 1 ? ` (${n}/${MAX} attempts used)` : ""}`);
        }
        return;
      }
      setError("Something went wrong signing in. Please try again.");
    }
  };

  // Part 5.2 — Continue Offline: only ever succeeds if a valid (or
  // grace-period-eligible) session cookie already exists on this device from
  // a prior login. No credentials are sent.
  const [offlineLoading, setOfflineLoading] = useState(false);
  const [offlineError, setOfflineError] = useState("");
  const handleOffline = async () => {
    setOfflineLoading(true); setOfflineError("");
    try {
      await authApi.continueOffline();
      const user = await authApi.me();
      setOfflineLoading(false);
      onLogin(user);
    } catch (err) {
      setOfflineLoading(false);
      if (err instanceof NetworkError) {
        setOfflineError(`Can't reach the local server at ${serverUrl} at all — this isn't an "internet is down" situation, the local server itself is unreachable.`);
      } else if (err instanceof ApiError && (err.code === "NO_TOKEN" || err.code === "SESSION_REVOKED" || err.code === "GRACE_PERIOD_EXPIRED")) {
        setOfflineError("No valid offline session found on this device. You'll need to sign in with your password once connectivity allows.");
      } else {
        setOfflineError("Couldn't continue offline. Please sign in normally.");
      }
    }
  };

  return (
    <div className="flex min-h-screen" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>

      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-10 relative overflow-hidden"
        style={{ backgroundColor: NAV_BG }}>
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-5" style={{ backgroundColor: TEAL }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-5" style={{ backgroundColor: PRIMARY }} />

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: TEAL }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M4 21V8l8-5 8 5v13M9 21v-6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div className="text-white font-bold text-xl leading-none">Grand Palms</div>
              <div className="text-xs mt-0.5" style={{ color: TEAL }}>Powered by Nexura</div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-3 leading-snug">
            Your hotel, fully operational — even offline.
          </h2>
          <p className="text-sm leading-relaxed mb-10" style={{ color: "#94A3B8" }}>
            Served from your hotel LAN. Reservations, check-ins, housekeeping, billing — all work with zero internet. Internet is only used for sync, not for auth.
          </p>

          <div className="space-y-5">
            {[
              { icon: "🔐", label: "Auth is offline by default", desc: "JWT tokens issued and validated by the local server. No internet call on any request." },
              { icon: "⚡", label: "Instant access, any device", desc: "Open a browser on any LAN device. Navigate to http://nexura.local. Done." },
              { icon: "🛡️", label: "Role-based, three-layer security", desc: "Navigation, API, and database enforcement. A bug in one layer doesn't expose data." },
            ].map(f => (
              <div key={f.label} className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{f.icon}</span>
                <div>
                  <div className="text-sm font-semibold text-white">{f.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#64748B" }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 space-y-1.5">
          <div className="text-xs" style={{ color: "#334155" }}>Serving from · <span style={{ fontFamily: mono }}>{serverUrl}</span></div>
          <LiveClock />
          <div className="text-xs" style={{ color: "#334155" }}>Nexura Platform v2.4.1 · Local Server v1.2.0</div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M4 21V8l8-5 8 5v13M9 21v-6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span className="font-bold text-lg" style={{ color: TEXT }}>Grand Palms</span>
        </div>

        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-4" style={{ border: `1px solid ${BORDER}` }}>
            <h1 className="text-xl font-bold mb-0.5" style={{ color: TEXT }}>Sign in to your account</h1>
            <p className="text-sm mb-6" style={{ color: MUTED }}>Grand Palms Hotel · Abuja Branch · {serverUrl}</p>

            {/* Lockout */}
            {isLocked && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: "#FEF2F2", border: `1px solid #FECACA` }}>
                <Lock size={15} style={{ color: ERROR, marginTop: 1, flexShrink: 0 }} />
                <div className="text-sm" style={{ color: ERROR }}>{error}</div>
              </div>
            )}

            {/* Error */}
            {error && !isLocked && (
              <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: "#FEF2F2", border: `1px solid #FECACA` }}>
                <AlertCircle size={15} style={{ color: ERROR, marginTop: 1, flexShrink: 0 }} />
                <div className="text-sm" style={{ color: ERROR }}>{error}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Email Address</label>
                <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="your-email@grandpalms.ng" disabled={isLocked}
                  className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors disabled:opacity-50"
                  style={{ borderColor: BORDER, color: TEXT }}
                  onFocus={e => e.target.style.borderColor = PRIMARY}
                  onBlur={e => e.target.style.borderColor = BORDER} />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Password</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    placeholder="••••••••" disabled={isLocked}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none pr-12 disabled:opacity-50"
                    style={{ borderColor: BORDER, color: TEXT }}
                    onFocus={e => e.target.style.borderColor = PRIMARY}
                    onBlur={e => e.target.style.borderColor = BORDER} />
                  <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Remember device — Part 5.4 */}
              <label className="flex items-start gap-3 cursor-pointer">
                <div onClick={() => setRemember(p => !p)}
                  className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                  style={{ borderColor: remember ? PRIMARY : "#CBD5E1", backgroundColor: remember ? PRIMARY : "transparent" }}>
                  {remember && <CheckCircle2 size={10} color="white" />}
                </div>
                <div>
                  <span className="text-sm" style={{ color: TEXT }}>Remember this device for 30 days</span>
                  <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>Stores a refresh token — use only on your assigned workstation</div>
                </div>
              </label>

              <button onClick={handleLogin} disabled={loading || isLocked}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: PRIMARY }}>
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Signing in…</>
                  : "Sign In"}
              </button>

              {/* Continue Offline — Part 5.2 */}
              <button onClick={handleOffline} disabled={offlineLoading}
                className="w-full py-3 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                style={{ borderColor: BORDER, color: MUTED }}>
                <WifiOff size={14} />{offlineLoading ? "Checking for a valid session…" : "Continue Offline"}
                {!offlineLoading && <span className="text-xs ml-1" style={{ color: SUBTLE }}>(requires prior session on this device)</span>}
              </button>
              {offlineError && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <AlertCircle size={14} style={{ color: WARNING, marginTop: 1, flexShrink: 0 }} />
                  <div className="text-xs" style={{ color: "#92400E" }}>{offlineError}</div>
                </div>
              )}
            </div>

            <div className="mt-5 pt-4 border-t flex items-center justify-between" style={{ borderColor: "#F1F5F9" }}>
              <button onClick={() => setShowForgot(true)} className="text-xs font-medium hover:underline" style={{ color: TEAL }}>
                Forgot Password?
              </button>
              <button onClick={() => setShowServer(p => !p)} className="text-xs" style={{ color: SUBTLE }}>
                Change Server (IT only)
              </button>
            </div>

            {showServer && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: "#F1F5F9" }}>
                <label className="text-xs font-medium uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>Local Server URL</label>
                <div className="flex gap-2">
                  <input value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none" style={{ borderColor: BORDER, fontFamily: mono }} />
                  <button onClick={() => setShowServer(false)} className="px-3 py-2 rounded-xl text-sm font-medium text-white" style={{ backgroundColor: PRIMARY }}>Save</button>
                </div>
                <div className="text-xs mt-1.5" style={{ color: SUBTLE }}>Default: http://nexura.local · or LAN IP e.g. http://192.168.1.10</div>
              </div>
            )}
          </div>

          {/* Demo credential picker — real accounts, real login (server/src/seed.ts) */}
          <div className="bg-white rounded-2xl p-5 mb-4" style={{ border: `1px solid ${BORDER}` }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Seeded Accounts — click any to auto-fill</div>
            <div className="space-y-1">
              {DEMO_LOGINS.map(acc => (
                <button key={acc.email} onClick={() => { setEmail(acc.email); setPassword("demo123"); setError(""); setAttempts(0); setLockedUntil(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[#F8FAFC] transition-colors">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: PRIMARY }}>
                    {acc.title.slice(0, 2)}
                  </div>
                  <span className="text-xs flex-1" style={{ fontFamily: mono, color: PRIMARY }}>{acc.email}</span>
                  <span className="text-xs" style={{ color: SUBTLE }}>{acc.title}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "#F1F5F9", color: SUBTLE }}>
              Password is <span style={{ fontFamily: mono }}>demo123</span> for all · real login against the local server · {MAX} wrong attempts locks the account for real
            </div>
            <div className="mt-2 text-xs" style={{ color: SUBTLE }}>
              None of these accounts can create a new hotel — that's the Platform Owner's job, below.
            </div>
          </div>

          {(onPreviewAdminConsole || onPreviewOrgPortal) && (
            <div className="rounded-2xl p-4" style={{ border: `1px solid ${PRIMARY}30`, backgroundColor: "#F0F4FA" }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: PRIMARY }}>Managing multiple hotels? Start here instead</div>
              <p className="text-xs mb-3" style={{ color: MUTED }}>
                These sign in to the <strong>central server</strong> (central-server/), a separate service from the hotel's local login above — must be running at <span style={{ fontFamily: mono }}>localhost:5000</span> (<span style={{ fontFamily: mono }}>cd central-server && npm run dev</span>).
              </p>
              <div className="space-y-2.5">
                {onPreviewAdminConsole && (
                  <div className="rounded-xl p-3 bg-white" style={{ border: `1px solid ${BORDER}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: TEXT }}>Admin Console — creates hotels</div>
                        <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>Platform Owner only. New organizations, new branches, billing, module licensing.</div>
                      </div>
                      <button onClick={onPreviewAdminConsole} className="flex-shrink-0 text-xs px-3 py-2 rounded-xl border hover:bg-[#F8FAFC]" style={{ borderColor: BORDER, color: PRIMARY, fontWeight: 600 }}>Open</button>
                    </div>
                    <div className="text-xs mt-2" style={{ color: SUBTLE, fontFamily: mono }}>platform-owner@nexura.app · demo123</div>
                  </div>
                )}
                {onPreviewOrgPortal && (
                  <div className="rounded-xl p-3 bg-white" style={{ border: `1px solid ${BORDER}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold" style={{ color: TEXT }}>Org Portal — cross-branch dashboard</div>
                        <div className="text-xs mt-0.5" style={{ color: SUBTLE }}>Org Super Admin. Read-only revenue/occupancy across every branch you own — doesn't create anything.</div>
                      </div>
                      <button onClick={onPreviewOrgPortal} className="flex-shrink-0 text-xs px-3 py-2 rounded-xl border hover:bg-[#F8FAFC]" style={{ borderColor: BORDER, color: PRIMARY, fontWeight: 600 }}>Open</button>
                    </div>
                    <div className="text-xs mt-2" style={{ color: SUBTLE, fontFamily: mono }}>superadmin@grandpalms.ng · demo123</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Forgot Password Screen ────────────────────────────────────────────────────
// Implements Part 8.2 (online) and Part 7.7 / 8.3 (offline guidance)
export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false); setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-2 text-sm mb-5 hover:opacity-70" style={{ color: MUTED }}>
          <ArrowLeft size={15} />Back to sign in
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: `1px solid ${BORDER}` }}>
          {!sent ? (
            <>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "#EFF6FF" }}>
                <Key size={22} style={{ color: PRIMARY }} />
              </div>
              <h1 className="text-xl font-bold mb-1" style={{ color: TEXT }}>Reset your password</h1>
              <p className="text-sm mb-6" style={{ color: MUTED }}>Enter your email. If your account exists, we'll send a reset link (1-hour expiry, must be opened on a LAN device).</p>

              <div className="p-4 rounded-xl mb-5 text-sm" style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}>
                <div className="font-semibold mb-1" style={{ color: "#92400E" }}>Offline? No email access?</div>
                <div style={{ color: "#92400E" }}>Ask your <strong>Branch Manager or IT</strong> to issue a temporary password directly in the app:<br />HR → Staff Directory → Your Name → Reset Password</div>
              </div>

              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                placeholder="your-email@grandpalms.ng"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none mb-4"
                style={{ borderColor: BORDER, color: TEXT }}
                onFocus={e => e.target.style.borderColor = PRIMARY}
                onBlur={e => e.target.style.borderColor = BORDER} />

              <button onClick={handleSubmit} disabled={loading || !email}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: PRIMARY }}>
                {loading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sending…</> : "Send Reset Link"}
              </button>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "#DCFCE7" }}>
                <CheckCircle2 size={22} style={{ color: SUCCESS }} />
              </div>
              <h1 className="text-xl font-bold mb-1" style={{ color: TEXT }}>Check your email</h1>
              <p className="text-sm mb-5" style={{ color: MUTED }}>
                If <strong>{email}</strong> has an account, a reset link was sent. It expires in 1 hour and must be opened on a device connected to the hotel LAN.
              </p>
              <div className="p-4 rounded-xl mb-5 text-sm" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${BORDER}` }}>
                <div className="font-medium mb-2" style={{ color: TEXT }}>Next steps</div>
                <ol className="space-y-1 list-decimal list-inside" style={{ color: MUTED }}>
                  <li>Open the reset email on a LAN-connected device</li>
                  <li>Click the link → it opens the Nexura login page</li>
                  <li>Enter your new password (min 8 chars, uppercase + number)</li>
                  <li>You'll be immediately prompted to log in with the new password</li>
                </ol>
              </div>
              <button onClick={onBack} className="w-full py-3 rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: PRIMARY }}>
                Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Force Change Password (first login / IT-issued temp password) ─────────────
// Implements Part 7.7 and Part 8.3
export function ForceChangePasswordScreen({ onComplete }: { onComplete: () => void }) {
  const [current, setCurrent] = useState("");
  const [pw1, setPw1]         = useState("");
  const [pw2, setPw2]         = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const reqs = [
    { label: "At least 8 characters", ok: pw1.length >= 8 },
    { label: "One uppercase letter",  ok: /[A-Z]/.test(pw1) },
    { label: "One lowercase letter",  ok: /[a-z]/.test(pw1) },
    { label: "One number",            ok: /[0-9]/.test(pw1) },
    { label: "Passwords match",       ok: pw1 === pw2 && pw1.length > 0 },
  ];
  const allOk = reqs.every(r => r.ok);

  const handleSubmit = async () => {
    if (!current) { setError("Enter your temporary password."); return; }
    if (!allOk) { setError("Please meet all password requirements."); return; }
    setLoading(true); setError("");
    await new Promise(r => setTimeout(r, 1000));
    setLoading(false); onComplete();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: sans, backgroundColor: "#F0F4F8" }}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8" style={{ border: `1px solid ${BORDER}` }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: "#FEF3C7" }}>
            <Shield size={22} style={{ color: WARNING }} />
          </div>
          <h1 className="text-xl font-bold mb-1" style={{ color: TEXT }}>Set your password</h1>
          <p className="text-sm mb-6" style={{ color: MUTED }}>
            Your account was set up with a temporary password. You must choose a personal password before you can access the system.
          </p>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4 text-sm" style={{ backgroundColor: "#FEF2F2", color: ERROR }}>
              <AlertCircle size={14} />{error}
            </div>
          )}

          <div className="space-y-3 mb-5">
            {[
              { label: "Temporary password", val: current, set: setCurrent, placeholder: "Enter the password your manager gave you" },
              { label: "New password",        val: pw1,     set: setPw1,     placeholder: "Min 8 chars, uppercase + number required" },
              { label: "Confirm new password",val: pw2,     set: setPw2,     placeholder: "Type new password again" },
            ].map(f => (
              <div key={f.label}>
                <label className="text-xs font-medium uppercase tracking-wider block mb-1.5" style={{ color: MUTED }}>{f.label}</label>
                <div className="relative">
                  <input type={showPw ? "text" : "password"} value={f.val}
                    onChange={e => { f.set(e.target.value); setError(""); }}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                    style={{ borderColor: BORDER, color: TEXT, paddingRight: f.label === "New password" ? 48 : 16 }}
                    onFocus={e => e.target.style.borderColor = PRIMARY}
                    onBlur={e => e.target.style.borderColor = BORDER} />
                  {f.label === "New password" && (
                    <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: SUBTLE }}>
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Requirements checklist */}
          <div className="p-4 rounded-xl mb-5 space-y-1.5" style={{ backgroundColor: "#F8FAFC" }}>
            {reqs.map(r => (
              <div key={r.label} className="flex items-center gap-2 text-xs">
                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: r.ok ? "#DCFCE7" : "#F1F5F9" }}>
                  {r.ok
                    ? <CheckCircle2 size={10} style={{ color: SUCCESS }} />
                    : <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: SUBTLE }} />}
                </div>
                <span style={{ color: r.ok ? SUCCESS : MUTED }}>{r.label}</span>
              </div>
            ))}
          </div>

          <button onClick={handleSubmit} disabled={loading || !allOk || !current}
            className="w-full py-3.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ backgroundColor: PRIMARY }}>
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
              : "Set New Password & Continue"}
          </button>

          <div className="mt-3 text-xs text-center" style={{ color: SUBTLE }}>
            Password changes are saved to the local server immediately and sync to central on next connection.
          </div>
        </div>
      </div>
    </div>
  );
}
