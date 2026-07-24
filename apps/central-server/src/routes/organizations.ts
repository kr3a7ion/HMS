// Platform Admin Console backend -- Blueprint 0.6 and Auth doc 3.4:
// organization list, org + Super Admin creation, branch provisioning
// (issues a sync key), module licensing, billing status.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations, branches, orgUsers, auditLog } from "../db/schema.js";
import { hashPassword } from "../auth/passwords.js";
import { requireAdminAuth, type AdminAuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();
const MODULE_KEYS = ["restaurant", "inventory", "multiBranch", "doorLock"] as const;

function randomSyncKey(): string {
  return `sk_${crypto.randomBytes(24).toString("hex")}`;
}

router.get("/", requireAdminAuth, (_req: AdminAuthedRequest, res) => {
  const orgs = db.select().from(organizations).all();
  const withCounts = orgs.map(o => {
    const orgBranches = db.select().from(branches).where(eq(branches.organizationId, o.id)).all();
    const lastSync = orgBranches.reduce<Date | null>((latest, b) => (!latest || (b.lastSyncAt && b.lastSyncAt > latest)) ? (b.lastSyncAt ?? latest) : latest, null);
    return { ...o, enabledModulesJson: undefined, enabledModules: JSON.parse(o.enabledModulesJson), branchCount: orgBranches.length, lastSyncAt: lastSync };
  });
  res.json(withCounts);
});

// Blueprint 0.6 "Branch provisioning tracker" -- flat cross-organization
// list, since the Admin Console's Branch Tracker tab needs to see every
// branch regardless of which org it belongs to, not one org at a time.
router.get("/branches/all", requireAdminAuth, (_req: AdminAuthedRequest, res) => {
  const allBranches = db.select().from(branches).all();
  const rows = allBranches.map(b => {
    const org = db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, b.organizationId)).get();
    return {
      id: b.id, name: b.name, organizationId: b.organizationId, organizationName: org?.name ?? "—",
      lastSyncAt: b.lastSyncAt, lastSyncStatus: b.lastSyncStatus, lastSyncError: b.lastSyncError,
      currentVersion: b.currentVersion, lastUpdateCheckAt: b.lastUpdateCheckAt, lastUpdateStatus: b.lastUpdateStatus,
      updateChannel: b.updateChannel, forceUpdateRequestedAt: b.forceUpdateRequestedAt, rollbackToVersion: b.rollbackToVersion,
    };
  });
  res.json(rows);
});

// Distribution (Auth/Distribution doc Part 11). "Force update" and
// "rollback" only ever SET a flag/target-version here -- the branch picks
// it up on its next sync pull (server/src/services/sync.ts) and clears it
// once acted on, same asymmetric pattern as the KPI sync. This endpoint
// can't reach into a branch's LAN and swap its container directly; that's
// the point of the offline-first architecture (Auth doc 12.1) -- it can
// only ever ask, never push.
router.post("/branches/:branchId/force-update", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const branch = db.select().from(branches).where(eq(branches.id, req.params.branchId)).get();
  if (!branch) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(branches).set({ forceUpdateRequestedAt: new Date() }).where(eq(branches.id, branch.id)).run();
  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: branch.organizationId, branchId: branch.id, action: "force_update_requested", ipAddress: req.ip });
  res.json({ ok: true });
});

const rollbackSchema = z.object({ version: z.string().min(1) });
router.post("/branches/:branchId/rollback", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const branch = db.select().from(branches).where(eq(branches.id, req.params.branchId)).get();
  if (!branch) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = rollbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(branches).set({ rollbackToVersion: parsed.data.version }).where(eq(branches.id, branch.id)).run();
  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: branch.organizationId, branchId: branch.id, action: "rollback_requested", details: parsed.data.version, ipAddress: req.ip });
  res.json({ ok: true });
});

const channelSchema = z.object({ channel: z.enum(["stable", "beta"]) });
router.post("/branches/:branchId/channel", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const branch = db.select().from(branches).where(eq(branches.id, req.params.branchId)).get();
  if (!branch) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(branches).set({ updateChannel: parsed.data.channel }).where(eq(branches.id, branch.id)).run();
  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: branch.organizationId, branchId: branch.id, action: "update_channel_changed", details: parsed.data.channel, ipAddress: req.ip });
  res.json({ ok: true });
});

const createOrgSchema = z.object({
  name: z.string().min(1), planTier: z.enum(["starter", "growth", "business"]).default("starter"),
  adminEmail: z.string().email(), adminFirstName: z.string().min(1), adminLastName: z.string().min(1),
});

// Blueprint 0.5 steps 2-3: Platform Owner creates the Organization record
// and its first Super Admin in one action.
router.post("/", requireAdminAuth, async (req: AdminAuthedRequest, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  if (db.select().from(orgUsers).where(eq(orgUsers.email, parsed.data.adminEmail.toLowerCase())).get()) return res.status(409).json({ error: "EMAIL_IN_USE" });

  const orgId = nanoid();
  const now = new Date();
  db.insert(organizations).values({ id: orgId, name: parsed.data.name, planTier: parsed.data.planTier, billingStatus: "current", createdAt: now }).run();

  const tempPassword = `Nx-${nanoid(10)}`;
  const passwordHash = await hashPassword(tempPassword);
  const adminId = nanoid();
  db.insert(orgUsers).values({ id: adminId, organizationId: orgId, email: parsed.data.adminEmail.toLowerCase(), passwordHash, firstName: parsed.data.adminFirstName, lastName: parsed.data.adminLastName, createdAt: now }).run();

  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: orgId, action: "organization_created", details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ organizationId: orgId, superAdmin: { id: adminId, email: parsed.data.adminEmail, tempPassword } });
});

router.get("/:id", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const org = db.select().from(organizations).where(eq(organizations.id, req.params.id)).get();
  if (!org) return res.status(404).json({ error: "NOT_FOUND" });
  const orgBranches = db.select().from(branches).where(eq(branches.organizationId, org.id)).all().map(b => ({ ...b, syncKeyHash: undefined }));
  const admins = db.select({ id: orgUsers.id, email: orgUsers.email, firstName: orgUsers.firstName, lastName: orgUsers.lastName }).from(orgUsers).where(eq(orgUsers.organizationId, org.id)).all();
  res.json({ ...org, enabledModulesJson: undefined, enabledModules: JSON.parse(org.enabledModulesJson), branches: orgBranches, admins });
});

const billingSchema = z.object({ billingStatus: z.enum(["current", "overdue", "suspended"]) });
router.post("/:id/billing-status", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const org = db.select().from(organizations).where(eq(organizations.id, req.params.id)).get();
  if (!org) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = billingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(organizations).set({ billingStatus: parsed.data.billingStatus }).where(eq(organizations.id, org.id)).run();
  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: org.id, action: "billing_status_changed", details: parsed.data.billingStatus, ipAddress: req.ip });
  res.json({ ok: true });
});

const modulesSchema = z.object({ enabledModules: z.array(z.enum(MODULE_KEYS)) });
router.post("/:id/modules", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const org = db.select().from(organizations).where(eq(organizations.id, req.params.id)).get();
  if (!org) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = modulesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(organizations).set({ enabledModulesJson: JSON.stringify(parsed.data.enabledModules) }).where(eq(organizations.id, org.id)).run();
  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: org.id, action: "module_licensing_changed", details: parsed.data.enabledModules.join(","), ipAddress: req.ip });
  res.json({ ok: true });
});

const provisionBranchSchema = z.object({ name: z.string().min(1) });

// Blueprint 0.5 step 4 / 0.4: Super Admin (or Platform Owner) provisions an
// additional branch -- issues a sync key the local server is configured
// with once, at install time. Shown in plaintext exactly once, same pattern
// as every other temp-credential issuance in this codebase.
router.post("/:id/branches", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const org = db.select().from(organizations).where(eq(organizations.id, req.params.id)).get();
  if (!org) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = provisionBranchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const syncKey = randomSyncKey();
  const id = nanoid();
  db.insert(branches).values({ id, organizationId: org.id, name: parsed.data.name, syncKeyHash: crypto.createHash("sha256").update(syncKey).digest("hex"), lastSyncStatus: "never", createdAt: new Date() }).run();
  logAudit({ actorType: "admin", actorId: req.adminAuth!.sub, organizationId: org.id, branchId: id, action: "branch_provisioned", details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ id, name: parsed.data.name, syncKey });
});

router.get("/:id/audit-log", requireAdminAuth, (req: AdminAuthedRequest, res) => {
  const org = db.select().from(organizations).where(eq(organizations.id, req.params.id)).get();
  if (!org) return res.status(404).json({ error: "NOT_FOUND" });
  const rows = db.select().from(auditLog).where(eq(auditLog.organizationId, org.id)).orderBy(desc(auditLog.createdAt)).limit(200).all();
  res.json(rows);
});

export default router;
