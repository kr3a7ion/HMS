// IT-01 User Management, IT-02 System Health, IT-03 Device Management,
// IT-04 Backup & Restore, IT-05 Audit Log.
//
// IT-01 deliberately duplicates a couple of small helpers from
// server/src/routes/hr.ts (employee ID sequencing, temp password
// generation) rather than importing from it -- HR-02's "Reset
// Password"/"Deactivate" are MGT/ORG-only per the Blueprint's HR role
// matrix, while IT-01 wants the same actions available to IT too. Rather
// than loosen HR's role gate to match IT's broader one, both screens get
// their own endpoint with the role gate the Blueprint actually specifies
// for that screen, sharing the same `users` table underneath.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, sqlite } from "../db/client.js";
import { users, activeSessions, backupSnapshots, auditLog } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { hashPassword } from "../auth/passwords.js";
import { roleExists } from "../auth/permissions.js";
import { logAudit } from "../services/audit.js";
import { getErrorLog } from "../services/errorLog.js";

const router = Router();

function nextEmployeeId(branchId: string): string {
  const count = db.select().from(users).where(eq(users.branchId, branchId)).all().length;
  return `EMP-${String(count + 1).padStart(4, "0")}`;
}
function randomTempPassword(): string {
  return `Nx-${nanoid(10)}`;
}

// --- IT-01 User Management ------------------------------------------------------------
router.get("/users", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const rows = db.select({
    id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email,
    role: users.role, department: users.department, status: users.status,
  }).from(users).where(eq(users.branchId, req.auth!.branchId)).all();

  const withLastLogin = rows.map(u => {
    const lastSession = db.select({ issuedAt: activeSessions.issuedAt }).from(activeSessions)
      .where(eq(activeSessions.userId, u.id)).orderBy(desc(activeSessions.issuedAt)).limit(1).get();
    return { ...u, lastLogin: lastSession?.issuedAt ?? null };
  });
  res.json(withLastLogin);
});

const inviteSchema = z.object({
  email: z.string().email(), firstName: z.string().min(1), lastName: z.string().min(1),
  role: z.string().min(1),
});

router.post("/users", requireAuth, requirePermission("admin:manage"), async (req: AuthedRequest, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  if (!roleExists(parsed.data.role)) return res.status(400).json({ error: "INVALID_ROLE" });
  if (db.select().from(users).where(eq(users.email, parsed.data.email)).get()) return res.status(409).json({ error: "EMAIL_IN_USE" });

  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const id = nanoid();
  const now = new Date();
  const employeeId = nextEmployeeId(req.auth!.branchId);
  db.insert(users).values({
    id, organizationId: req.auth!.orgId, branchId: req.auth!.branchId,
    email: parsed.data.email, passwordHash, role: parsed.data.role,
    firstName: parsed.data.firstName, lastName: parsed.data.lastName, status: "active",
    createdAt: now, employeeId,
  }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "user_invited", module: "IT Admin", recordId: id, details: `Invited ${parsed.data.email} as ${parsed.data.role}`, ipAddress: req.ip });
  res.status(201).json({ id, employeeId, tempPassword });
});

const roleSchema = z.object({ role: z.string().min(1) });

router.post("/users/:id/role", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const target = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!target) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  if (!roleExists(parsed.data.role)) return res.status(400).json({ error: "INVALID_ROLE" });
  db.update(users).set({ role: parsed.data.role }).where(eq(users.id, target.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "user_role_changed", module: "IT Admin", recordId: target.id, details: `${target.role} -> ${parsed.data.role}`, ipAddress: req.ip });
  res.json({ ok: true });
});

router.post("/users/:id/reset-password", requireAuth, requirePermission("admin:manage"), async (req: AuthedRequest, res) => {
  const target = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!target) return res.status(404).json({ error: "NOT_FOUND" });
  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  db.update(users).set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, target.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "user_password_reset", module: "IT Admin", recordId: target.id, ipAddress: req.ip });
  res.json({ tempPassword });
});

router.post("/users/:id/deactivate", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const target = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!target) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(users).set({ status: "deactivated" }).where(eq(users.id, target.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "user_deactivated", module: "IT Admin", recordId: target.id, ipAddress: req.ip });
  res.json({ ok: true });
});

router.post("/users/:id/reactivate", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const target = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!target) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(users).set({ status: "active" }).where(eq(users.id, target.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "user_reactivated", module: "IT Admin", recordId: target.id, ipAddress: req.ip });
  res.json({ ok: true });
});

router.get("/users/:id/audit-log", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const target = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!target) return res.status(404).json({ error: "NOT_FOUND" });
  const rows = db.select().from(auditLog).where(eq(auditLog.userId, target.id)).orderBy(desc(auditLog.createdAt)).limit(200).all();
  res.json(rows);
});

// --- IT-02 System Health ------------------------------------------------------------
// Network/internet reachability and latency-to-central-server are
// deliberately absent -- there's no central server yet (Phase 3), and this
// app's whole model is LAN-only/offline-first, so "internet status" isn't
// meaningful pre-Phase-3. "Restart service" and "Send health report" are
// UI-only for the same reason as Daily Summary's cash drawer -- no process
// supervisor (pm2/systemd/Windows service) or email infra exists to back
// them for real. See ROADMAP.md.
router.get("/system-health", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const cpus = os.cpus();
  const cpuLoad = os.loadavg()[0]; // 1-minute load average
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const dbPath = process.env.NEXURA_DB_PATH ?? path.resolve(process.cwd(), "data/nexura.db");
  let dbSizeBytes = 0;
  let dbConnected = false;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
    db.select().from(users).limit(1).all();
    dbConnected = true;
  } catch { /* dbConnected stays false */ }
  const lastBackup = db.select().from(backupSnapshots).where(eq(backupSnapshots.branchId, req.auth!.branchId)).orderBy(desc(backupSnapshots.createdAt)).limit(1).get();

  res.json({
    server: {
      cpuCount: cpus.length, cpuLoad1m: Math.round(cpuLoad * 100) / 100,
      memTotalMb: Math.round(totalMem / 1024 / 1024), memUsedPct: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
      uptimeSeconds: Math.round(process.uptime()),
    },
    database: { connected: dbConnected, sizeBytes: dbSizeBytes, lastBackupAt: lastBackup?.createdAt ?? null },
    services: [{ name: "nexura-local-server", status: "up", uptimeSeconds: Math.round(process.uptime()) }],
  });
});

router.post("/diagnostics", requireAuth, requirePermission("admin:manage"), (req: AuthedRequest, res) => {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

  try { db.select().from(users).limit(1).all(); checks.push({ name: "Database reachable", pass: true }); }
  catch (e) { checks.push({ name: "Database reachable", pass: false, detail: e instanceof Error ? e.message : String(e) }); }

  const expectedTables = ["users", "reservations", "rooms", "audit_log", "backup_snapshots"];
  const actualTables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t: any) => t.name));
  const missing = expectedTables.filter(t => !actualTables.has(t));
  checks.push({ name: "Expected tables present", pass: missing.length === 0, detail: missing.length > 0 ? `Missing: ${missing.join(", ")}` : undefined });

  const walMode = sqlite.pragma("journal_mode", { simple: true });
  checks.push({ name: "WAL journal mode enabled", pass: walMode === "wal", detail: `Actual: ${walMode}` });

  const freeMemPct = (os.freemem() / os.totalmem()) * 100;
  checks.push({ name: "Free memory above 10%", pass: freeMemPct > 10, detail: `${Math.round(freeMemPct)}% free` });

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "diagnostics_run", module: "IT Admin", details: `${checks.filter(c => c.pass).length}/${checks.length} passed`, ipAddress: req.ip });
  res.json({ ranAt: new Date().toISOString(), checks });
});

router.get("/error-log", requireAuth, requirePermission("admin:manage"), (_req: AuthedRequest, res) => {
  res.json(getErrorLog());
});

// --- IT-03 Device Management ------------------------------------------------------------
// No MAC address -- browsers/JS never expose one to a server over HTTP,
// that's a hard privacy limit, not a gap in this schema. "Devices" here are
// real login sessions (active_sessions), grouped by IP + user agent, not a
// fabricated device inventory -- see ROADMAP.md.
router.get("/devices", requireAuth, requirePermission("admin:devices"), (req: AuthedRequest, res) => {
  const sessions = db.select({
    sessionId: activeSessions.sessionId, userId: activeSessions.userId, ipAddress: activeSessions.ipAddress,
    userAgent: activeSessions.userAgent, lastActiveAt: activeSessions.lastActiveAt, issuedAt: activeSessions.issuedAt,
    revokedAt: activeSessions.revokedAt, userFirstName: users.firstName, userLastName: users.lastName, userDepartment: users.department,
  })
    .from(activeSessions)
    .leftJoin(users, eq(activeSessions.userId, users.id))
    .where(eq(activeSessions.branchId, req.auth!.branchId))
    .orderBy(desc(activeSessions.lastActiveAt))
    .all();

  const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
  const withStatus = sessions.map(s => ({
    ...s,
    status: s.revokedAt ? "Revoked" : (s.lastActiveAt && s.lastActiveAt.getTime() > fifteenMinAgo) ? "Online" : "Idle",
  }));
  res.json(withStatus);
});

router.post("/devices/:sessionId/deauthorize", requireAuth, requirePermission("admin:devices"), (req: AuthedRequest, res) => {
  const session = db.select().from(activeSessions).where(and(eq(activeSessions.sessionId, req.params.sessionId), eq(activeSessions.branchId, req.auth!.branchId))).get();
  if (!session) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(activeSessions).set({ revokedAt: new Date(), revokeReason: "deauthorized_by_it" }).where(eq(activeSessions.sessionId, session.sessionId)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "device_deauthorized", module: "IT Admin", recordId: session.sessionId, details: `IP ${session.ipAddress ?? "unknown"}`, ipAddress: req.ip });
  res.json({ ok: true });
});

// --- IT-04 Backup & Restore ------------------------------------------------------------
// Local only. "Restore from Cloud" and scheduled/automatic backups
// (frequency selector) are deferred -- no cloud storage credentials and no
// task scheduler dependency in this environment. See ROADMAP.md and the
// pending-restore-on-boot comment in db/client.ts for how restore is
// actually applied.
const backupDir = path.resolve(process.cwd(), "data/backups");

router.get("/backups", requireAuth, requirePermission("admin:operations"), (req: AuthedRequest, res) => {
  const rows = db.select({
    id: backupSnapshots.id, fileName: backupSnapshots.fileName, sizeBytes: backupSnapshots.sizeBytes,
    type: backupSnapshots.type, status: backupSnapshots.status, createdAt: backupSnapshots.createdAt, restoredAt: backupSnapshots.restoredAt,
    createdByFirstName: users.firstName, createdByLastName: users.lastName,
  })
    .from(backupSnapshots).leftJoin(users, eq(backupSnapshots.createdBy, users.id))
    .where(eq(backupSnapshots.branchId, req.auth!.branchId)).orderBy(desc(backupSnapshots.createdAt)).all();
  res.json(rows);
});

router.post("/backups", requireAuth, requirePermission("admin:operations"), async (req: AuthedRequest, res) => {
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const fileName = `nexura-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  const destPath = path.join(backupDir, fileName);
  try {
    await sqlite.backup(destPath);
  } catch (e) {
    return res.status(500).json({ error: "BACKUP_FAILED", details: e instanceof Error ? e.message : String(e) });
  }
  const sizeBytes = fs.statSync(destPath).size;
  const id = nanoid();
  db.insert(backupSnapshots).values({ id, branchId: req.auth!.branchId, fileName, sizeBytes, type: "local", status: "completed", createdBy: req.auth!.userId, createdAt: new Date() }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "backup_created", module: "IT Admin", recordId: id, details: fileName, ipAddress: req.ip });
  res.status(201).json({ id, fileName, sizeBytes });
});

const restoreSchema = z.object({ confirm: z.literal("RESTORE") });

router.post("/backups/:id/restore", requireAuth, requirePermission("admin:operations"), (req: AuthedRequest, res) => {
  const snapshot = db.select().from(backupSnapshots).where(and(eq(backupSnapshots.id, req.params.id), eq(backupSnapshots.branchId, req.auth!.branchId))).get();
  if (!snapshot) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "CONFIRMATION_REQUIRED", message: "Body must include { confirm: \"RESTORE\" }" });

  const snapshotPath = path.join(backupDir, snapshot.fileName);
  if (!fs.existsSync(snapshotPath)) return res.status(410).json({ error: "SNAPSHOT_FILE_MISSING" });

  const dbPath = process.env.NEXURA_DB_PATH ?? path.resolve(process.cwd(), "data/nexura.db");
  fs.writeFileSync(`${dbPath}.pending-restore`, snapshotPath, "utf8");
  db.update(backupSnapshots).set({ status: "restore_pending" }).where(eq(backupSnapshots.id, snapshot.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "restore_staged", module: "IT Admin", recordId: snapshot.id, details: snapshot.fileName, ipAddress: req.ip });
  res.json({ ok: true, requiresRestart: true, message: "Restore staged. Restart the local server to apply it." });
});

// --- IT-05 Audit Log ------------------------------------------------------------
router.get("/audit-log", requireAuth, requirePermission("admin:operations"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const module_ = typeof req.query.module === "string" ? req.query.module : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(`${req.query.dateTo}T23:59:59.999Z`) : undefined;

  const conditions = [eq(auditLog.branchId, branchId)];
  if (userId) conditions.push(eq(auditLog.userId, userId));
  if (module_) conditions.push(eq(auditLog.module, module_));
  if (action) conditions.push(eq(auditLog.action, action));
  if (dateFrom) conditions.push(gte(auditLog.createdAt, dateFrom));
  if (dateTo) conditions.push(lte(auditLog.createdAt, dateTo));

  const rows = db.select({
    id: auditLog.id, action: auditLog.action, module: auditLog.module, recordId: auditLog.recordId,
    ipAddress: auditLog.ipAddress, details: auditLog.details, createdAt: auditLog.createdAt,
    userFirstName: users.firstName, userLastName: users.lastName, userRole: users.role,
  })
    .from(auditLog).leftJoin(users, eq(auditLog.userId, users.id))
    .where(and(...conditions)).orderBy(desc(auditLog.createdAt)).limit(500).all();
  res.json(rows);
});

export default router;
