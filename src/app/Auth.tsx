// Authentication screens: Login, Forgot Password, Force Change Password.
// Entry point for all three auth layers (Part 5 of HMS_Auth_and_Distribution_Architecture.md).
import { useState, useEffect } from "react";
import {
  Eye, EyeOff, AlertCircle, CheckCircle2, Lock,
  WifiOff, ArrowLeft, Server, Key, Shield,
} from "lucide-react";

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

type LoginDestination = "hms" | "admin-console" | "org-portal";

// Demo credential routing (Part 3, 4, 5 of HMS_Auth doc)
const DEMO_ACCOUNTS: Record<string, { role: string; dest: LoginDestination; title: string }> = {
  "admin@platform.com":       { role: "PLT", dest: "admin-console", title: "Platform Owner" },
  "owner@grandpalms.ng":      { role: "ORG", dest: "org-portal",    title: "Organization Super Admin" },
  "manager@grandpalms.ng":    { role: "MGT", dest: "hms",           title: "Hotel Manager" },
  "frontdesk@grandpalms.ng":  { role: "FD",  dest: "hms",           title: "Front Desk (triggers force-change-password demo)" },
  "housekeeper@grandpalms.ng":{ role: "HK",  dest: "hms",           title: "Housekeeping" },
  "maintenance@grandpalms.ng":{ role: "MX",  dest: "hms",           title: "Maintenance" },
  "finance@grandpalms.ng":    { role: "FIN", dest: "hms",           title: "Finance" },
  "restaurant@grandpalms.ng": { role: "RT",  dest: "hms",           title: "Restaurant" },
};

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
export function LoginScreen({ onLogin }: { onLogin: (role: string, dest: LoginDestination) => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [serverUrl, setServerUrl]     = useState("http://hms.local");
  const [showServer, setShowServer]   = useState(false);
  const [showForgot, setShowForgot]   = useState(false);

  const isLocked = !!(lockedUntil && new Date() < lockedUntil);
  const MAX = 5;

  if (showForgot) return <ForgotPasswordScreen onBack={() => setShowForgot(false)} />;

  const handleLogin = async () => {
    if (isLocked) return;
    if (!email.trim() || !password.trim()) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    await new Promise(r => setTimeout(r, 800));

    const account = DEMO_ACCOUNTS[email.toLowerCase()];
    const wrongPw = password.length < 3;

    if (!account || wrongPw) {
      const n = attempts + 1; setAttempts(n); setLoading(false);
      if (n >= MAX) {
        const until = new Date(Date.now() + 15 * 60 * 1000);
        setLockedUntil(until);
        setError(`Too many failed attempts. Account locked until ${until.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}. Contact your manager or IT to unlock immediately.`);
      } else if (n === MAX - 1) {
        setError(`Incorrect email or password. 1 attempt remaining before account lockout.`);
      } else {
        setError(`Incorrect email or password.${n > 1 ? ` (${n}/${MAX} attempts used)` : ""}`);
      }
      return;
    }

    setLoading(false);
    onLogin(account.role, account.dest);
  };

  const handleOffline = () => onLogin("MGT", "hms");

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
              <div className="text-white font-bold text-xl leading-none">Grand Palms HMS</div>
              <div className="text-xs mt-0.5" style={{ color: TEAL }}>Hospitality Management Platform</div>
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
              { icon: "⚡", label: "Instant access, any device", desc: "Open a browser on any LAN device. Navigate to http://hms.local. Done." },
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
          <div className="text-xs" style={{ color: "#334155" }}>HMS Platform v2.4.1 · Local Server v1.2.0</div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: TEAL }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 21h18M4 21V8l8-5 8 5v13M9 21v-6h6v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span className="font-bold text-lg" style={{ color: TEXT }}>Grand Palms HMS</span>
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
              <button onClick={handleOffline}
                className="w-full py-3 rounded-xl text-sm font-medium border flex items-center justify-center gap-2 transition-colors hover:bg-[#F8FAFC]"
                style={{ borderColor: BORDER, color: MUTED }}>
                <WifiOff size={14} />Continue Offline
                <span className="text-xs ml-1" style={{ color: SUBTLE }}>(requires prior session on this device)</span>
              </button>
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
                <div className="text-xs mt-1.5" style={{ color: SUBTLE }}>Default: http://hms.local · or LAN IP e.g. http://192.168.1.10</div>
              </div>
            )}
          </div>

          {/* Demo credential picker */}
          <div className="bg-white rounded-2xl p-5" style={{ border: `1px solid ${BORDER}` }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>Demo Credentials — click any to auto-fill</div>
            <div className="space-y-1">
              {Object.entries(DEMO_ACCOUNTS).map(([email, acc]) => (
                <button key={email} onClick={() => { setEmail(email); setPassword("demo123"); setError(""); setAttempts(0); setLockedUntil(null); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-[#F8FAFC] transition-colors">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: acc.dest === "admin-console" ? ERROR : acc.dest === "org-portal" ? TEAL : PRIMARY }}>
                    {acc.role.slice(0, 2)}
                  </div>
                  <span className="text-xs flex-1" style={{ fontFamily: mono, color: PRIMARY }}>{email}</span>
                  <span className="text-xs" style={{ color: SUBTLE }}>{acc.title}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: "#F1F5F9", color: SUBTLE }}>
              Any password ≥ 3 chars works · Wrong password × {MAX} triggers 15-min lockout demo
            </div>
          </div>
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
                  <li>Click the link → it opens the HMS login page</li>
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
