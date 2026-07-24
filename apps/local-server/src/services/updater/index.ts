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
import { listTags } from "./registry.js";
import { performContainerSwap } from "./containerSwap.js";

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

export async function applyUpdate(channel: string, rollbackTarget: string | null): Promise<{ ok: boolean; error?: string }> {
  if (process.env.NEXURA_ENABLE_AUTO_SWAP !== "true") {
    return { ok: false, error: "Auto-swap disabled (set NEXURA_ENABLE_AUTO_SWAP=true once Docker + registry are confirmed working)" };
  }
  const image = process.env.NEXURA_REGISTRY_REPOSITORY;
  if (!image) return { ok: false, error: "NEXURA_REGISTRY_REPOSITORY not set" };
  const tag = rollbackTarget ?? channel;
  const result = await performContainerSwap(image, tag, "nexura-local");
  return result.ok ? { ok: true } : { ok: false, error: `${result.step}: ${result.error}` };
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;
export function startUpdateChecker(getChannelAndRollback: () => { channel: string; rollbackTarget: string | null }, onResult: (r: UpdateCheckResult) => void) {
  if (intervalHandle) return;
  const run = () => { const { channel, rollbackTarget } = getChannelAndRollback(); checkForUpdate(channel, rollbackTarget).then(onResult).catch(() => {}); };
  intervalHandle = setInterval(run, CHECK_INTERVAL_MS);
}

export { readCurrentVersion };
