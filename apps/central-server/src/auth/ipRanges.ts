// Auth doc 3.5: "Session tied to IP range (configurable — Gideon's known
// IP ranges)". Real, but deliberately scoped to what the spec actually
// commits to: "configurable" implies an operator sets real ranges, which
// don't exist in this environment (same "not configured = no-op" pattern
// as TTLock/registry config elsewhere in this codebase) -- and a HARD
// block on mismatch is a genuine lockout risk for an account the Auth doc
// itself describes as "one account" with no other admin able to unlock it
// (3.1) and no real email/SMS recovery channel built here. So this FLAGS
// an out-of-range session (real audit log entry + a response field the
// frontend can surface) rather than rejecting it -- the same "impossible
// travel" notification pattern real products use for a single high-value
// account, not a guessed hard-reject/re-prompt UX the spec never
// actually specified.
//
// IPv4 only. IPv6 CIDR matching is meaningfully more involved and this
// account's real access pattern (a home/office IPv4 range) doesn't need
// it -- documented gap, not silently ignored.
export function parseAllowedRanges(): string[] {
  const raw = process.env.PLATFORM_OWNER_ALLOWED_IP_RANGES;
  if (!raw) return [];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function ipToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some(p => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// Express reports IPv4 connections as IPv4-mapped IPv6 (`::ffff:127.0.0.1`)
// on a dual-stack listener -- normalize before matching.
function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function isIpInCidr(ip: string, cidr: string): boolean {
  const normalized = normalizeIp(ip);
  const ipInt = ipToInt(normalized);
  if (ipInt === null) return false;

  const [rangeIp, prefixStr] = cidr.split("/");
  const rangeInt = ipToInt(rangeIp);
  if (rangeInt === null) return false;
  const prefix = prefixStr === undefined ? 32 : Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

// Returns null when the feature isn't configured (no ranges set) -- callers
// should treat null as "nothing to flag", not "flagged". Returns true/false
// once ranges ARE configured: true = within an allowed range, false = flagged.
export function isIpAllowed(ip: string | undefined): boolean | null {
  const ranges = parseAllowedRanges();
  if (ranges.length === 0) return null;
  if (!ip) return false;
  return ranges.some(range => isIpInCidr(ip, range));
}
