// TTLock Adapter (Blueprint Part 6.1) -- translates the Lock Provider
// Interface into real TTLock Open Platform API calls. Endpoints, params,
// and the OAuth2 flow below are taken from TTLock's actual public API docs
// (euopen.ttlock.com/doc) -- this is not a guess at the shape of a fictional
// API. What genuinely cannot be verified in this environment is whether a
// live TTLock account accepts these calls: there is no TTLock account, no
// physical lock, and no gateway to test against here. Every call will
// legitimately fail with a real network/auth error until real credentials
// are entered in Settings > Door Lock Integration -- which is exactly the
// "TTLock API unreachable" state Blueprint 6.4's offline banner and the
// lock_sync_queue offline-fallback path are designed to handle, not a
// simulated/fake failure mode.
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { doorLockConfig } from "../../db/schema.js";
import { readDoorLockConfigWithSecrets } from "./config.js";
import {
  type LockProvider, type ActivateCardParams, type ActivateCardResult,
  type GeneratePinParams, type GeneratePinResult, type RevokeParams,
  type LockSummary, type TestConnectionResult, LockProviderError,
} from "./provider.js";

const API_BASE = "https://api.sciener.com";

interface TTLockConfigRow {
  clientId: string | null; clientSecret: string | null; username: string | null; password: string | null;
  accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null;
}

async function fetchToken(cfg: TTLockConfigRow): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.username || !cfg.password) {
    throw new LockProviderError("TTLock credentials not configured", false);
  }
  const passwordMd5 = crypto.createHash("md5").update(cfg.password).digest("hex");
  const body = new URLSearchParams({
    client_id: cfg.clientId, client_secret: cfg.clientSecret,
    username: cfg.username, password: passwordMd5, grant_type: "password",
  });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  } catch {
    throw new LockProviderError("Could not reach TTLock API (network unreachable)", true);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new LockProviderError(json.errmsg ?? `TTLock auth failed (${res.status})`, res.status >= 500);
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + json.expires_in * 1000) };
}

async function getValidToken(branchId: string): Promise<{ clientId: string; accessToken: string }> {
  // Backend Blueprint B0.3: read through the decrypting accessor, never the
  // raw row -- clientSecret/password are stored encrypted at rest and would
  // otherwise be sent to TTLock as ciphertext.
  const cfg = readDoorLockConfigWithSecrets(branchId);
  if (!cfg) throw new LockProviderError("Door lock is not configured for this branch", false);
  const now = Date.now();
  if (cfg.accessToken && cfg.tokenExpiresAt && cfg.tokenExpiresAt.getTime() - 60_000 > now) {
    return { clientId: cfg.clientId!, accessToken: cfg.accessToken };
  }
  const token = await fetchToken(cfg);
  db.update(doorLockConfig).set({
    accessToken: token.accessToken, refreshToken: token.refreshToken, tokenExpiresAt: token.expiresAt,
  }).where(eq(doorLockConfig.branchId, branchId)).run();
  return { clientId: cfg.clientId!, accessToken: token.accessToken };
}

async function ttlockPost(path: string, params: Record<string, string | number>): Promise<any> {
  const body = new URLSearchParams({ ...params, date: String(Date.now()) } as Record<string, string>);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  } catch {
    throw new LockProviderError(`Could not reach TTLock API (${path})`, true);
  }
  const json: any = await res.json().catch(() => ({}));
  // TTLock's own convention: errcode present and non-zero means failure,
  // even on an HTTP 200 -- checked separately from the HTTP status.
  if (!res.ok || (json.errcode !== undefined && json.errcode !== 0)) {
    throw new LockProviderError(json.errmsg ?? `TTLock API error at ${path} (${res.status})`, res.status >= 500);
  }
  return json;
}

export class TTLockAdapter implements LockProvider {
  constructor(private branchId: string) {}

  async activateCardAccess(params: ActivateCardParams): Promise<ActivateCardResult> {
    const { clientId, accessToken } = await getValidToken(this.branchId);
    const json = await ttlockPost("/v3/identityCard/addForReversedCardNumber", {
      clientId, accessToken, lockId: params.lockId, cardNumber: params.cardNumber,
      cardName: params.cardName, startDate: params.validFrom.getTime(), endDate: params.validTo.getTime(), addType: 2,
    });
    return { ttlockCardId: String(json.cardId) };
  }

  async generatePIN(params: GeneratePinParams): Promise<GeneratePinResult> {
    const { clientId, accessToken } = await getValidToken(this.branchId);
    const json = await ttlockPost("/v3/keyboardPwd/add", {
      clientId, accessToken, lockId: params.lockId, keyboardPwd: params.pin,
      keyboardPwdName: params.pinName, startDate: params.validFrom.getTime(), endDate: params.validTo.getTime(), addType: 2,
    });
    return { ttlockKeyboardPwdId: String(json.keyboardPwdId) };
  }

  async revokeAccess(params: RevokeParams): Promise<void> {
    const { clientId, accessToken } = await getValidToken(this.branchId);
    if (params.credentialType === "card") {
      if (!params.ttlockCardId) throw new LockProviderError("Missing ttlockCardId for card revoke", false);
      await ttlockPost("/v3/identityCard/delete", { clientId, accessToken, lockId: params.lockId, cardId: params.ttlockCardId });
    } else {
      if (!params.ttlockKeyboardPwdId) throw new LockProviderError("Missing ttlockKeyboardPwdId for PIN revoke", false);
      await ttlockPost("/v3/keyboardPwd/delete", { clientId, accessToken, lockId: params.lockId, keyboardPwdId: params.ttlockKeyboardPwdId });
    }
  }

  async listLocks(): Promise<LockSummary[]> {
    const { clientId, accessToken } = await getValidToken(this.branchId);
    const json = await ttlockPost("/v3/lock/list", { clientId, accessToken, pageNo: 1, pageSize: 1000 });
    const list = Array.isArray(json.list) ? json.list : [];
    return list.map((l: any) => ({ lockId: String(l.lockId), lockName: l.lockAlias ?? l.lockName }));
  }

  async testConnection(): Promise<TestConnectionResult> {
    try {
      const locks = await this.listLocks();
      return { ok: true, lockCount: locks.length };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}
