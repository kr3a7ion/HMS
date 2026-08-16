// Local signing key — Auth doc Part 1.3: "Never leaves the property. Never
// sent to the central server. Generated at provisioning time."
//
// Backend Blueprint B17.5 — ENCRYPTED AT REST.
//
// WHAT THIS KEY IS. It signs every access token for the property. Anyone
// holding it can mint a token for any user and any role -- ORG included --
// without touching the database or leaving a login record. It is the single
// most valuable file on the machine, and it previously sat on disk as
// plaintext PEM at mode 0600.
//
// 0600 protects it from other user accounts on a running system. It does not
// protect it from: a stolen or resold back-office PC, a disk pulled from a
// dead machine, a backup copied to a USB stick, or anyone who can boot from
// another medium. In a hotel back office all four are realistic.
//
// THE KEY-ENCRYPTION KEY is derived from two independent factors:
//   1. a hardware identifier for this machine, so a copied file is useless on
//      another machine;
//   2. an operator passphrase (NEXURA_KEY_PASSPHRASE), so a stolen machine is
//      useless without something a person knows.
//
// HONEST LIMITS, stated rather than implied:
//   * With no passphrase set, factor 2 is absent and the file is protected by
//     the hardware identifier alone -- which stops a copied file, not a
//     stolen machine. The server logs this loudly at boot and REFUSES to
//     start in production.
//   * A hardware identifier is not a TPM. It raises the work required; it is
//     not a hardware root of trust. The runbook requires full-disk encryption
//     as the layer underneath (Production blueprint §4.4).
//
// ROTATION keeps the previous public key for its remaining token lifetime, so
// tokens already in browsers keep verifying while new ones use the new key.
// Rotating without that overlap signs every logged-in member of staff out at
// once, mid-shift.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../lib/logger.js";

// Overridable so a test run cannot rotate or re-encrypt a real property's
// signing key. Found during B17's live verification: the security tests call
// rotateSigningKey() against data/keys, which is the actual dev key -- every
// live session was signed out as a side effect of running the suite. On a
// machine that also serves a property that would be an outage caused by CI.
const keysDir = process.env.NEXURA_KEYS_DIR
  ? path.resolve(process.env.NEXURA_KEYS_DIR)
  : path.resolve(process.cwd(), "data", "keys");
const privateKeyPath = path.join(keysDir, "local_private.pem.enc");
const publicKeyPath = path.join(keysDir, "local_public.pem");
const previousPublicKeyPath = path.join(keysDir, "local_public.previous.pem");
const rotationMetaPath = path.join(keysDir, "rotation.json");

/** Legacy plaintext path, migrated on first boot after this change. */
const legacyPrivateKeyPath = path.join(keysDir, "local_private.pem");

const isProduction = process.env.NODE_ENV === "production";
const ENCRYPTION_PREFIX = "nexura-key-v1";

/**
 * A stable identifier for this machine.
 *
 * Deliberately built from things that survive a reboot but not a disk being
 * moved to different hardware: hostname, CPU model, total memory, and the MAC
 * of the first non-internal interface. None is secret; that is fine, because
 * this factor exists to bind the file to the machine, not to be unguessable.
 * The passphrase is the secret factor.
 */
function hardwareIdentifier(): string {
  const nic = Object.values(os.networkInterfaces())
    .flatMap(addrs => addrs ?? [])
    .find(a => !a.internal && a.mac && a.mac !== "00:00:00:00:00:00");
  return [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model ?? "unknown-cpu",
    String(os.totalmem()),
    nic?.mac ?? "no-nic",
  ].join("|");
}

function deriveKeyEncryptionKey(salt: Buffer): Buffer {
  const passphrase = process.env.NEXURA_KEY_PASSPHRASE ?? "";
  // scrypt, not a bare hash: the hardware identifier is low-entropy and the
  // passphrase may be too, so the derivation has to be deliberately slow.
  return crypto.scryptSync(`${hardwareIdentifier()}::${passphrase}`, salt, 32, {
    N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024,
  });
}

function encryptPrivateKey(pem: string): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKeyEncryptionKey(salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // prefix | salt | iv | tag | ciphertext
  return Buffer.concat([Buffer.from(`${ENCRYPTION_PREFIX}\n`, "utf8"), salt, iv, tag, ciphertext]);
}

export class KeyDecryptionError extends Error {
  constructor(cause: string) {
    super(
      `Could not decrypt the local signing key: ${cause}. `
      + `This usually means the key file was moved from another machine, the hardware changed, `
      + `or NEXURA_KEY_PASSPHRASE differs from the one it was encrypted with. `
      + `Restore data/keys from the property's backup, or re-provision the branch.`,
    );
    this.name = "KeyDecryptionError";
  }
}

function decryptPrivateKey(blob: Buffer): string {
  const header = Buffer.from(`${ENCRYPTION_PREFIX}\n`, "utf8");
  if (!blob.subarray(0, header.length).equals(header)) {
    throw new KeyDecryptionError("unrecognised file format");
  }
  let offset = header.length;
  const salt = blob.subarray(offset, offset += 16);
  const iv = blob.subarray(offset, offset += 12);
  const tag = blob.subarray(offset, offset += 16);
  const ciphertext = blob.subarray(offset);

  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKeyEncryptionKey(salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // GCM tag failure. Either the derivation inputs changed, or the file was
    // tampered with. Both mean "do not trust this key".
    throw new KeyDecryptionError("authentication tag mismatch");
  }
}

function writeKeyPair(privateKey: string, publicKey: string) {
  fs.mkdirSync(keysDir, { recursive: true });
  fs.writeFileSync(privateKeyPath, encryptPrivateKey(privateKey), { mode: 0o600 });
  // The public key stays plaintext: it verifies, it does not sign, and the
  // health/sync paths need to read it without the passphrase.
  fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
}

function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeKeyPair(privateKey, publicKey);
  logger.info("[auth] Generated new local signing key pair (first boot / provisioning), encrypted at rest.");
  return { privateKey, publicKey };
}

/**
 * One-time migration of a pre-B17 plaintext key.
 *
 * The plaintext file is deleted once the encrypted one is written and read
 * back successfully -- not before. A migration that removes the only copy of
 * the signing key before confirming the replacement works would lock every
 * member of staff out of the property with no way back.
 */
function migrateLegacyKey(): { privateKey: string; publicKey: string } | null {
  if (!fs.existsSync(legacyPrivateKeyPath) || !fs.existsSync(publicKeyPath)) return null;

  const privateKey = fs.readFileSync(legacyPrivateKeyPath, "utf8");
  const publicKey = fs.readFileSync(publicKeyPath, "utf8");
  writeKeyPair(privateKey, publicKey);

  const roundTripped = decryptPrivateKey(fs.readFileSync(privateKeyPath));
  if (roundTripped !== privateKey) {
    throw new Error("[auth] Key encryption round-trip failed; leaving the plaintext key in place.");
  }

  fs.rmSync(legacyPrivateKeyPath, { force: true });
  logger.warn(
    "[auth] Migrated the local signing key from plaintext to encrypted at rest (B17.5). "
    + "The plaintext copy has been removed. Ensure data/keys is included in backups -- "
    + "losing it means re-provisioning the branch.",
  );
  return { privateKey, publicKey };
}

function loadOrGenerateKeyPair() {
  fs.mkdirSync(keysDir, { recursive: true });

  if (isProduction && !process.env.NEXURA_KEY_PASSPHRASE) {
    // Fatal on purpose. Without a passphrase the key is bound to the machine
    // but not to any secret, so a stolen machine yields a working signing
    // key. That is not a posture to boot into silently.
    throw new Error(
      "[auth] NEXURA_KEY_PASSPHRASE is not set. In production the local signing key must be "
      + "encrypted with an operator passphrase as well as the hardware identifier -- otherwise "
      + "anyone who takes the machine can mint tokens for any role. Set it from the OS keystore "
      + "at service start.",
    );
  }

  const migrated = migrateLegacyKey();
  if (migrated) return migrated;

  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    return {
      privateKey: decryptPrivateKey(fs.readFileSync(privateKeyPath)),
      publicKey: fs.readFileSync(publicKeyPath, "utf8"),
    };
  }
  return generateKeyPair();
}

export const localSigningKeys = loadOrGenerateKeyPair();

// ─── Rotation ─────────────────────────────────────────────────────────────

interface RotationMeta {
  rotatedAt: string;
  /** Tokens signed by the previous key stop verifying after this instant. */
  previousValidUntil: string;
}

function readRotationMeta(): RotationMeta | null {
  if (!fs.existsSync(rotationMetaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(rotationMetaPath, "utf8")) as RotationMeta;
  } catch {
    return null;
  }
}

/**
 * The previous public key, while it is still inside its overlap window.
 *
 * Returns null once the window closes, which is what makes the old key stop
 * working rather than lingering forever. Token verification tries the current
 * key first and falls back to this.
 */
export function previousVerificationKey(now: Date = new Date()): string | null {
  const meta = readRotationMeta();
  if (!meta || !fs.existsSync(previousPublicKeyPath)) return null;
  if (new Date(meta.previousValidUntil) <= now) return null;
  return fs.readFileSync(previousPublicKeyPath, "utf8");
}

/**
 * Rotates the signing key, keeping the old public key for `overlapSeconds`.
 *
 * The overlap must be at least one access-token lifetime. Without it every
 * token in every browser is invalidated at once, which in a hotel means the
 * whole shift is logged out simultaneously -- during check-in rush, if that
 * is when someone chose to rotate.
 */
export function rotateSigningKey(overlapSeconds: number): { rotatedAt: Date; previousValidUntil: Date } {
  const current = fs.readFileSync(publicKeyPath, "utf8");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(previousPublicKeyPath, current, { mode: 0o644 });
  writeKeyPair(privateKey, publicKey);

  const rotatedAt = new Date();
  const previousValidUntil = new Date(rotatedAt.getTime() + overlapSeconds * 1000);
  fs.writeFileSync(rotationMetaPath, JSON.stringify({
    rotatedAt: rotatedAt.toISOString(),
    previousValidUntil: previousValidUntil.toISOString(),
  } satisfies RotationMeta, null, 2));

  // The in-memory pair is replaced so new tokens sign with the new key
  // immediately, without a restart.
  localSigningKeys.privateKey = privateKey;
  localSigningKeys.publicKey = publicKey;

  logger.warn({
    rotatedAt: rotatedAt.toISOString(),
    previousValidUntil: previousValidUntil.toISOString(),
  }, "[auth] Local signing key rotated. Tokens signed with the previous key verify until the overlap ends.");

  return { rotatedAt, previousValidUntil };
}

/** For the health endpoint: posture without exposing anything secret. */
export function keyStatus() {
  const meta = readRotationMeta();
  return {
    encryptedAtRest: fs.existsSync(privateKeyPath),
    passphraseSet: Boolean(process.env.NEXURA_KEY_PASSPHRASE),
    rotatedAt: meta?.rotatedAt ?? null,
    previousKeyValidUntil: meta?.previousValidUntil ?? null,
    previousKeyStillAccepted: previousVerificationKey() != null,
  };
}
