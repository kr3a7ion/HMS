import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, activeSessions, branches } from "../db/schema.js";
import { verifyPassword, hashPassword } from "../auth/passwords.js";
import { permissionsHashForRole, permissionsForRole } from "../auth/permissions.js";
import {
  signAccessToken, signGraceExtensionToken, decodeIgnoringExpiry,
  generateRefreshToken, hashRefreshToken,
  ACCESS_TOKEN_TTL_SECONDS, GRACE_EXTENSION_TTL_SECONDS, GRACE_PERIOD_HOURS,
} from "../auth/tokens.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import { checkLoginThrottle, clearLoginThrottle, recordLoginFailure } from "../lib/loginThrottle.js";
import { hashIdentifier } from "../lib/redact.js";
import { cookieOptions } from "../lib/security.js";
import { transaction } from "../db/tx.js";

const router = Router();

// B17.4: hard lockout is gone -- see lib/loginThrottle.ts for why it was a
// denial-of-service vector rather than a protection.
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

  const ip = req.ip ?? "unknown";

  // B17.4. Checked BEFORE the account is looked up, so the delay is identical
  // whether or not the email exists -- otherwise the throttle itself becomes
  // an account-enumeration oracle.
  const throttle = checkLoginThrottle(ip, email);
  if (throttle.blocked) {
    res.setHeader("Retry-After", String(throttle.retryAfterSeconds));
    return res.status(429).json({
      error: "TOO_MANY_ATTEMPTS",
      retryAfterSeconds: throttle.retryAfterSeconds,
    });
  }

  const user = db.select().from(users).where(eq(users.email, email.toLowerCase())).get();

  // Same generic error whether the account exists or the password is wrong —
  // don't leak which one it was.
  if (!user) {
    const unknownState = recordLoginFailure(ip, email);
    // This local server instance serves exactly one branch (Auth doc's
    // one-server-per-branch model), so even an unmatched email is still a
    // real security event for that branch -- worth showing IT-05, not
    // dropping because there's no authenticated user to attribute it to.
    //
    // B17.6: the attempted email is HASHED, not written verbatim. People
    // mistype their password into the email field, and paste personal
    // addresses in; an audit log that anyone with admin:operations can read
    // should not become a collection of other people's credentials and
    // contact details. The hash still lets an investigator group repeated
    // attempts against the same target.
    const branch = db.select().from(branches).limit(1).get();
    logAudit({
      userId: null, branchId: branch?.id ?? null, action: "login_failed", module: "auth",
      details: `Unknown account (${hashIdentifier(email)})`, ipAddress: ip,
    });

    // The response must be INDISTINGUISHABLE from a wrong password on a real
    // account, including when the throttle engages. Recording the failure but
    // still answering 401 here -- which is what this did at first, caught by
    // the enumeration test -- makes the 401/429 difference a free oracle for
    // "does this address have an account?".
    if (unknownState.blocked) {
      res.setHeader("Retry-After", String(unknownState.retryAfterSeconds));
      return res.status(429).json({
        error: "TOO_MANY_ATTEMPTS",
        retryAfterSeconds: unknownState.retryAfterSeconds,
      });
    }
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  if (user.status !== "active") {
    logAudit({ userId: user.id, branchId: user.branchId, action: "login_blocked_inactive", module: "auth", ipAddress: ip });
    return res.status(403).json({ error: "ACCOUNT_INACTIVE" });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    // B17.4 REPLACES HARD LOCKOUT. Five wrong passwords used to lock the
    // account for 15 minutes, which handed a denial-of-service to anyone who
    // knew a colleague's email: five deliberate failures and the night
    // manager cannot log in during their shift, with no IT desk at 2am.
    //
    // Backoff grows the delay instead, keyed on IP + account, and never
    // permanently locks anyone out. failedLoginAttempts is still recorded
    // because IT-05 reports on it; it no longer gates anything.
    const state = recordLoginFailure(ip, email);
    db.update(users)
      .set({ failedLoginAttempts: user.failedLoginAttempts + 1 })
      .where(eq(users.id, user.id))
      .run();
    logAudit({ userId: user.id, branchId: user.branchId, action: "login_failed", module: "auth", ipAddress: ip });

    if (state.blocked) {
      res.setHeader("Retry-After", String(state.retryAfterSeconds));
      return res.status(429).json({
        error: "TOO_MANY_ATTEMPTS",
        retryAfterSeconds: state.retryAfterSeconds,
      });
    }
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  clearLoginThrottle(ip, email);

  const sessionId = nanoid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshToken = generateRefreshToken();

  // Clearing the lockout, writing the audit row and creating the session are
  // one unit (B3 / invariant 3). Half of this succeeding is the bad case: a
  // cleared attempt counter with no session hands out a free retry, and a
  // session row with the counter still set locks out an account that just
  // authenticated successfully.
  transaction(() => {
    db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();
    logAudit({ userId: user.id, branchId: user.branchId, action: "login_success", module: "auth", ipAddress: req.ip });
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
  });

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    org_id: user.organizationId,
    branch_id: user.branchId,
    permissions_hash: permissionsHashForRole(user.role),
    session_id: sessionId,
  });

  res.cookie("access_token", accessToken, cookieOptions(ACCESS_TOKEN_TTL_SECONDS * 1000));
  res.cookie("refresh_token", refreshToken, cookieOptions(REFRESH_TOKEN_TTL_MS));

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

  res.cookie("access_token", extension, cookieOptions(GRACE_EXTENSION_TTL_SECONDS * 1000));
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
    // The effective permission set, so the client can hide an action the
    // server would refuse anyway. This is a CONVENIENCE, not a control:
    // requirePermission() on each route remains the only thing enforcing
    // anything, and a client that ignores this list gains nothing but 403s.
    // Without it the UI can only gate by role name, which drifts the moment
    // a manager edits a role via HR-03.
    permissions: permissionsForRole(user.role),
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
