// The branch<->central sync protocol -- deliberately scoped to KPI
// snapshots (occupancy, revenue, active guests, open issues), not full
// record-level bidirectional replication of every table. Blueprint Phase 3
// describes "opportunistic push/pull, per-record pending-sync badges,
// Conflict Resolution Modal" -- that's a real distributed-systems sync
// engine for reservations/guests/folios etc., which is enterprise-scale
// work Multi-Branch's actual 3 screens (aggregated cross-branch KPIs) don't
// need to be genuinely real. See ROADMAP.md.
//
// Auth here is a per-branch sync key (issued at provisioning,
// POST /organizations/:id/branches), not a user JWT -- this is a
// machine-to-machine credential, not a login.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { branches, branchSnapshots, organizations } from "../db/schema.js";
import { logAudit } from "../services/audit.js";

const router = Router();

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function authenticateBranch(req: any, res: any): typeof branches.$inferSelect | null {
  const branchId = req.params.branchId ?? req.body.branchId;
  const syncKey = req.headers["x-branch-sync-key"];
  if (!branchId || typeof syncKey !== "string") { res.status(401).json({ error: "MISSING_SYNC_CREDENTIALS" }); return null; }
  const branch = db.select().from(branches).where(eq(branches.id, branchId)).get();
  if (!branch || branch.syncKeyHash !== hashKey(syncKey)) { res.status(401).json({ error: "INVALID_SYNC_KEY" }); return null; }
  return branch;
}

const pushSchema = z.object({
  branchId: z.string(),
  occupancyRate: z.number(), revenueToday: z.number(), activeGuests: z.number().int(), openIssues: z.number().int(),
  roomsTotal: z.number().int(), adr: z.number().optional(), revpar: z.number().optional(),
  // The local side (services/branchKpis.ts) can genuinely have no
  // MGT-role user on file for a branch and returns null, not undefined --
  // .optional() alone rejects a literal null, so this needs .nullable() too.
  branchManagerName: z.string().nullable().optional(),
  // Distribution (Auth/Distribution doc Part 11.2 step 6: "Update
  // completion logged to central server -- Platform Owner can see which
  // branches are on which version"). Reported by the branch itself, same
  // "you push your own state" asymmetry as the KPI fields above.
  currentVersion: z.string().optional(),
  // Must match server/src/services/updater/index.ts's real CheckResult.status
  // union exactly -- this rejected a genuine "not_configured" push and
  // silently downgraded every push into a 400 until caught by a live test.
  lastUpdateStatus: z.enum(["up_to_date", "update_available", "failed", "not_configured"]).optional(),
  acknowledgeForceUpdate: z.boolean().optional(),
  acknowledgeRollback: z.boolean().optional(),
});

router.post("/push", (req, res) => {
  const branch = authenticateBranch(req, res);
  if (!branch) return;
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) {
    db.update(branches).set({ lastSyncStatus: "error", lastSyncError: "INVALID_PAYLOAD" }).where(eq(branches.id, branch.id)).run();
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const now = new Date();
  db.insert(branchSnapshots).values({
    id: nanoid(), branchId: branch.id, occupancyRate: parsed.data.occupancyRate, revenueToday: parsed.data.revenueToday,
    activeGuests: parsed.data.activeGuests, openIssues: parsed.data.openIssues, roomsTotal: parsed.data.roomsTotal,
    adr: parsed.data.adr ?? 0, revpar: parsed.data.revpar ?? 0, branchManagerName: parsed.data.branchManagerName, syncedAt: now,
  }).run();
  const deploymentUpdate: Partial<typeof branches.$inferInsert> = { lastSyncAt: now, lastSyncStatus: "ok", lastSyncError: null };
  if (parsed.data.currentVersion) deploymentUpdate.currentVersion = parsed.data.currentVersion;
  if (parsed.data.lastUpdateStatus) { deploymentUpdate.lastUpdateStatus = parsed.data.lastUpdateStatus; deploymentUpdate.lastUpdateCheckAt = now; }
  // The branch clears these itself once it's genuinely acted on the
  // instruction -- central never optimistically clears a flag it can't
  // confirm was received.
  if (parsed.data.acknowledgeForceUpdate) deploymentUpdate.forceUpdateRequestedAt = null;
  if (parsed.data.acknowledgeRollback) deploymentUpdate.rollbackToVersion = null;
  db.update(branches).set(deploymentUpdate).where(eq(branches.id, branch.id)).run();
  logAudit({ actorType: "branch_sync", branchId: branch.id, organizationId: branch.organizationId, action: "sync_push", ipAddress: req.ip });
  res.json({ ok: true, syncedAt: now.toISOString() });
});

// The pull-down direction: everything else in this branch's organization,
// so Multi-Branch screens can render cross-branch data from a local cache
// even while offline (Auth doc 4.1) -- see server/src/services/sync.ts on
// the local side for where this gets cached.
router.get("/pull/:branchId", (req, res) => {
  const branch = authenticateBranch(req, res);
  if (!branch) return;

  const orgBranches = db.select().from(branches).where(eq(branches.organizationId, branch.organizationId)).all();
  const org = db.select().from(organizations).where(eq(organizations.id, branch.organizationId)).get();
  const withLatestSnapshot = orgBranches.map(b => {
    const latest = db.select().from(branchSnapshots).where(eq(branchSnapshots.branchId, b.id)).orderBy(desc(branchSnapshots.syncedAt)).limit(1).get();
    return {
      branchId: b.id, branchName: b.name, lastSyncAt: b.lastSyncAt, lastSyncStatus: b.lastSyncStatus,
      occupancyRate: latest?.occupancyRate ?? null, revenueToday: latest?.revenueToday ?? null,
      activeGuests: latest?.activeGuests ?? null, openIssues: latest?.openIssues ?? null, roomsTotal: latest?.roomsTotal ?? null,
      adr: latest?.adr ?? null, revpar: latest?.revpar ?? null, branchManagerName: latest?.branchManagerName ?? null,
      snapshotAt: latest?.syncedAt ?? null,
    };
  });
  logAudit({ actorType: "branch_sync", branchId: branch.id, organizationId: branch.organizationId, action: "sync_pull", ipAddress: req.ip });
  res.json({
    organizationName: org?.name, enabledModules: org ? JSON.parse(org.enabledModulesJson) : [], branches: withLatestSnapshot,
    // Distribution instructions for THIS branch only (11.3/11.4/11.5) --
    // never other branches' state, this is a pull of your own orders, not
    // a broadcast.
    deployment: {
      updateChannel: branch.updateChannel,
      forceUpdateRequested: branch.forceUpdateRequestedAt != null,
      rollbackToVersion: branch.rollbackToVersion,
    },
  });
});

export default router;
