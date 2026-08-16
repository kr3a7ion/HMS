// Backend Blueprint B18.5 — swap, health-check, and roll back by itself.
//
// THE FAILURE THIS EXISTS FOR. A property in Lagos takes an update at 04:00.
// The new container starts, but a migration fails or a dependency is missing,
// and the health endpoint never comes up. Without automatic rollback the
// hotel opens at 06:00 with no PMS, nobody on site knows what changed, and
// the fix is a phone call to someone who is asleep.
//
// So the swap is not "install and hope". It is: record the attempt, install,
// poll the new container's health for a bounded window, and if it does not
// come up healthy, put the previous digest back — unattended, and leave a
// record saying so.
//
// DEPENDENCY INJECTION IS NOT DECORATION HERE. `swap` and `probeHealth` are
// parameters because there is no Docker daemon in this environment. That
// means the ORCHESTRATION — the part that decides to roll back — is fully
// exercised by tests, while the part that shells out to Docker stays
// honestly unverified. Hard-coding the Docker calls would make the rollback
// logic untestable, which is the half that actually has to be right.
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { updateAttempts, syncState, branches } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { logAudit } from "../audit.js";
import { evaluateRelease, isSecurityRefusal, type BranchState, type ReleaseDescriptor } from "./policy.js";

export interface HealthProbe {
  healthy: boolean;
  detail: string;
}

export interface SwapOutcome {
  ok: boolean;
  error?: string;
}

export interface UpdateDependencies {
  /** Replaces the running container with `digest`. */
  swap: (digest: string) => Promise<SwapOutcome>;
  /** Polls the newly-started container's health endpoint. */
  probeHealth: () => Promise<HealthProbe>;
  /** How long to keep polling before declaring failure. */
  healthWindowMs?: number;
  healthIntervalMs?: number;
  /** Injectable for tests; real runs use a timer. */
  wait?: (ms: number) => Promise<void>;
}

export interface UpdateOutcome {
  attemptId: string;
  status: "refused" | "succeeded" | "rolled_back" | "failed";
  reason: string | null;
  detail: string;
  digest: string | null;
  rolledBackTo: string | null;
}

/**
 * The branch this server serves. sync_state has no branch reference (it is a
 * singleton row about the sync link itself), and this server is
 * one-per-branch by design, so the branches table has exactly one row to
 * attribute an update attempt to.
 */
function branchIdOrNull(): string | null {
  return db.select({ id: branches.id }).from(branches).limit(1).get()?.id ?? null;
}

/**
 * Runs one update attempt end to end.
 *
 * The attempt row is written BEFORE anything is swapped, on purpose: an
 * update that bricks the container must still leave a record of what was
 * tried and how far it got, or the operator is left reading container logs to
 * find out why the property is down.
 */
export async function performUpdate(
  release: ReleaseDescriptor,
  branch: BranchState,
  deps: UpdateDependencies,
): Promise<UpdateOutcome> {
  const attemptId = nanoid();
  const branchId = branchIdOrNull();
  const wait = deps.wait ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const healthWindowMs = deps.healthWindowMs ?? 120_000;
  const healthIntervalMs = deps.healthIntervalMs ?? 5_000;

  const decision = evaluateRelease(release, branch);

  db.insert(updateAttempts).values({
    id: attemptId,
    branchId,
    requestedRef: release.requestedRef,
    resolvedDigest: release.digest,
    previousDigest: branch.currentDigest,
    ring: branch.ring,
    schemaVersion: branch.dbSchemaVersion,
    releaseSchemaVersion: release.schemaVersion,
    status: decision.allowed ? "swapping" : "refused",
    refusalReason: decision.reason,
    signatureStatus: release.signatureStatus,
    signatureKeyId: release.signatureKeyId,
    healthResult: "not_run",
    startedAt: new Date(),
    ...(decision.allowed ? {} : { finishedAt: new Date(), error: decision.detail }),
  }).run();

  if (!decision.allowed) {
    // A refusal is a SUCCESS for the guard. Logged at error level only when
    // it is a security event -- an "already running" refusal happens on every
    // scheduled check and must not train anyone to ignore these lines.
    const security = isSecurityRefusal(decision.reason);
    if (security) {
      logger.error({ attemptId, ...decision, digest: release.digest }, "[updater] REFUSED an update on security grounds");
      logAudit({
        userId: null, branchId, action: "update_refused_security", module: "IT Admin",
        recordId: attemptId, details: decision.detail,
      });
    } else {
      logger.info({ attemptId, reason: decision.reason }, `[updater] ${decision.detail}`);
    }
    return {
      attemptId, status: "refused", reason: decision.reason,
      detail: decision.detail, digest: release.digest, rolledBackTo: null,
    };
  }

  // ── Swap ───────────────────────────────────────────────────────────────
  logger.warn({ attemptId, from: branch.currentDigest, to: release.digest }, "[updater] Swapping container");
  const swapped = await deps.swap(release.digest);
  if (!swapped.ok) {
    // The swap itself failed, so the OLD container is still what is running.
    // Nothing to roll back -- and saying "rolled_back" here would be a lie
    // about an action that never happened.
    finish(attemptId, {
      status: "failed", healthResult: "not_run",
      error: `Swap failed: ${swapped.error ?? "unknown"}`,
    });
    return {
      attemptId, status: "failed", reason: null,
      detail: `Swap failed, previous container still running: ${swapped.error ?? "unknown"}`,
      digest: release.digest, rolledBackTo: null,
    };
  }

  // ── Health check ───────────────────────────────────────────────────────
  db.update(updateAttempts).set({ status: "health_check" }).where(eq(updateAttempts.id, attemptId)).run();

  const deadline = Date.now() + healthWindowMs;
  let lastProbe: HealthProbe = { healthy: false, detail: "health check never ran" };
  while (Date.now() < deadline) {
    lastProbe = await deps.probeHealth();
    if (lastProbe.healthy) break;
    await wait(healthIntervalMs);
  }

  if (lastProbe.healthy) {
    finish(attemptId, { status: "succeeded", healthResult: "passed", healthDetail: lastProbe.detail });
    db.update(syncState).set({
      currentImageDigest: release.digest,
      previousImageDigest: branch.currentDigest,
      lastSignatureStatus: release.signatureStatus,
      lastHealthCheckAt: new Date(),
      lastHealthResult: "passed",
    }).where(eq(syncState.id, "singleton")).run();

    logger.info({ attemptId, digest: release.digest }, "[updater] Update succeeded and passed its health check");
    logAudit({
      userId: null, branchId, action: "update_applied", module: "IT Admin", recordId: attemptId,
      details: `${release.requestedRef} → ${release.digest} (signature ${release.signatureStatus})`,
    });
    return {
      attemptId, status: "succeeded", reason: null,
      detail: lastProbe.detail, digest: release.digest, rolledBackTo: null,
    };
  }

  // ── Automatic rollback ─────────────────────────────────────────────────
  logger.error({ attemptId, detail: lastProbe.detail }, "[updater] New container failed its health check — rolling back");

  if (!branch.currentDigest) {
    // Nothing known-good to return to: a first install that failed. Reported
    // honestly rather than dressed up as a rollback that did not occur.
    finish(attemptId, {
      status: "failed", healthResult: "failed", healthDetail: lastProbe.detail,
      error: "Health check failed and there is no previous digest to roll back to.",
    });
    return {
      attemptId, status: "failed", reason: null,
      detail: "Health check failed and no previous known-good image is recorded.",
      digest: release.digest, rolledBackTo: null,
    };
  }

  const rolledBack = await deps.swap(branch.currentDigest);
  if (!rolledBack.ok) {
    // The worst case, and it must be unmistakable in the logs: the property
    // is now running a build that failed its health check, and the automatic
    // recovery also failed. This is the line that should page someone.
    finish(attemptId, {
      status: "failed", healthResult: "failed", healthDetail: lastProbe.detail,
      error: `Health check failed AND rollback failed: ${rolledBack.error ?? "unknown"}`,
    });
    logger.fatal({ attemptId, digest: release.digest, previous: branch.currentDigest },
      "[updater] ROLLBACK FAILED — this property is running an unhealthy build and needs manual intervention");
    logAudit({
      userId: null, branchId, action: "update_rollback_failed", module: "IT Admin", recordId: attemptId,
      details: `Health check failed and rollback to ${branch.currentDigest} also failed.`,
    });
    return {
      attemptId, status: "failed", reason: null,
      detail: "Health check failed and rollback failed — manual intervention required.",
      digest: release.digest, rolledBackTo: null,
    };
  }

  finish(attemptId, {
    status: "rolled_back", healthResult: "failed", healthDetail: lastProbe.detail,
    rolledBackTo: branch.currentDigest,
  });
  // Re-assert what is RUNNING, not just that the check failed. Writing only
  // the health fields left `current_image_digest` at whatever it happened to
  // be, so a property that rolled back could still report the failed digest
  // as current -- which is the one question this record exists to answer.
  db.update(syncState).set({
    currentImageDigest: branch.currentDigest,
    lastHealthCheckAt: new Date(),
    lastHealthResult: "failed",
  }).where(eq(syncState.id, "singleton")).run();

  logAudit({
    userId: null, branchId, action: "update_rolled_back", module: "IT Admin", recordId: attemptId,
    details: `${release.digest} failed its health check (${lastProbe.detail}); restored ${branch.currentDigest}`,
  });
  return {
    attemptId, status: "rolled_back", reason: null,
    detail: `New build failed its health check (${lastProbe.detail}); the previous image was restored.`,
    digest: release.digest, rolledBackTo: branch.currentDigest,
  };
}

function finish(attemptId: string, fields: {
  status: string;
  healthResult?: string;
  healthDetail?: string;
  rolledBackTo?: string;
  error?: string;
}) {
  db.update(updateAttempts).set({ ...fields, finishedAt: new Date() })
    .where(eq(updateAttempts.id, attemptId)).run();
}

/** Attempt history, newest first, for the IT screen and the sync payload. */
export function recentUpdateAttempts(limit = 20) {
  return db.select().from(updateAttempts).all()
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, limit);
}
