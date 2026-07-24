// Phase 3 sync client -- the local half of central-server/src/routes/sync.ts.
// Configured via three env vars set at branch provisioning time (Blueprint
// 0.5 step 4), matching what the central server printed when the branch
// was provisioned (central-server/src/seed.ts or
// POST /organizations/:id/branches):
//   CENTRAL_SERVER_URL, CENTRAL_BRANCH_ID, CENTRAL_SYNC_KEY
// If any are unset, sync is simply not configured -- every function here
// no-ops with a clear "not configured" result rather than throwing, since
// a branch must be fully operational before its first sync (Blueprint 0.5
// step 8) and most of this dev environment's test runs won't have a
// central server running at all.
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncState, branchSyncCache, branches } from "../db/schema.js";
import { computeBranchSnapshot } from "./branchKpis.js";
import { checkForUpdate, readCurrentVersion, applyUpdate } from "./updater/index.js";

// CENTRAL_BRANCH_ID (cfg.branchId) is the identifier *central* assigned
// this branch at provisioning -- it has nothing to do with this local
// database's own `branches.id`. Snapshots must be computed against the
// LOCAL id (there's exactly one branch row in a local server's DB); only
// the outgoing payload's `branchId` field uses the central one, since
// that's what central needs to know which branch pushed.
function localBranchId(): string | null {
  return db.select({ id: branches.id }).from(branches).limit(1).get()?.id ?? null;
}

function config() {
  const url = process.env.CENTRAL_SERVER_URL;
  const branchId = process.env.CENTRAL_BRANCH_ID;
  const syncKey = process.env.CENTRAL_SYNC_KEY;
  if (!url || !branchId || !syncKey) return null;
  return { url: url.replace(/\/$/, ""), branchId, syncKey };
}

export function isSyncConfigured(): boolean {
  return config() !== null;
}

function getOrInitState() {
  const existing = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  if (existing) return existing;
  db.insert(syncState).values({ id: "singleton" }).run();
  return db.select().from(syncState).where(eq(syncState.id, "singleton")).get()!;
}

async function push(): Promise<{ ok: boolean; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "NOT_CONFIGURED" };
  const localId = localBranchId();
  if (!localId) return { ok: false, error: "NO_LOCAL_BRANCH" };
  const snapshot = computeBranchSnapshot(localId);
  const state = getOrInitState();
  try {
    const res = await fetch(`${cfg.url}/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Branch-Sync-Key": cfg.syncKey },
      body: JSON.stringify({
        branchId: cfg.branchId, ...snapshot,
        currentVersion: readCurrentVersion(),
        lastUpdateStatus: state.lastUpdateStatus ?? undefined,
        // Only acknowledge (and let central clear) an instruction this
        // branch has actually recorded a result for -- see pull() below,
        // which is where lastUpdateCheckAt gets set after acting on it.
        acknowledgeForceUpdate: state.forceUpdateRequested && state.lastUpdateCheckAt != null,
        acknowledgeRollback: state.rollbackToVersion != null && state.lastUpdateCheckAt != null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      const error = body.error ?? `HTTP_${res.status}`;
      db.update(syncState).set({ lastPushAt: new Date(), lastPushStatus: "error", lastPushError: error }).where(eq(syncState.id, "singleton")).run();
      return { ok: false, error };
    }
    db.update(syncState).set({ lastPushAt: new Date(), lastPushStatus: "ok", lastPushError: null }).where(eq(syncState.id, "singleton")).run();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "UNREACHABLE";
    db.update(syncState).set({ lastPushAt: new Date(), lastPushStatus: "error", lastPushError: error }).where(eq(syncState.id, "singleton")).run();
    return { ok: false, error };
  }
}

async function pull(): Promise<{ ok: boolean; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "NOT_CONFIGURED" };
  try {
    const res = await fetch(`${cfg.url}/sync/pull/${cfg.branchId}`, {
      headers: { "X-Branch-Sync-Key": cfg.syncKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      const error = body.error ?? `HTTP_${res.status}`;
      db.update(syncState).set({ lastPullAt: new Date(), lastPullStatus: "error", lastPullError: error }).where(eq(syncState.id, "singleton")).run();
      return { ok: false, error };
    }
    const body = await res.json() as {
      organizationName: string; enabledModules: string[]; branches: Array<Record<string, any>>;
      deployment?: { updateChannel: string; forceUpdateRequested: boolean; rollbackToVersion: string | null };
    };
    const now = new Date();
    for (const b of body.branches) {
      const existing = db.select().from(branchSyncCache).where(eq(branchSyncCache.branchId, b.branchId)).get();
      const row = {
        branchName: b.branchName, occupancyRate: b.occupancyRate, revenueToday: b.revenueToday,
        activeGuests: b.activeGuests, openIssues: b.openIssues, roomsTotal: b.roomsTotal, adr: b.adr, revpar: b.revpar,
        branchManagerName: b.branchManagerName, lastSyncAt: b.lastSyncAt ? new Date(b.lastSyncAt) : null,
        lastSyncStatus: b.lastSyncStatus, snapshotAt: b.snapshotAt ? new Date(b.snapshotAt) : null, cachedAt: now,
      };
      if (existing) db.update(branchSyncCache).set(row).where(eq(branchSyncCache.branchId, b.branchId)).run();
      else db.insert(branchSyncCache).values({ branchId: b.branchId, ...row }).run();
    }
    db.update(syncState).set({
      lastPullAt: now, lastPullStatus: "ok", lastPullError: null,
      centralOrganizationName: body.organizationName, centralEnabledModulesJson: JSON.stringify(body.enabledModules),
      updateChannel: body.deployment?.updateChannel, forceUpdateRequested: body.deployment?.forceUpdateRequested ?? false,
      rollbackToVersion: body.deployment?.rollbackToVersion ?? null,
    }).where(eq(syncState.id, "singleton")).run();

    // Blueprint 11.1's scheduled check also runs here, on every pull, so
    // "check for updates now" (the sync trigger staff already have via
    // Settings > Synchronization) genuinely re-checks rather than waiting
    // for the next 6-hour tick -- see startUpdateChecker() in
    // services/updater/index.ts for the scheduled path.
    if (body.deployment) {
      const check = await checkForUpdate(body.deployment.updateChannel, body.deployment.rollbackToVersion);
      db.update(syncState).set({ lastUpdateCheckAt: new Date(), lastUpdateStatus: check.status, lastUpdateError: check.error ?? null }).where(eq(syncState.id, "singleton")).run();
      if (check.status === "update_available" && (body.deployment.forceUpdateRequested || body.deployment.rollbackToVersion)) {
        await applyUpdate(body.deployment.updateChannel, body.deployment.rollbackToVersion);
      }
    }
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "UNREACHABLE";
    db.update(syncState).set({ lastPullAt: new Date(), lastPullStatus: "error", lastPullError: error }).where(eq(syncState.id, "singleton")).run();
    return { ok: false, error };
  }
}

export async function syncNow(): Promise<{ push: { ok: boolean; error?: string }; pull: { ok: boolean; error?: string } }> {
  getOrInitState();
  const pushResult = await push();
  const pullResult = await pull();
  return { push: pushResult, pull: pullResult };
}

export function getSyncState() {
  return getOrInitState();
}

export function getCachedBranches() {
  return db.select().from(branchSyncCache).all();
}
