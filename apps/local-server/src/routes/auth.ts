import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, activeSessions, branches } from "../db/schema.js";
import { verifyPassword, hashPassword } from "../auth/passwords.js";
import { permissionsHashForRole } from "../auth/permissions.js";
import {
  signAccessToken, signGraceExtensionToken, decodeIgnoringExpiry,
  generateRefreshToken, hashRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS, GRACE_EXTENSION_TTL_SECONDS, GRACE_PERIOD_HOURS,
} from "../auth/tokens.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

const MAX_ATTEMPTS = 5; // Auth doc Part 5.3
const LOCKOUT_MINUTES = 15;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, Part 6.1

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Part 5.1 — standard online login.
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const { email, password } = parsed.data;

  const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();

  // Same generic error whether the account exists or the password is wrong —
  // don't leak which one it was.
  if (!user) {
    // This local server instance serves exactly one branch (Auth doc's
    // one-server-per-branch model), so even an unmatched email is still a
    // real security event for that branch -- worth showing IT-05, not
    // dropping because there's no authenticated user to attribute it to.
    const branch = db.select().from(branches).limit(1).get();
    logAudit({ userId: null, branchId: branch?.id ?? null, action: "login_failed", module: "auth", details: `Unknown email: ${email}`, ipAddress: req.ip });
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    logAudit({ userId: user.id, branchId: user.branchId, action: "login_blocked_locked", module: "auth", ipAddress: req.ip });
    return res.status(423).json({ error: "ACCOUNT_LOCKED", lockedUntil: user.lockedUntil.toISOString() });
  }
  if (user.status !== "active") {
    logAudit({ userId: user.id, branchId: user.branchId, action: "login_blocked_inactive", module: "auth", ipAddress: req.ip });
    return res.status(403).json({ error: "ACCOUNT_INACTIVE" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    const lockedUntil = locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    db.update(users)
      .set({ failedLoginAttempts: locked ? 0 : attempts, lockedUntil })
      .where(eq(users.id, user.id))
      .run();
    logAudit({ userId: user.id, branchId: user.branchId, action: locked ? "login_failed_locked_out" : "login_failed", module: "auth", ipAddress: req.ip });
    if (locked) return res.status(423).json({ error: "ACCOUNT_LOCKED", lockedUntil: lockedUntil!.toISOString() });
    return res.status(401).json({ error: "INVALID_CREDENTIALS", attemptsRemaining: MAX_ATTEMPTS - attempts });
  }

  db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
  logAudit({ userId: user.id, branchId: user.branchId, action: "login_success", module: "auth", ipAddress: req.ip });

  const sessionId = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshToken = generateRefreshToken();

  db.insert(activeSessions).values({
    sessionId,
    userId: user.id,
    branchId: user.branchId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    issuedAt: now,
    expiresAt,
    lastActiveAt: now,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] ?? null,
    isOfflineMode: false,
  }).run();

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    org_id: user.organizationId,
    branch_id: user.branchId,
    permissions_hash: permissionsHashForRole(user.role),
    session_id: sessionId,
  });

  res.cookie("access_token", accessToken, { httpOnly: true, sameSite: "strict", maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000 });
  res.cookie("refresh_token", refreshToken, { httpOnly: true, sameSite: "strict", maxAge: REFRESH_TOKEN_TTL_MS });

  res.json({
    user: {
      id: user.id, email: user.email, role: user.role,
      firstName: user.firstName, lastName: user.lastName,
      branchId: user.branchId, organizationId: user.organizationId,
    },
  });
});

// Part 5.2 / 7.1 — Continue Offline. Called with the existing access_token
// cookie (possibly expired) when the browser has detected no connectivity.
// No network call anywhere in this handler -- that's the entire point.
router.post("/continue-offline", (req, res) => {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });

  const payload = decodeIgnoringExpiry(token);
  if (!payload) return res.status(401).json({ error: "TOKEN_INVALID" }); // bad signature, never trust it

  const session = db.select().from(activeSessions).where(eq(activeSessions.sessionId, payload.session_id)).get();
  if (!session || session.revokedAt) return res.status(401).json({ error: "SESSION_REVOKED" });

  const expiredAtMs = (payload.exp ?? 0) * 1000;
  const withinGracePeriod = Date.now() - expiredAtMs < GRACE_PERIOD_HOURS * 60 * 60 * 1000;
  if (!withinGracePeriod) return res.status(401).json({ error: "GRACE_PERIOD_EXPIRED" });

  const extension = signGraceExtensionToken({
    sub: payload.sub,
    role: payload.role,
    org_id: payload.org_id,
    branch_id: payload.branch_id,
    permissions_hash: payload.permissions_hash,
    session_id: payload.session_id,
  });

  db.update(activeSessions)
    .set({ isOfflineMode: true, lastActiveAt: new Date() })
    .where(eq(activeSessions.sessionId, payload.session_id))
    .run();

  res.cookie("access_token", extension, { httpOnly: true, sameSite: "strict", maxAge: GRACE_EXTENSION_TTL_SECONDS * 1000 });
  res.json({ offlineExtension: true, expiresInSeconds: GRACE_EXTENSION_TTL_SECONDS });
});

router.post("/logout", requireAuth, (req: AuthedRequest, res) => {
  if (req.auth) {
    db.update(activeSessions)
      .set({ revokedAt: new Date(), revokeReason: "manual" })
      .where(eq(activeSessions.sessionId, req.auth.sessionId))
      .run();
    logAudit({ userId: req.auth.userId, branchId: req.auth.branchId, action: "logout", module: "auth", ipAddress: req.ip });
  }
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const user = db.select().from(users).where(eq(users.id, req.auth!.userId)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({
    id: user.id, email: user.email, role: user.role,
    firstName: user.firstName, lastName: user.lastName,
    branchId: user.branchId, organizationId: user.organizationId,
  });
});

// ST-03 My Preferences > Security > "Change Password" -- self-service,
// distinct from HR-02/IT-01's admin-triggered resets: requires knowing the
// current password rather than a manager/IT override.
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });

router.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const user = db.select().from(users).where(eq(users.id, req.auth!.userId)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "CURRENT_PASSWORD_INCORRECT" });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
  logAudit({ userId: user.id, branchId: user.branchId, action: "password_changed_self", module: "auth", ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
