// Auth doc 3.5: "Login attempt rate limiting (5 attempts, then 15-minute
// lockout)". In-memory, keyed by email -- genuinely enforces the real
// behavior for this single-process central server, same "process-local
// state is fine, this deployment is one process" reasoning as the door-lock
// queue processor. Doesn't survive a restart or a multi-instance deploy;
// a real production rollout would move this to the DB or a shared cache,
// same caveat as everywhere else process-local state is used here.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptState { count: number; lockedUntil: number | null }
const attempts = new Map<string, AttemptState>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

// Returns the epoch ms the lockout expires at, or null if not locked.
export function checkLockout(email: string): number | null {
  const s = attempts.get(key(email));
  if (s?.lockedUntil && s.lockedUntil > Date.now()) return s.lockedUntil;
  return null;
}

export function recordFailedAttempt(email: string): void {
  const k = key(email);
  const s = attempts.get(k) ?? { count: 0, lockedUntil: null };
  s.count += 1;
  if (s.count >= MAX_ATTEMPTS) s.lockedUntil = Date.now() + LOCKOUT_MS;
  attempts.set(k, s);
}

export function clearAttempts(email: string): void {
  attempts.delete(key(email));
}
