// HR-01 Staff Directory, HR-02 Staff Profile Detail, HR-03 Roles &
// Permissions, HR-04 Attendance, HR-05 Shift Scheduler, HR-06 Payroll
// Summary.
//
// HR-03 is real: the app's RBAC is now a DB-backed, per-role editable
// permission matrix (auth/permissions.ts, auth/permissionKeys.ts) --
// every route's requirePermission() call across the whole app checks it
// for real, not just this file. See ROADMAP.md for how the migration off
// the old hardcoded requireRole() role-string lists was verified safe
// (every permission key's grantee set was derived to exactly reproduce
// the prior behavior for all 12 built-in roles).
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, staffNotes, attendance, leaveRequests, shifts, roles } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { hashPassword } from "../auth/passwords.js";
import { PERMISSION_KEYS } from "../auth/permissionKeys.js";
import { roleHasAnyPermission, roleExists } from "../auth/permissions.js";
import { logAudit } from "../services/audit.js";

const router = Router();


const STAFF_COLUMNS = {
  id: users.id, email: users.email, role: users.role, firstName: users.firstName, lastName: users.lastName,
  status: users.status, employeeId: users.employeeId, department: users.department, phone: users.phone,
  emergencyContactName: users.emergencyContactName, emergencyContactPhone: users.emergencyContactPhone,
  startDate: users.startDate, payRate: users.payRate, contractType: users.contractType, createdAt: users.createdAt,
};

function isSelfOrManager(req: AuthedRequest, staffId: string) {
  return req.auth!.userId === staffId || roleHasAnyPermission(req.auth!.role, ["hr:manage"]);
}

// ─── Staff Directory (HR-01) ────────────────────────────────────────────────
router.get("/staff", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const department = typeof req.query.department === "string" ? req.query.department : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  let rows = db.select(STAFF_COLUMNS).from(users).where(eq(users.branchId, req.auth!.branchId)).all();
  if (department) rows = rows.filter(u => u.department === department);
  if (status) rows = rows.filter(u => u.status === status);
  res.json(rows);
});

const createStaffSchema = z.object({
  email: z.string().email(), firstName: z.string().min(1), lastName: z.string().min(1),
  role: z.string().min(1),
  department: z.string().min(1), phone: z.string().optional(),
  payRate: z.number().nonnegative().optional(),
  contractType: z.enum(["Full-time", "Part-time", "Contract"]).optional(),
});

function nextEmployeeId(branchId: string): string {
  const count = db.select().from(users).where(eq(users.branchId, branchId)).all().length;
  return `EMP-${String(count + 1).padStart(4, "0")}`;
}

function randomTempPassword(): string {
  return `Nx-${nanoid(10)}`;
}

router.post("/staff", requireAuth, requirePermission("hr:manage"), async (req: AuthedRequest, res) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  if (!roleExists(parsed.data.role)) return res.status(400).json({ error: "INVALID_ROLE" });

  const email = parsed.data.email.toLowerCase();
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) return res.status(409).json({ error: "EMAIL_IN_USE" });

  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const id = nanoid();
  const now = new Date();
  const employeeId = nextEmployeeId(req.auth!.branchId);
  db.insert(users).values({
    id, organizationId: req.auth!.orgId, branchId: req.auth!.branchId,
    email, passwordHash, role: parsed.data.role,
    firstName: parsed.data.firstName, lastName: parsed.data.lastName, status: "active",
    createdAt: now, employeeId, department: parsed.data.department,
    phone: parsed.data.phone, startDate: now, payRate: parsed.data.payRate,
    contractType: parsed.data.contractType,
  }).run();

  // Temp password returned once, here, for the manager to relay -- there's
  // no forced-change-on-next-login flow wired to real auth state yet (that's
  // a separate cross-cutting Auth piece, see App.tsx's ForceChangePassword
  // screen, currently UI-only), so this is a plain reset, not a one-time
  // credential the server invalidates itself.
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "staff_created", module: "HR & Staff", recordId: id, details: `${parsed.data.firstName} ${parsed.data.lastName} (${parsed.data.role})`, ipAddress: req.ip });
  res.status(201).json({ id, employeeId, tempPassword });
});

// ─── Staff Profile Detail (HR-02) ───────────────────────────────────────────
router.get("/staff/:id", requireAuth, (req: AuthedRequest, res) => {
  if (!isSelfOrManager(req, req.params.id)) return res.status(403).json({ error: "FORBIDDEN" });
  const target = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!target) return res.status(404).json({ error: "NOT_FOUND" });
  const staff = db.select(STAFF_COLUMNS).from(users).where(eq(users.id, req.params.id)).get()!;

  const notes = roleHasAnyPermission(req.auth!.role, ["hr:manage"])
    ? db.select({
        id: staffNotes.id, note: staffNotes.note, createdAt: staffNotes.createdAt,
        createdByFirstName: users.firstName, createdByLastName: users.lastName,
      }).from(staffNotes).leftJoin(users, eq(staffNotes.createdBy, users.id))
        .where(eq(staffNotes.userId, req.params.id)).orderBy(desc(staffNotes.createdAt)).all()
    : [];

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcomingShifts = db.select().from(shifts)
    .where(and(eq(shifts.userId, req.params.id), eq(shifts.published, true), gte(shifts.date, today), lte(shifts.date, in30Days)))
    .orderBy(shifts.date).all();

  const monthStart = today.slice(0, 8) + "01";
  const attendanceThisMonth = db.select().from(attendance)
    .where(and(eq(attendance.userId, req.params.id), gte(attendance.date, monthStart))).all();
  const attendanceSummary = {
    present: attendanceThisMonth.filter(a => a.status === "present").length,
    absent: attendanceThisMonth.filter(a => a.status === "absent").length,
    late: attendanceThisMonth.filter(a => a.status === "late").length,
    leave: attendanceThisMonth.filter(a => a.status === "leave").length,
  };

  res.json({ ...staff, notes, upcomingShifts, attendanceSummary });
});

const editStaffSchema = z.object({
  department: z.string().min(1).optional(), phone: z.string().optional(),
  emergencyContactName: z.string().optional(), emergencyContactPhone: z.string().optional(),
  role: z.string().min(1).optional(),
  contractType: z.enum(["Full-time", "Part-time", "Contract"]).optional(),
});

router.post("/staff/:id/update", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const staff = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = editStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  if (parsed.data.role && !roleExists(parsed.data.role)) return res.status(400).json({ error: "INVALID_ROLE" });
  db.update(users).set(parsed.data).where(eq(users.id, staff.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "staff_updated", module: "HR & Staff", recordId: staff.id, details: Object.keys(parsed.data).join(", "), ipAddress: req.ip });
  res.json(db.select(STAFF_COLUMNS).from(users).where(eq(users.id, staff.id)).get());
});

router.post("/staff/:id/deactivate", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const staff = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(users).set({ status: "deactivated" }).where(eq(users.id, staff.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "staff_deactivated", module: "HR & Staff", recordId: staff.id, details: `${staff.firstName} ${staff.lastName}`, ipAddress: req.ip });
  res.json({ ok: true });
});

router.post("/staff/:id/reset-password", requireAuth, requirePermission("hr:manage"), async (req: AuthedRequest, res) => {
  const staff = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(404).json({ error: "NOT_FOUND" });
  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  db.update(users).set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, staff.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "staff_password_reset", module: "HR & Staff", recordId: staff.id, details: `${staff.firstName} ${staff.lastName}`, ipAddress: req.ip });
  res.json({ tempPassword });
});

const payRateSchema = z.object({ payRate: z.number().nonnegative() });

router.post("/staff/:id/pay-rate", requireAuth, requirePermission("hr:payroll"), (req: AuthedRequest, res) => {
  const staff = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = payRateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(users).set({ payRate: parsed.data.payRate }).where(eq(users.id, staff.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "staff_pay_rate_changed", module: "HR & Staff", recordId: staff.id, details: `${staff.firstName} ${staff.lastName} -> ${parsed.data.payRate}`, ipAddress: req.ip });
  res.json({ ok: true });
});

const noteSchema = z.object({ note: z.string().min(1) });

router.post("/staff/:id/notes", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const staff = db.select().from(users).where(and(eq(users.id, req.params.id), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.insert(staffNotes).values({ id: nanoid(), branchId: req.auth!.branchId, userId: staff.id, note: parsed.data.note, createdBy: req.auth!.userId, createdAt: new Date() }).run();
  res.status(201).json({ ok: true });
});

// ─── Attendance (HR-04) ─────────────────────────────────────────────────────
router.get("/attendance", requireAuth, requirePermission("hr:payroll"), (req: AuthedRequest, res) => {
  const start = typeof req.query.start === "string" ? req.query.start : new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = typeof req.query.end === "string" ? req.query.end : new Date().toISOString().slice(0, 10);

  const staff = db.select(STAFF_COLUMNS).from(users).where(and(eq(users.branchId, req.auth!.branchId), eq(users.status, "active"))).all();
  const rows = db.select().from(attendance).where(and(eq(attendance.branchId, req.auth!.branchId), gte(attendance.date, start), lte(attendance.date, end))).all();
  const pendingLeave = db.select().from(leaveRequests).where(and(eq(leaveRequests.branchId, req.auth!.branchId), eq(leaveRequests.status, "pending"))).all();

  res.json({ start, end, staff, records: rows, pendingLeave });
});

const recordAttendanceSchema = z.object({
  userId: z.string(), date: z.string(), status: z.enum(["present", "absent", "late", "leave"]), notes: z.string().optional(),
});

router.post("/attendance", requireAuth, requirePermission("hr:payroll"), (req: AuthedRequest, res) => {
  const parsed = recordAttendanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const staff = db.select().from(users).where(and(eq(users.id, parsed.data.userId), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(400).json({ error: "STAFF_NOT_FOUND" });

  const existing = db.select().from(attendance).where(and(eq(attendance.userId, parsed.data.userId), eq(attendance.date, parsed.data.date))).get();
  const now = new Date();
  if (existing) {
    db.update(attendance).set({ status: parsed.data.status, notes: parsed.data.notes, recordedBy: req.auth!.userId, recordedAt: now }).where(eq(attendance.id, existing.id)).run();
  } else {
    db.insert(attendance).values({ id: nanoid(), branchId: req.auth!.branchId, userId: parsed.data.userId, date: parsed.data.date, status: parsed.data.status, notes: parsed.data.notes, recordedBy: req.auth!.userId, recordedAt: now }).run();
  }
  res.status(201).json({ ok: true });
});

// Leave requests are manager-recorded (on behalf of staff who called in),
// matching HR-04's "Record manual entry / Approve leave requests" language
// -- the Blueprint's HR module list has no separate staff self-service
// leave-request screen for this to feed from.
const createLeaveSchema = z.object({ userId: z.string(), startDate: z.string(), endDate: z.string(), reason: z.string().optional() });

router.post("/leave-requests", requireAuth, requirePermission("hr:payroll"), (req: AuthedRequest, res) => {
  const parsed = createLeaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const staff = db.select().from(users).where(and(eq(users.id, parsed.data.userId), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(400).json({ error: "STAFF_NOT_FOUND" });
  const id = nanoid();
  db.insert(leaveRequests).values({ id, branchId: req.auth!.branchId, userId: parsed.data.userId, startDate: parsed.data.startDate, endDate: parsed.data.endDate, reason: parsed.data.reason, status: "pending", requestedAt: new Date() }).run();
  res.status(201).json({ id });
});

const decideLeaveSchema = z.object({ decision: z.enum(["approved", "rejected"]) });

// Approving cascades into real attendance rows for every date in the leave
// range -- same "the consequence actually happens" bar as a received PO
// auto-posting stock transactions in the Inventory module.
router.post("/leave-requests/:id/decide", requireAuth, requirePermission("hr:payroll"), (req: AuthedRequest, res) => {
  const leave = db.select().from(leaveRequests).where(and(eq(leaveRequests.id, req.params.id), eq(leaveRequests.branchId, req.auth!.branchId))).get();
  if (!leave) return res.status(404).json({ error: "NOT_FOUND" });
  if (leave.status !== "pending") return res.status(409).json({ error: "ALREADY_DECIDED", status: leave.status });
  const parsed = decideLeaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  db.update(leaveRequests).set({ status: parsed.data.decision, decidedBy: req.auth!.userId, decidedAt: new Date() }).where(eq(leaveRequests.id, leave.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: `leave_request_${parsed.data.decision}`, module: "HR & Staff", recordId: leave.id, details: `${leave.startDate} to ${leave.endDate}`, ipAddress: req.ip });

  if (parsed.data.decision === "approved") {
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const existing = db.select().from(attendance).where(and(eq(attendance.userId, leave.userId), eq(attendance.date, dateStr))).get();
      const now = new Date();
      if (existing) db.update(attendance).set({ status: "leave", recordedBy: req.auth!.userId, recordedAt: now }).where(eq(attendance.id, existing.id)).run();
      else db.insert(attendance).values({ id: nanoid(), branchId: req.auth!.branchId, userId: leave.userId, date: dateStr, status: "leave", recordedBy: req.auth!.userId, recordedAt: now }).run();
    }
  }
  res.json({ ok: true });
});

// ─── Shift Scheduler (HR-05) ────────────────────────────────────────────────
router.get("/shifts", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const start = typeof req.query.start === "string" ? req.query.start : new Date().toISOString().slice(0, 10);
  const end = typeof req.query.end === "string" ? req.query.end : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const staff = db.select(STAFF_COLUMNS).from(users).where(and(eq(users.branchId, req.auth!.branchId), eq(users.status, "active"))).all();
  const rows = db.select().from(shifts).where(and(eq(shifts.branchId, req.auth!.branchId), gte(shifts.date, start), lte(shifts.date, end))).all();
  res.json({ start, end, staff, shifts: rows });
});

const setShiftSchema = z.object({ userId: z.string(), date: z.string(), shiftType: z.enum(["Morning", "Evening", "Night", "Off"]) });

router.post("/shifts", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const parsed = setShiftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const staff = db.select().from(users).where(and(eq(users.id, parsed.data.userId), eq(users.branchId, req.auth!.branchId))).get();
  if (!staff) return res.status(400).json({ error: "STAFF_NOT_FOUND" });

  const existing = db.select().from(shifts).where(and(eq(shifts.userId, parsed.data.userId), eq(shifts.date, parsed.data.date))).get();
  if (existing) db.update(shifts).set({ shiftType: parsed.data.shiftType }).where(eq(shifts.id, existing.id)).run();
  else db.insert(shifts).values({ id: nanoid(), branchId: req.auth!.branchId, userId: parsed.data.userId, date: parsed.data.date, shiftType: parsed.data.shiftType, published: false, createdBy: req.auth!.userId, createdAt: new Date() }).run();
  res.status(201).json({ ok: true });
});

const publishSchema = z.object({ start: z.string(), end: z.string() });

router.post("/shifts/publish", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const rows = db.select().from(shifts).where(and(eq(shifts.branchId, req.auth!.branchId), gte(shifts.date, parsed.data.start), lte(shifts.date, parsed.data.end))).all();
  for (const row of rows) db.update(shifts).set({ published: true }).where(eq(shifts.id, row.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "shifts_published", module: "HR & Staff", details: `${parsed.data.start} to ${parsed.data.end} (${rows.length} shifts)`, ipAddress: req.ip });
  res.json({ ok: true, count: rows.length });
});

const cloneSchema = z.object({ fromStart: z.string(), toStart: z.string() });

router.post("/shifts/clone", requireAuth, requirePermission("hr:manage"), (req: AuthedRequest, res) => {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const fromStart = new Date(parsed.data.fromStart);
  const toStart = new Date(parsed.data.toStart);
  const fromEnd = new Date(fromStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const source = db.select().from(shifts).where(and(eq(shifts.branchId, req.auth!.branchId), gte(shifts.date, fromStart.toISOString().slice(0, 10)), lte(shifts.date, fromEnd.toISOString().slice(0, 10)))).all();

  const offsetMs = toStart.getTime() - fromStart.getTime();
  let cloned = 0;
  for (const row of source) {
    const newDate = new Date(new Date(row.date).getTime() + offsetMs).toISOString().slice(0, 10);
    const existing = db.select().from(shifts).where(and(eq(shifts.userId, row.userId), eq(shifts.date, newDate))).get();
    if (existing) continue;
    db.insert(shifts).values({ id: nanoid(), branchId: req.auth!.branchId, userId: row.userId, date: newDate, shiftType: row.shiftType, published: false, createdBy: req.auth!.userId, createdAt: new Date() }).run();
    cloned++;
  }
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "shifts_cloned", module: "HR & Staff", details: `${parsed.data.fromStart} -> ${parsed.data.toStart} (${cloned} shifts)`, ipAddress: req.ip });
  res.json({ ok: true, cloned });
});

// ─── Payroll Summary (HR-06) ────────────────────────────────────────────────
// Gross pay is each staff member's flat monthly payRate; unapproved absence
// days in the period deduct a prorated daily rate (payRate / 30). No
// overtime, tax, or benefits modeling -- those need real time-tracking and
// payroll-rules infrastructure this pass doesn't build. "Adjust rate on
// file" is PATCH /hr/staff/:id/pay-rate above.
router.get("/payroll", requireAuth, requirePermission("hr:payroll"), (req: AuthedRequest, res) => {
  const period = typeof req.query.period === "string" ? req.query.period : new Date().toISOString().slice(0, 7);
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-31`;

  const staff = db.select(STAFF_COLUMNS).from(users)
    .where(and(eq(users.branchId, req.auth!.branchId), eq(users.status, "active")))
    .all()
    .filter(s => s.payRate != null);

  const results = staff.map(s => {
    const records = db.select().from(attendance).where(and(eq(attendance.userId, s.id), gte(attendance.date, periodStart), lte(attendance.date, periodEnd))).all();
    const absentDays = records.filter(r => r.status === "absent").length;
    const baseSalary = s.payRate ?? 0;
    const deductions = Math.round((baseSalary / 30) * absentDays);
    const net = baseSalary - deductions;
    return { id: s.id, firstName: s.firstName, lastName: s.lastName, department: s.department, baseSalary, overtime: 0, absentDays, deductions, net };
  });

  res.json({
    period, staff: results,
    totalGross: results.reduce((sum, r) => sum + r.baseSalary + r.overtime, 0),
    totalDeductions: results.reduce((sum, r) => sum + r.deductions, 0),
    totalNet: results.reduce((sum, r) => sum + r.net, 0),
  });
});

// ─── HR-03 Roles & Permissions ──────────────────────────────────────────────
// "Role list left; permission matrix for selected role right (each
// module/action as toggle row). Actions: Edit permissions, Create custom
// role, View role's current users." -- Blueprint HR-03. Real DB-backed
// roles (auth/permissionKeys.ts, db/schema.ts's `roles` table); editing a
// role's permissions here is what actually changes what that role's users
// can do at every requirePermission() gate in the app, and immediately
// invalidates any of their active sessions via the permissions_hash
// mismatch check in auth/middleware.ts -- not cosmetic.
router.get("/roles", requireAuth, requirePermission("roles:manage"), (_req: AuthedRequest, res) => {
  const allRoles = db.select().from(roles).all();
  const rows = allRoles.map(r => {
    const userCount = db.select({ id: users.id }).from(users).where(eq(users.role, r.id)).all().length;
    const permissions = JSON.parse(r.permissionsJson) as string[] | "*";
    return {
      id: r.id, name: r.name, isSystemRole: r.isSystemRole,
      permissionCount: permissions === "*" ? PERMISSION_KEYS.length : permissions.length,
      userCount,
    };
  });
  res.json(rows);
});

router.get("/roles/:id", requireAuth, requirePermission("roles:manage"), (req: AuthedRequest, res) => {
  const role = db.select().from(roles).where(eq(roles.id, req.params.id)).get();
  if (!role) return res.status(404).json({ error: "NOT_FOUND" });
  const roleUsers = db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users).where(eq(users.role, role.id)).all();
  res.json({
    id: role.id, name: role.name, isSystemRole: role.isSystemRole,
    permissions: JSON.parse(role.permissionsJson) as string[] | "*",
    catalog: PERMISSION_KEYS,
    users: roleUsers,
  });
});

const permissionsListSchema = z.union([z.literal("*"), z.array(z.string())]);

function validatePermissions(perms: unknown): string[] | "*" | null {
  const parsed = permissionsListSchema.safeParse(perms);
  if (!parsed.success) return null;
  if (parsed.data === "*") return "*";
  if (!parsed.data.every(k => PERMISSION_KEYS.some(p => p.key === k))) return null;
  return parsed.data;
}

const createRoleSchema = z.object({ name: z.string().min(1) });

router.post("/roles", requireAuth, requirePermission("roles:manage"), (req: AuthedRequest, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const permissions = validatePermissions(req.body.permissions ?? []);
  if (permissions === null) return res.status(400).json({ error: "INVALID_PERMISSIONS" });

  const id = nanoid();
  db.insert(roles).values({ id, name: parsed.data.name, isSystemRole: false, permissionsJson: JSON.stringify(permissions), createdAt: new Date() }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "role_created", module: "HR & Staff", recordId: id, details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ id });
});

router.post("/roles/:id/permissions", requireAuth, requirePermission("roles:manage"), (req: AuthedRequest, res) => {
  const role = db.select().from(roles).where(eq(roles.id, req.params.id)).get();
  if (!role) return res.status(404).json({ error: "NOT_FOUND" });
  const permissions = validatePermissions(req.body.permissions);
  if (permissions === null) return res.status(400).json({ error: "INVALID_PERMISSIONS" });

  db.update(roles).set({ permissionsJson: JSON.stringify(permissions) }).where(eq(roles.id, role.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "role_permissions_changed", module: "HR & Staff", recordId: role.id, details: role.name, ipAddress: req.ip });
  res.json({ ok: true });
});

router.delete("/roles/:id", requireAuth, requirePermission("roles:manage"), (req: AuthedRequest, res) => {
  const role = db.select().from(roles).where(eq(roles.id, req.params.id)).get();
  if (!role) return res.status(404).json({ error: "NOT_FOUND" });
  if (role.isSystemRole) return res.status(400).json({ error: "CANNOT_DELETE_SYSTEM_ROLE" });
  const inUse = db.select({ id: users.id }).from(users).where(eq(users.role, role.id)).get();
  if (inUse) return res.status(409).json({ error: "ROLE_IN_USE" });

  db.delete(roles).where(eq(roles.id, role.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "role_deleted", module: "HR & Staff", recordId: role.id, details: role.name, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
