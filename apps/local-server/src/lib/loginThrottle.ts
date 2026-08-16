// Backend Blueprint B17.4 — exponential backoff, replacing hard lockout.
//
// WHY THE OLD BEHAVIOUR WAS WORSE THAN NO PROTECTION. Five wrong passwords
// locked the account for 15 minutes. That is a denial-of-service handed to
// anyone who knows a colleague's email address: five deliberate failures and
// the night manager cannot log in during a shift. In a hotel there is no IT
// desk at 2am, and the "attack" costs nothing and needs no skill.
//
// Backoff keyed on IP + ACCOUNT fixes both halves:
//   * The delay grows with consecutive failures, so a password guesser gets
//     slower and slower — which is the real protection, since an online
//     attack is bounded by attempt rate, not attempt count.
//   * It NEVER permanently locks the account. The legitimate owner, arriving
//     from a different device or after the window, is not punished for
//     someone else's failures against them.
//
// Held in memory, deliberately. A restart clears it, which is acceptable
// because the window is minutes and the local server restarts rarely; putting
// it in SQLite would mean a write on every failed login, which is a
// write-amplification gift to the same attacker.
const attempts = new Map<string, { count: number; blockedUntil: number; lastAttempt: number }>();

/**
 * Delay after the Nth consecutive failure, indexed by N. Caps at 5 minutes.
 *
 * The first TWO failures cost nothing: mistyping a password twice is
 * ordinary, and making someone wait for it is how staff learn to resent the
 * login screen. From the third the delay grows sharply, which is where an
 * automated guesser lives and a human almost never does.
 */
const BACKOFF_MS = [0, 0, 0, 1_000, 3_000, 10_000, 30_000, 60_000, 300_000];
const FORGET_AFTER_MS = 30 * 60 * 1000;

function scheduleKey(ip: string, email: string): string {
  // Both, not either: keying on IP alone throttles a whole hotel behind one
  // NAT address, and keying on the account alone is the lockout DoS again.
  return `${ip}::${email.toLowerCase()}`;
}

function prune(now: number) {
  // Bounded memory: an attacker cycling addresses must not grow the map
  // without limit.
  if (attempts.size < 10_000) return;
  for (const [k, v] of attempts) {
    if (now - v.lastAttempt > FORGET_AFTER_MS) attempts.delete(k);
  }
}

export interface ThrottleState {
  blocked: boolean;
  retryAfterSeconds: number;
  consecutiveFailures: number;
}

export function checkLoginThrottle(ip: string, email: string, now = Date.now()): ThrottleState {
  const entry = attempts.get(scheduleKey(ip, email));
  if (!entry || now - entry.lastAttempt > FORGET_AFTER_MS) {
    return { blocked: false, retryAfterSeconds: 0, consecutiveFailures: 0 };
  }
  if (entry.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
      consecutiveFailures: entry.count,
    };
  }
  return { blocked: false, retryAfterSeconds: 0, consecutiveFailures: entry.count };
}

/** Records a failure and returns how long the caller must now wait. */
export function recordLoginFailure(ip: string, email: string, now = Date.now()): ThrottleState {
  prune(now);
  const key = scheduleKey(ip, email);
  const existing = attempts.get(key);
  const stale = !existing || now - existing.lastAttempt > FORGET_AFTER_MS;
  const count = (stale ? 0 : existing!.count) + 1;
  const delay = BACKOFF_MS[Math.min(count, BACKOFF_MS.length - 1)];

  attempts.set(key, { count, blockedUntil: now + delay, lastAttempt: now });
  return {
    blocked: delay > 0,
    retryAfterSeconds: Math.ceil(delay / 1000),
    consecutiveFailures: count,
  };
}

/** A successful login clears the schedule for that IP + account. */
export function clearLoginThrottle(ip: string, email: string) {
  attempts.delete(scheduleKey(ip, email));
}

/** IT-role unlock: clears every schedule for an account, from any address. */
export function clearAllForAccount(email: string): number {
  const suffix = `::${email.toLowerCase()}`;
  let cleared = 0;
  for (const key of [...attempts.keys()]) {
    if (key.endsWith(suffix)) { attempts.delete(key); cleared += 1; }
  }
  return cleared;
}

/** Test-only reset, so one test's failures cannot throttle the next. */
export function __resetLoginThrottle() {
  attempts.clear();
}
