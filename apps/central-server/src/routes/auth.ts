// Auth doc Part 3.3 (Platform Owner) and Part 4.2 (Org Super Admin remote
// access) login flows. Platform Owner TOTP MFA (Auth doc 3.5, "mandatory,
// no bypass") and login rate limiting (3.5: "5 attempts, then 15-minute
// lockout") are both real -- see auth/totp.ts and auth/loginRateLimit.ts.
// Org Super Admin login has neither, per the Auth doc (3.5's security
// posture list is specific to the Platform Owner).
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { orgUsers, adminUsers, organizations } from "../db/schema.js";
import { verifyPassword } from "../auth/passwords.js";
import { signOrgToken, signAdminToken, signAdminMfaPendingToken } from "../auth/tokens.js";
import { requireOrgAuth, requireAdminAuth, requireAdminMfaPending, type OrgAuthedRequest, type AdminAuthedRequest, type AdminMfaPendingRequest } from "../auth/middleware.js";
import { generateTotpSecret, totpOtpauthUrl, verifyTotp } from "../auth/totp.js";
import { checkLockout, recordFailedAttempt, clearAttempts } from "../auth/loginRateLimit.js";
import { logAudit } from "../services/audit.js";

const router = Router();
const ORG_TOKEN_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const ADMIN_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
const ADMIN_MFA_PENDING_MAX_AGE_MS = 5 * 60 * 1000;

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const codeSchema = z.object({ code: z.string().min(1) });

// ─── Org Super Admin (Org Portal, portal.nexura.app) ───────────────────────
router.post("/org/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const user = db.select().from(orgUsers).where(eq(orgUsers.email, parsed.data.email.toLowerCase())).get();
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    logAudit({ actorType: "org_user", action: "login_failed", details: `email: ${parsed.data.email}`, ipAddress: req.ip });
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  const token = signOrgToken({ sub: user.id, organization_id: user.organizationId });
  res.cookie("central_access_token", token, { httpOnly: true, sameSite: "strict", maxAge: ORG_TOKEN_MAX_AGE_MS });
  logAudit({ actorType: "org_user", actorId: user.id, organizationId: user.organizationId, action: "login_success", ipAddress: req.ip });
  res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, organizationId: user.organizationId } });
});

router.post("/org/logout", (_req, res) => { res.clearCookie("central_access_token"); res.json({ ok: true }); });

router.get("/org/me", requireOrgAuth, (req: OrgAuthedRequest, res) => {
  const user = db.select().from(orgUsers).where(eq(orgUsers.id, req.orgAuth!.sub)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });
  const org = db.select().from(organizations).where(eq(organizations.id, user.organizationId)).get();
  res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, organizationId: user.organizationId, organizationName: org?.name });
});

// ─── Platform Owner (Admin Console, admin.nexura.app) ──────────────────────
// Two-step: password, then TOTP -- a full session token is issued by
// neither step alone, only by mfa/enroll/confirm or mfa/verify.
router.post("/admin/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const { email, password } = parsed.data;

  const lockedUntil = checkLockout(email);
  if (lockedUntil) return res.status(429).json({ error: "LOCKED_OUT", lockedUntil: new Date(lockedUntil).toISOString() });

  const user = db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase())).get();
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    recordFailedAttempt(email);
    logAudit({ actorType: "admin", action: "login_failed", details: `email: ${email}`, ipAddress: req.ip });
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  // Password alone never grants a session -- Auth doc 3.5, "no bypass".
  const pendingToken = signAdminMfaPendingToken({ sub: user.id });
  res.cookie("central_mfa_pending_token", pendingToken, { httpOnly: true, sameSite: "strict", maxAge: ADMIN_MFA_PENDING_MAX_AGE_MS });
  logAudit({ actorType: "admin", actorId: user.id, action: "login_password_ok", details: "awaiting TOTP", ipAddress: req.ip });
  res.json({ mfaRequired: true, setupRequired: user.totpEnabledAt == null });
});

// Only reachable with the password-verified pending token, and only when
// this admin hasn't completed enrollment yet -- regenerates the secret
// each call so an abandoned setup never leaves a stale, unconfirmed one.
router.post("/admin/mfa/enroll/start", requireAdminMfaPending, (req: AdminMfaPendingRequest, res) => {
  const user = db.select().from(adminUsers).where(eq(adminUsers.id, req.adminMfaPending!.sub)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });
  if (user.totpEnabledAt) return res.status(400).json({ error: "ALREADY_ENROLLED" });

  const secret = generateTotpSecret();
  db.update(adminUsers).set({ totpSecret: secret }).where(eq(adminUsers.id, user.id)).run();
  res.json({ secret, otpauthUrl: totpOtpauthUrl(secret, user.email) });
});

router.post("/admin/mfa/enroll/confirm", requireAdminMfaPending, (req: AdminMfaPendingRequest, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const user = db.select().from(adminUsers).where(eq(adminUsers.id, req.adminMfaPending!.sub)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });
  if (user.totpEnabledAt) return res.status(400).json({ error: "ALREADY_ENROLLED" });
  if (!user.totpSecret) return res.status(400).json({ error: "ENROLLMENT_NOT_STARTED" });

  const lockedUntil = checkLockout(user.email);
  if (lockedUntil) return res.status(429).json({ error: "LOCKED_OUT", lockedUntil: new Date(lockedUntil).toISOString() });

  if (!verifyTotp(user.totpSecret, parsed.data.code)) {
    recordFailedAttempt(user.email);
    logAudit({ actorType: "admin", actorId: user.id, action: "mfa_enroll_failed", ipAddress: req.ip });
    return res.status(401).json({ error: "INVALID_CODE" });
  }

  clearAttempts(user.email);
  db.update(adminUsers).set({ totpEnabledAt: new Date() }).where(eq(adminUsers.id, user.id)).run();
  const token = signAdminToken({ sub: user.id });
  res.clearCookie("central_mfa_pending_token");
  res.cookie("central_access_token", token, { httpOnly: true, sameSite: "strict", maxAge: ADMIN_TOKEN_MAX_AGE_MS });
  logAudit({ actorType: "admin", actorId: user.id, action: "mfa_enrolled", ipAddress: req.ip });
  logAudit({ actorType: "admin", actorId: user.id, action: "login_success", ipAddress: req.ip });
  res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
});

router.post("/admin/mfa/verify", requireAdminMfaPending, (req: AdminMfaPendingRequest, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const user = db.select().from(adminUsers).where(eq(adminUsers.id, req.adminMfaPending!.sub)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });
  if (!user.totpEnabledAt || !user.totpSecret) return res.status(400).json({ error: "NOT_ENROLLED" });

  const lockedUntil = checkLockout(user.email);
  if (lockedUntil) return res.status(429).json({ error: "LOCKED_OUT", lockedUntil: new Date(lockedUntil).toISOString() });

  if (!verifyTotp(user.totpSecret, parsed.data.code)) {
    recordFailedAttempt(user.email);
    logAudit({ actorType: "admin", actorId: user.id, action: "mfa_verify_failed", ipAddress: req.ip });
    return res.status(401).json({ error: "INVALID_CODE" });
  }

  clearAttempts(user.email);
  const token = signAdminToken({ sub: user.id });
  res.clearCookie("central_mfa_pending_token");
  res.cookie("central_access_token", token, { httpOnly: true, sameSite: "strict", maxAge: ADMIN_TOKEN_MAX_AGE_MS });
  logAudit({ actorType: "admin", actorId: user.id, action: "login_success", ipAddress: req.ip });
  res.json({ user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } });
});

router.post("/admin/logout", (_req, res) => { res.clearCookie("central_access_token"); res.json({ ok: true }); });

router.get("/admin/me", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const user = db.select().from(adminUsers).where(eq(adminUsers.id, req.adminAuth!.sub)).get();
  if (!user) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName });
});

export default router;
