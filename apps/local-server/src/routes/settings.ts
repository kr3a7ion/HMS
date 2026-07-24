// ST-01 Hotel/Property Configuration, ST-03 My Preferences.
//
// ST-02 Synchronization is now real -- see routes/sync.ts and
// services/sync.ts, built as part of Phase 3. ST-04 Door Lock Integration
// still stays mock -- needs a real TTLock API connection (Phase 4), not
// built here.
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { branches, userPreferences, syncState } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();
const MODULE_KEYS = ["restaurant", "inventory", "multiBranch", "doorLock"] as const;

// Blueprint 0.7: "The organization's plan tier is stored centrally and
// synced down to every branch's local server... Feature gating works
// correctly even in a fully offline branch." Effective modules are the
// intersection of this branch's own ST-01 toggle and whatever the central
// server's module licensing last said (Blueprint 0.6) -- if sync has never
// run, the branch works fully on its own local toggle alone (Blueprint 0.5
// step 8: operational before the first sync).
function serializeBranch(b: typeof branches.$inferSelect) {
  let localModules: string[] = [];
  try { localModules = JSON.parse(b.enabledModulesJson); } catch { /* malformed -- treat as none enabled */ }

  const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  let effectiveModules = localModules;
  if (state?.centralEnabledModulesJson) {
    try {
      const centralModules: string[] = JSON.parse(state.centralEnabledModulesJson);
      effectiveModules = localModules.filter(m => centralModules.includes(m));
    } catch { /* malformed central cache -- fall back to local toggle only */ }
  }

  return { ...b, enabledModulesJson: undefined, enabledModules: effectiveModules, localEnabledModules: localModules };
}

// GET is readable by any authenticated branch user -- the sidebar needs
// `enabledModules` to filter navigation regardless of the viewer's role,
// not just IT/MGT/ORG who can edit it.
router.get("/branch", requireAuth, (req: AuthedRequest, res) => {
  const branch = db.select().from(branches).where(eq(branches.id, req.auth!.branchId)).get();
  if (!branch) return res.status(404).json({ error: "NOT_FOUND" });
  res.json(serializeBranch(branch));
});

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(), address: z.string().optional(), contactPhone: z.string().optional(), contactEmail: z.string().optional(),
  checkInTime: z.string().optional(), checkOutTime: z.string().optional(), currency: z.string().optional(), timezone: z.string().optional(),
  taxName: z.string().optional(), taxRate: z.number().nonnegative().optional(), taxInclusive: z.boolean().optional(),
  rateRounding: z.number().int().nonnegative().optional(), discountApprovalThreshold: z.number().nonnegative().optional(),
  enabledModules: z.array(z.enum(MODULE_KEYS)).optional(),
});

router.post("/branch", requireAuth, requirePermission("settings:branch"), (req: AuthedRequest, res) => {
  const parsed = updateBranchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const { enabledModules, ...rest } = parsed.data;

  db.update(branches).set({
    ...rest,
    ...(enabledModules ? { enabledModulesJson: JSON.stringify(enabledModules) } : {}),
  }).where(eq(branches.id, req.auth!.branchId)).run();

  const updated = db.select().from(branches).where(eq(branches.id, req.auth!.branchId)).get()!;
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "branch_settings_updated", module: "Settings", recordId: req.auth!.branchId, details: Object.keys(parsed.data).join(", "), ipAddress: req.ip });
  res.json(serializeBranch(updated));
});

// ─── ST-03 My Preferences ───────────────────────────────────────────────────
function serializePrefs(p: typeof userPreferences.$inferSelect) {
  let notificationPrefs: Record<string, boolean> = {};
  try { notificationPrefs = JSON.parse(p.notificationPrefsJson); } catch { /* malformed -- treat as none set */ }
  return { ...p, notificationPrefsJson: undefined, notificationPrefs };
}

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const existing = db.select().from(userPreferences).where(eq(userPreferences.userId, req.auth!.userId)).get();
  if (existing) return res.json(serializePrefs(existing));
  // No row yet -- return schema defaults without writing one until the
  // user actually saves something.
  res.json({
    userId: req.auth!.userId, language: "en", dateFormat: "DD/MM/YYYY", timeFormat: "24h",
    notificationPrefs: { reservations: true, housekeeping: true, maintenance: true, finance: true, doorLock: true, chat: true, shiftHandover: true },
    updatedAt: null,
  });
});

const updatePrefsSchema = z.object({
  language: z.string().optional(), dateFormat: z.string().optional(), timeFormat: z.enum(["24h", "12h"]).optional(),
  notificationPrefs: z.record(z.boolean()).optional(),
});

const DEFAULT_NOTIFICATION_PREFS = { reservations: true, housekeeping: true, maintenance: true, finance: true, doorLock: true, chat: true, shiftHandover: true };

router.post("/me", requireAuth, (req: AuthedRequest, res) => {
  const parsed = updatePrefsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const existing = db.select().from(userPreferences).where(eq(userPreferences.userId, req.auth!.userId)).get();
  const now = new Date();
  // Merge against the existing row's prefs if there is one, otherwise the
  // schema defaults -- never against {}, or a first-ever partial update
  // would silently drop every category the caller didn't mention.
  const baseNotifications = existing ? JSON.parse(existing.notificationPrefsJson) : DEFAULT_NOTIFICATION_PREFS;
  const mergedNotifications = parsed.data.notificationPrefs
    ? JSON.stringify({ ...baseNotifications, ...parsed.data.notificationPrefs })
    : (existing?.notificationPrefsJson ?? JSON.stringify(DEFAULT_NOTIFICATION_PREFS));

  if (existing) {
    db.update(userPreferences).set({
      language: parsed.data.language ?? existing.language,
      dateFormat: parsed.data.dateFormat ?? existing.dateFormat,
      timeFormat: parsed.data.timeFormat ?? existing.timeFormat,
      notificationPrefsJson: mergedNotifications,
      updatedAt: now,
    }).where(eq(userPreferences.userId, req.auth!.userId)).run();
  } else {
    db.insert(userPreferences).values({
      userId: req.auth!.userId,
      language: parsed.data.language ?? "en",
      dateFormat: parsed.data.dateFormat ?? "DD/MM/YYYY",
      timeFormat: parsed.data.timeFormat ?? "24h",
      notificationPrefsJson: mergedNotifications,
      updatedAt: now,
    }).run();
  }

  const saved = db.select().from(userPreferences).where(eq(userPreferences.userId, req.auth!.userId)).get()!;
  res.json(serializePrefs(saved));
});

export default router;
