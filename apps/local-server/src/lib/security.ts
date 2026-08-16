// Backend Blueprint B17 — security posture, decided in one place.
//
// WHY ONE MODULE. Every one of these settings has a permissive development
// value and a strict production value, and the failure mode is always the
// same: the permissive value ships. Scattering `process.env.NODE_ENV` checks
// through app.ts, auth.ts and index.ts is how one of them gets missed, and
// nothing tells you which. Here they are computed once, exported as data, and
// logged at boot so an operator can SEE the posture the server came up with.
import os from "node:os";
import { logger } from "./logger.js";

export const isProduction = process.env.NODE_ENV === "production";

/**
 * A LAN-only product has no public URL (Auth doc Part 2, Layer 3), so the
 * server should not be listening on every interface it can find. Binding
 * 0.0.0.0 on a hotel's back-office PC exposes the API to the guest wifi if
 * the two networks are ever bridged -- which, in a small property with one
 * router, they usually are.
 *
 * Development binds all interfaces so a tablet on the same wifi can reach the
 * dev server; production must be told explicitly what to bind.
 */
export const BIND_HOST = process.env.NEXURA_BIND_HOST ?? (isProduction ? "" : "0.0.0.0");

export class InsecureConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsecureConfigError";
  }
}

/**
 * Refuses to start a production server that would listen on all interfaces.
 *
 * Deliberately fatal rather than a warning. A warning in a boot log on a
 * machine in a back office is a warning nobody reads, and the thing it is
 * warning about is "the API is reachable from the guest network".
 *
 * The escape hatch is explicit and self-describing: setting
 * NEXURA_BIND_HOST=0.0.0.0 is a decision someone had to type.
 */
export function resolveBindHost(): string | undefined {
  // Reads the environment at CALL time, not at module load. Capturing it in a
  // module constant made this function untestable (the only way to exercise
  // the production branch was to reload the module) and, worse, meant the
  // value the server actually used could differ from the value anything else
  // inspected later.
  const production = process.env.NODE_ENV === "production";
  const configured = process.env.NEXURA_BIND_HOST ?? (production ? "" : "0.0.0.0");

  if (!production) return configured || undefined;

  if (!configured) {
    throw new InsecureConfigError(
      "NEXURA_BIND_HOST is not set. In production the local server must be told which "
      + "interface to bind -- normally the mesh overlay address (Tailscale/WireGuard) or "
      + "the LAN address of the back-office machine. Binding every interface would expose "
      + "the API to any network this machine can see, including guest wifi. "
      + "Set NEXURA_BIND_HOST=<address>, or NEXURA_BIND_HOST=0.0.0.0 to accept that risk deliberately.",
    );
  }
  return configured;
}

/** Addresses on this machine, so the boot log can say what was actually chosen. */
export function describeInterfaces(): string[] {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, addrs]) => (addrs ?? [])
      .filter(a => a.family === "IPv4")
      .map(a => `${name}=${a.address}${a.internal ? " (internal)" : ""}`));
}

/**
 * Detects a mesh-overlay interface (Tailscale / WireGuard / ZeroTier).
 *
 * The blueprint recommends an overlay over per-property certificates because
 * it delivers transport encryption AND device identity in one mechanism --
 * and B30's device enrolment needs the identity half anyway. This does not
 * configure anything; it reports what is present so the boot log and the
 * health endpoint can tell an operator whether the property is on the overlay
 * or running bare on the LAN.
 */
export function detectOverlayInterface(): { name: string; address: string } | null {
  const OVERLAY_PREFIXES = ["tailscale", "utun", "wg", "zt", "nexura"];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    const lower = name.toLowerCase();
    if (!OVERLAY_PREFIXES.some(p => lower.startsWith(p))) continue;
    const v4 = (addrs ?? []).find(a => a.family === "IPv4" && !a.internal);
    if (v4) return { name, address: v4.address };
  }
  return null;
}

/**
 * Origins permitted to make cross-origin requests.
 *
 * PRODUCTION DEFAULT IS EMPTY, and that is the correct default rather than a
 * cautious one: the packaged image serves the frontend from the same origin
 * as the API, so a production browser never makes a cross-origin request at
 * all. Anything that does is either a misconfiguration or someone else's page.
 *
 * Development allows the Vite dev server, which genuinely is a separate origin.
 */
export function corsAllowlist(): string[] {
  const configured = (process.env.NEXURA_CORS_ORIGINS ?? "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (configured.length > 0) return configured;
  if (isProduction) return [];
  return [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
  ];
}

/** Methods that change state, and therefore need the same-origin check. */
export const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * True if the request's declared origin is one we accept.
 *
 * A request with NO Origin header passes: same-origin form posts, server-side
 * callers and curl do not send one, and rejecting those would break the
 * packaged deployment and every integration. The header is a browser-supplied
 * signal about a browser-specific threat (CSRF from another site), so it is
 * only meaningful when the browser chose to send it.
 */
export function originAllowed(origin: string | undefined, allowlist: string[]): boolean {
  if (!origin) return true;
  return allowlist.includes(origin);
}

/** Cookie flags. `secure` is on in production, where the overlay gives TLS. */
export function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isProduction,
    maxAge: maxAgeMs,
  };
}

export function logSecurityPosture(port: number, host: string | undefined) {
  const overlay = detectOverlayInterface();
  const allowlist = corsAllowlist();
  logger.info({
    mode: isProduction ? "production" : "development",
    bind: host ?? "(all interfaces)",
    port,
    overlay: overlay ? `${overlay.name} ${overlay.address}` : "none detected",
    corsOrigins: allowlist.length > 0 ? allowlist : "(none — same-origin only)",
    secureCookies: isProduction,
    interfaces: describeInterfaces(),
  }, "[security] Boot posture");

  if (isProduction && !overlay) {
    // Not fatal: a property may legitimately run on a trusted wired LAN with
    // no overlay. But it means transport is unencrypted, and that should be a
    // visible decision rather than an assumption.
    logger.warn(
      "[security] No mesh-overlay interface detected. Traffic to this server is unencrypted "
      + "on the LAN. Install Tailscale/WireGuard, or accept the risk knowingly.",
    );
  }
}
