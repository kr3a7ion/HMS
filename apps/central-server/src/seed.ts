// Seeds the Platform Owner account, one demo organization ("Grand Palms")
// matching the local server's own demo org, and two branches: "Abuja
// Branch" (meant to be paired with a real running local server via its
// printed sync key -- see server/README or ROADMAP.md for how) and "Lagos
// Branch" (seeded with a few days of synthetic snapshot history only, no
// real local server behind it, so Branch Comparison has a real second
// branch to compare against without standing up two full local-server
// installs for a demo).
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { db, sqlite } from "./db/client.js";
import { organizations, branches, orgUsers, adminUsers, branchSnapshots } from "./db/schema.js";
import { hashPassword } from "./auth/passwords.js";

const DEMO_PASSWORD = "demo123";

function randomSyncKey(): string {
  return `sk_${crypto.randomBytes(24).toString("hex")}`;
}

async function seed() {
  const existing = db.select().from(organizations).limit(1).get();
  if (existing) {
    console.log("[seed] Data already present, skipping. Delete central-server/data/central.db to reseed from scratch.");
    return;
  }

  const now = new Date();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  db.insert(adminUsers).values({ id: nanoid(), email: "platform-owner@nexura.app", passwordHash, firstName: "Gideon", lastName: "Owner", createdAt: now }).run();

  const orgId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Grand Palms", planTier: "growth", billingStatus: "current", createdAt: now }).run();

  db.insert(orgUsers).values({ id: nanoid(), organizationId: orgId, email: "superadmin@grandpalms.ng", passwordHash, firstName: "Amaka", lastName: "Owner", createdAt: now }).run();

  const abujaSyncKey = randomSyncKey();
  const abujaBranchId = nanoid();
  db.insert(branches).values({ id: abujaBranchId, organizationId: orgId, name: "Abuja Branch", syncKeyHash: crypto.createHash("sha256").update(abujaSyncKey).digest("hex"), lastSyncStatus: "never", createdAt: now }).run();

  const lagosBranchId = nanoid();
  db.insert(branches).values({ id: lagosBranchId, organizationId: orgId, name: "Lagos Branch", syncKeyHash: crypto.createHash("sha256").update(randomSyncKey()).digest("hex"), lastSyncStatus: "ok", lastSyncAt: now, createdAt: now }).run();

  // A few days of synthetic history for Lagos so MB-02 Comparison has a
  // real second data series -- explicitly labeled as seed data below, not
  // claimed to be a live branch.
  const dayMs = 24 * 60 * 60 * 1000;
  const lagosHistory = [
    { occ: 72.5, rev: 890000, guests: 29, issues: 3 },
    { occ: 78.0, rev: 940000, guests: 31, issues: 2 },
    { occ: 81.3, rev: 1010000, guests: 33, issues: 4 },
    { occ: 75.0, rev: 875000, guests: 30, issues: 1 },
    { occ: 83.1, rev: 1080000, guests: 34, issues: 2 },
  ];
  lagosHistory.forEach((h, i) => {
    db.insert(branchSnapshots).values({
      id: nanoid(), branchId: lagosBranchId, occupancyRate: h.occ, revenueToday: h.rev, activeGuests: h.guests,
      openIssues: h.issues, roomsTotal: 40, adr: Math.round(h.rev / h.guests), revpar: Math.round((h.rev / 40)),
      branchManagerName: "Ifeoma Bello", syncedAt: new Date(now.getTime() - (lagosHistory.length - i) * dayMs),
    }).run();
  });

  console.log("[seed] Done.");
  console.log(`[seed] Platform Owner login: platform-owner@nexura.app / ${DEMO_PASSWORD}`);
  console.log(`[seed] Org Super Admin login: superadmin@grandpalms.ng / ${DEMO_PASSWORD}`);
  console.log("[seed] ─────────────────────────────────────────────────────");
  console.log(`[seed] Abuja Branch ID:  ${abujaBranchId}`);
  console.log(`[seed] Abuja Sync Key:   ${abujaSyncKey}`);
  console.log("[seed] Configure the local server (server/.env) with:");
  console.log(`[seed]   CENTRAL_SERVER_URL=http://localhost:5000`);
  console.log(`[seed]   CENTRAL_BRANCH_ID=${abujaBranchId}`);
  console.log(`[seed]   CENTRAL_SYNC_KEY=${abujaSyncKey}`);
  console.log("[seed] ─────────────────────────────────────────────────────");
  console.log("[seed] Lagos Branch seeded with 5 days of synthetic history only (no live local server behind it) so Branch Comparison has a real second series.");
}

seed()
  .catch((err) => {
    console.error("[seed] Failed:", err);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
