// Backend Blueprint B18.6 — what this property is actually running.
//
// The blueprint asks for digest, signature status, schema version and last
// health result to be recorded, exposed locally, and included in the sync
// payload. The point is not the endpoint; it is that "which build is this
// property on, and was it signed?" has an answer someone can read without
// shelling into the machine.
import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, schemaVersion } from "../db/client.js";
import { syncState } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { keyStatus } from "../auth/keys.js";
import { trustedKeys } from "../services/updater/signature.js";
import { recentUpdateAttempts } from "../services/updater/orchestrator.js";
import { RINGS } from "../services/updater/policy.js";
import { readCurrentVersion } from "../services/updater/index.js";

const router = Router();

/** The deployment posture, for the IT screen and the sync payload. */
export function updatePosture() {
  const state = db.select().from(syncState).where(eq(syncState.id, "singleton")).get();
  const keys = trustedKeys();
  return {
    version: readCurrentVersion(),
    schemaVersion,
    ring: state?.updateRing ?? "general",
    currentImageDigest: state?.currentImageDigest ?? null,
    previousImageDigest: state?.previousImageDigest ?? null,
    lastSignatureStatus: state?.lastSignatureStatus ?? null,
    lastHealthCheckAt: state?.lastHealthCheckAt ?? null,
    lastHealthResult: state?.lastHealthResult ?? null,
    // Zero trusted keys means every update is refused. Surfaced explicitly
    // because "updates are silently not happening" and "updates are being
    // correctly refused" look identical from the outside otherwise.
    trustedKeyCount: keys.length,
    trustedKeyIds: keys.map(k => k.keyId),
    updatesPossible: keys.length > 0,
    signingKey: keyStatus(),
  };
}

router.get("/status", requireAuth, requirePermission("admin:operations"), (_req: AuthedRequest, res) => {
  res.json({
    ...updatePosture(),
    rings: RINGS,
    recentAttempts: recentUpdateAttempts(20),
  });
});

export default router;
