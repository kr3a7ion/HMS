// Door-lock configuration access, split out from access.ts so that
// ttlockAdapter.ts can read decrypted credentials without importing
// access.ts -- access.ts already imports the adapter, and the reverse edge
// would close a cycle. Nothing here touches the provider, so both sides can
// depend on it safely.
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { doorLockConfig } from "../../db/schema.js";
import { encryptSecret, decryptSecret, isEncrypted } from "../../lib/secrets.js";
import { logger } from "../../lib/logger.js";

export function getDoorLockConfig(branchId: string) {
  return db.select().from(doorLockConfig).where(eq(doorLockConfig.branchId, branchId)).get() ?? null;
}

// Backend Blueprint B0.3. Returns the branch's door-lock config with
// clientSecret/password decrypted, and transparently upgrades any row still
// holding plaintext (written before encryption existed) to ciphertext on
// the way through. The upgrade is best-effort: a failure to re-write must
// not stop a lock command from going out, since the caller already has the
// plaintext it needs and refusing would take the doors offline over a
// storage nicety.
export function readDoorLockConfigWithSecrets(branchId: string) {
  const cfg = getDoorLockConfig(branchId);
  if (!cfg) return null;

  const plaintextFields: Partial<Record<"clientSecret" | "password", string>> = {};
  if (cfg.clientSecret != null && cfg.clientSecret !== "" && !isEncrypted(cfg.clientSecret)) {
    plaintextFields.clientSecret = cfg.clientSecret;
  }
  if (cfg.password != null && cfg.password !== "" && !isEncrypted(cfg.password)) {
    plaintextFields.password = cfg.password;
  }
  if (Object.keys(plaintextFields).length > 0) {
    try {
      const upgrade: Record<string, string> = {};
      for (const [field, value] of Object.entries(plaintextFields)) upgrade[field] = encryptSecret(value);
      db.update(doorLockConfig).set(upgrade).where(eq(doorLockConfig.branchId, branchId)).run();
    } catch (err) {
      logger.error({ err, branchId }, "[doorlock] Failed to upgrade plaintext credentials to encrypted at rest");
    }
  }

  return { ...cfg, clientSecret: decryptSecret(cfg.clientSecret), password: decryptSecret(cfg.password) };
}
