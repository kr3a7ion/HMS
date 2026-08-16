// Auto-updater service (Auth/Distribution doc Part 11). Polls on a
// schedule (11.1: "every 6 hours"), checks the registry for a newer image
// on the branch's configured channel, and -- only if NEXURA_ENABLE_AUTO_SWAP
// is explicitly set -- attempts the real container swap. That flag
// defaults off: this dev environment has no Docker daemon
// (DOCKER_SOCKET_PATH would just fail to connect), and even on a real
// install, staged rollouts (11.3) mean an operator should confirm the
// registry/channel setup once before letting this run unattended.
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schemaVersion } from "../../db/client.js";
import { syncState } from "../../db/schema.js";
import { listTags, resolveTagToDigest, type RegistryConfig } from "./registry.js";
import { performContainerSwap } from "./containerSwap.js";
import { verifyImageSignature, type ImageSignature } from "./signature.js";
import { isRing, type BranchState, type Ring } from "./policy.js";
import { performUpdate } from "./orchestrator.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 11.1: "every 6 hours"

function readCurrentVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch { return "0.0.0"; }
}

function registryConfig() {
  const url = process.env.NEXURA_REGISTRY_URL;
  const repository = process.env.NEXURA_REGISTRY_REPOSITORY;
  if (!url || !repository) return null;
  return { url, repository, username: process.env.NEXURA_REGISTRY_USERNAME, password: process.env.NEXURA_REGISTRY_PASSWORD };
}

export interface UpdateCheckResult {
  currentVersion: string;
  status: "up_to_date" | "update_available" | "failed" | "not_configured";
  latestTag?: string;
  error?: string;
}

// Compares the current version against the channel tag or a specific
// pinned/rollback version target -- 11.3's tag strategy (stable/beta/
// pinned version) determines what "latest" means, it's not always a
// semver-newest comparison.
export async function checkForUpdate(channel: string, rollbackTarget: string | null): Promise<UpdateCheckResult> {
  const currentVersion = readCurrentVersion();
  const cfg = registryConfig();
  if (!cfg) return { currentVersion, status: "not_configured" };

  const target = rollbackTarget ?? channel; // "stable" | "beta" | pinned version tag
  const result = await listTags(cfg);
  if (!result.ok) return { currentVersion, status: "failed", error: result.error };

  if (!result.tags.includes(target)) return { currentVersion, status: "failed", error: `Tag "${target}" not found in registry` };
  // Without a real registry there's no way to compare the CURRENT
  // container's image digest against the channel tag's digest (Blueprint
  // 11.2's actual trigger condition) -- that comparison is meaningless
  // outside a real Docker deployment. Reports "update_available" whenever
  // a rollback is explicitly targeted, or the channel differs from what
  // package.json says this build is, as the closest honest signal
  // available without a daemon to ask.
  const updateAvailable = rollbackTarget !== null || target !== currentVersion;
  return { currentVersion, status: updateAvailable ? "update_available" : "up_to_date", latestTag: target };
}

/**
 * Applies an update, through B18's policy and rollback machinery.
 *
 * WHAT CHANGED IN B18. This used to resolve a tag and hand it straight to
 * `performContainerSwap` -- a mutable tag, no signature check, no digest, no
 * health check, no way back. That is the remote-code-execution path the
 * Production blueprint calls the highest-severity issue in the repo.
 *
 * Now: resolve the tag to a DIGEST, verify a signature over that digest
 * against a pinned key, run it past the policy (ring, schema downgrade), and
 * only then swap -- with a health check and automatic rollback behind it.
 */
export async function applyUpdate(channel: string, rollbackTarget: string | null): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NEXURA_ENABLE_AUTO_SWAP !== "true") {
    return { ok: false, error: "Auto-swap disabled (set NEXURA_ENABLE_AUTO_SWAP=true once Docker + registry are confirmed working)" };
  }
  const cfg = registryConfig();
  if (!cfg) return { ok: false, error: "Registry not configured" };

  const tag = rollbackTarget ?? channel;

  // B18.3: resolve to a content digest FIRST. A tag can move between the
  // signature check and the pull; a digest cannot.
  const resolved = await resolveTagToDigest(cfg, tag);
  if (!resolved.ok) return { ok: false, error: `Could not resolve "${tag}" to a digest: ${resolved.error}` };

  // B18.2: the signature is checked over the digest, against keys pinned in
  // this build. `fetchReleaseSignature` returning null means unsigned, which
  // the policy refuses -- there is no path here that proceeds unverified.
  const sig = await fetchReleaseSignature(cfg, resolved.digest);
  const verification = verifyImageSignature(resolved.digest, sig);

  const state = getSyncStateRow();
  const branch: BranchState = {
    ring: isRing(state?.updateRing ?? "general") ? (state!.updateRing as Ring) : "general",
    currentDigest: state?.currentImageDigest ?? null,
    dbSchemaVersion: schemaVersion,
  };

  const outcome = await performUpdate({
    requestedRef: tag,
    digest: resolved.digest,
    // Without a release-metadata service, a release is treated as promoted
    // only as far as `canary`. That is the SAFE assumption: a general-ring
    // property refuses it, rather than every property taking an unvetted
    // build because the metadata was missing. Central supplies the real value
    // via sync (B20).
    availableForRing: (state?.updateRing as Ring | undefined) && sig?.availableForRing
      ? sig.availableForRing
      : "canary",
    schemaVersion: sig?.schemaVersion ?? schemaVersion,
    signatureStatus: verification.status,
    signatureKeyId: verification.keyId,
  }, branch, {
    swap: async (digest) => {
      const result = await performContainerSwap(cfg.repository, digest, "nexura-local");
      return result.ok ? { ok: true } : { ok: false, error: `${result.step}: ${result.error}` };
    },
    probeHealth: async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? 4000}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) return { healthy: false, detail: `health endpoint returned ${res.status}` };
        const body = await res.json() as { ok?: boolean; schemaVersion?: number };
        return body.ok
          ? { healthy: true, detail: `ok, schema ${body.schemaVersion}` }
          : { healthy: false, detail: "health endpoint reported not-ok" };
      } catch (err) {
        return { healthy: false, detail: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  return outcome.status === "succeeded"
    ? { ok: true }
    : { ok: false, error: `${outcome.status}: ${outcome.detail}` };
}

/** The sync_state singleton, or null before the first boot writes it. */
function getSyncStateRow() {
  return db.select().from(syncState).where(eq(syncState.id, "singleton")).get() ?? null;
}

/**
 * Fetches the signature published alongside an image.
 *
 * NOT IMPLEMENTED AGAINST A REAL REGISTRY, and deliberately returns null
 * rather than a stub that would look like success: there is no release
 * pipeline publishing signatures yet, and no registry to fetch them from.
 * Returning null means "unsigned", which the policy refuses -- so the
 * unfinished half fails CLOSED. When CI starts running `cosign sign`, this is
 * the one function that changes.
 */
async function fetchReleaseSignature(
  _cfg: RegistryConfig,
  _digest: string,
): Promise<(ImageSignature & { availableForRing?: Ring; schemaVersion?: number }) | null> {
  return null;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
export function startUpdateChecker(getChannelAndRollback: () => { channel: string; rollbackTarget: string | null }, onResult: (r: UpdateCheckResult) => void) {
  if (intervalHandle) return;
  const run = () => { const { channel, rollbackTarget } = getChannelAndRollback(); checkForUpdate(channel, rollbackTarget).then(onResult).catch(() => {}); };
  intervalHandle = setInterval(run, CHECK_INTERVAL_MS);
}

export { readCurrentVersion };
