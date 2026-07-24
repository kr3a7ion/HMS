// ST-02 Synchronization. Real connection status, real push/pull against the
// central server -- see services/sync.ts for the actual protocol and why
// it's scoped to KPI snapshots, not full record-level replication.
// "Pending item count" and "sync error history" are simplified accordingly:
// this scoped design has nothing to queue (a KPI push either succeeds or
// it doesn't, there's no per-record backlog), so pending items is always 0,
// and error history is the single most recent error, not a log. Both are
// documented as real-but-simplified, not faked as something richer.
import { Router } from "express";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { isSyncConfigured, syncNow, getSyncState, getCachedBranches } from "../services/sync.js";
import { readCurrentVersion } from "../services/updater/index.js";
import { logAudit } from "../services/audit.js";

const router = Router();

router.get("/status", requireAuth, requirePermission("admin:operations"), (_req: AuthedRequest, res) => {
  const configured = isSyncConfigured();
  const state = getSyncState();
  res.json({
    configured,
    centralServerUrl: configured ? process.env.CENTRAL_SERVER_URL : null,
    lastPushAt: state.lastPushAt, lastPushStatus: state.lastPushStatus, lastPushError: state.lastPushError,
    lastPullAt: state.lastPullAt, lastPullStatus: state.lastPullStatus, lastPullError: state.lastPullError,
    centralOrganizationName: state.centralOrganizationName,
    pendingItemCount: 0, // see file header -- nothing to queue in this sync design
    branches: getCachedBranches(),
    // Distribution (Auth/Distribution doc Part 11). currentVersion is
    // this build's own package.json version, always real; the rest
    // reflects what the last sync pull/scheduled check found -- see
    // services/updater/index.ts and services/sync.ts.
    deployment: {
      currentVersion: readCurrentVersion(),
      updateChannel: state.updateChannel, forceUpdateRequested: state.forceUpdateRequested,
      rollbackToVersion: state.rollbackToVersion, lastUpdateCheckAt: state.lastUpdateCheckAt,
      lastUpdateStatus: state.lastUpdateStatus, lastUpdateError: state.lastUpdateError,
    },
  });
});

router.post("/now", requireAuth, requirePermission("admin:operations"), async (req: AuthedRequest, res) => {
  if (!isSyncConfigured()) return res.status(400).json({ error: "NOT_CONFIGURED" });
  const result = await syncNow();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "sync_now", module: "IT Admin", details: `push:${result.push.ok ? "ok" : result.push.error} pull:${result.pull.ok ? "ok" : result.pull.error}`, ipAddress: req.ip });
  res.json(result);
});

export default router;
