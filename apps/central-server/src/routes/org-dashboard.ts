// Org Portal backend (Auth doc 4.2) -- MB-01/02/03-equivalent cross-branch
// views for a remote, off-site Organization Super Admin. Read-only by
// design: "The portal is not a remote control for branch operations; it is
// an observation layer" (Auth doc 4.2). Data is whatever each branch last
// pushed via /sync/push, not live.
import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { branches, branchSnapshots, organizations } from "../db/schema.js";
import { requireOrgAuth, type OrgAuthedRequest } from "../auth/middleware.js";

const router = Router();

router.get("/overview", requireOrgAuth, (req: OrgAuthedRequest, res) => {
  const orgId = req.orgAuth!.organization_id;
  const org = db.select().from(organizations).where(eq(organizations.id, orgId)).get();
  const orgBranches = db.select().from(branches).where(eq(branches.organizationId, orgId)).all();

  const branchCards = orgBranches.map(b => {
    const latest = db.select().from(branchSnapshots).where(eq(branchSnapshots.branchId, b.id)).orderBy(desc(branchSnapshots.syncedAt)).limit(1).get();
    return {
      branchId: b.id, branchName: b.name, lastSyncAt: b.lastSyncAt, lastSyncStatus: b.lastSyncStatus,
      occupancyRate: latest?.occupancyRate ?? null, revenueToday: latest?.revenueToday ?? null,
      activeGuests: latest?.activeGuests ?? null, openIssues: latest?.openIssues ?? null,
      roomsTotal: latest?.roomsTotal ?? null, branchManagerName: latest?.branchManagerName ?? null,
      snapshotAt: latest?.syncedAt ?? null,
    };
  });

  const withData = branchCards.filter(b => b.snapshotAt != null);
  res.json({
    organizationName: org?.name, planTier: org?.planTier,
    totalBranches: orgBranches.length,
    avgOccupancy: withData.length > 0 ? Math.round((withData.reduce((s, b) => s + (b.occupancyRate ?? 0), 0) / withData.length) * 10) / 10 : 0,
    totalRevenueToday: withData.reduce((s, b) => s + (b.revenueToday ?? 0), 0),
    totalActiveGuests: withData.reduce((s, b) => s + (b.activeGuests ?? 0), 0),
    totalOpenIssues: withData.reduce((s, b) => s + (b.openIssues ?? 0), 0),
    branches: branchCards,
  });
});

// MB-02 Branch Comparison -- real history across recent syncs per branch,
// not a single point-in-time number.
router.get("/comparison", requireOrgAuth, (req: OrgAuthedRequest, res) => {
  const orgId = req.orgAuth!.organization_id;
  const orgBranches = db.select().from(branches).where(eq(branches.organizationId, orgId)).all();
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 14;

  const perBranch = orgBranches.map(b => {
    const history = db.select().from(branchSnapshots).where(eq(branchSnapshots.branchId, b.id)).orderBy(desc(branchSnapshots.syncedAt)).limit(limit).all();
    return {
      branchId: b.id, branchName: b.name,
      history: history.reverse().map(h => ({ syncedAt: h.syncedAt, occupancyRate: h.occupancyRate, revenueToday: h.revenueToday, adr: h.adr, revpar: h.revpar })),
    };
  });
  res.json({ branches: perBranch });
});

router.get("/sync-status", requireOrgAuth, (req: OrgAuthedRequest, res) => {
  const orgId = req.orgAuth!.organization_id;
  const orgBranches = db.select().from(branches).where(eq(branches.organizationId, orgId)).all();
  res.json(orgBranches.map(b => ({ branchId: b.id, branchName: b.name, lastSyncAt: b.lastSyncAt, lastSyncStatus: b.lastSyncStatus, lastSyncError: b.lastSyncError })));
});

export default router;
