// Backend Blueprint B0.3 — encryption at rest for stored third-party
// credentials (currently door_lock_config's TTLock client secret and
// password; B21 moves those into provider_config_json, B23 adds payment
// gateway config, B34 messaging config -- all of which reuse this module).
//
// KEY DERIVATION. The blueprint calls for "a key derived from the branch's
// existing key material". That material is the RSA private key in
// data/keys/local_private.pem (auth/keys.ts), which per the Auth doc Part
// 1.3 never leaves the property and is generated per-branch at provisioning
// -- so it is already the thing whose compromise would be total, and
// deriving from it adds no new secret to manage or back up.
//
// HKDF-SHA256 with a fixed, distinct `info` string gives a key that is
// cryptographically independent of the signing key: recovering the AES key
// does not help forge a token, and vice versa. The salt is likewise fixed
// and non-secret -- HKDF's security here rests on the input key material,
// not the salt, and a stored random salt would just be one more file to
// lose.
//
// WHAT THIS DOES NOT PROTECT AGAINST. An attacker who can read
// local_private.pem can derive this key. That is by design: this defends
// against a stolen database file (a copied .db, a backup snapshot, an
// offsite replica) rather than against full host compromise. B17.5
// encrypts the signing key itself, which is what closes the remaining gap.
import crypto from "node:crypto";
import { localSigningKeys } from "../auth/keys.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32; // AES-256
const PREFIX = "enc.v1."; // version tag, so a future rotation is detectable

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      Buffer.from(localSigningKeys.privateKey, "utf8"),
      Buffer.from("nexura-secrets-at-rest-v1", "utf8"), // salt (non-secret)
      Buffer.from("door-lock-and-provider-credentials", "utf8"), // info
      KEY_BYTES,
    ),
  );
  return cachedKey;
}

/**
 * True if `value` is already an encrypted blob produced by encryptSecret.
 * Used by the transparent-upgrade path: a row written before this module
 * existed holds plaintext, and must still be readable.
 */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypts a secret for storage. Output format:
 *   enc.v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>
 * The IV is random per call, so encrypting the same secret twice yields
 * different blobs -- storing a deterministic ciphertext would leak whether
 * two branches share a password.
 */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

/**
 * Decrypts a blob from encryptSecret. A value without the version prefix is
 * returned unchanged -- that is the transparent-upgrade path for rows
 * written before encryption existed, not a silent failure. Callers that
 * want to know whether an upgrade is owed should test with isEncrypted().
 *
 * Throws if the blob is well-formed but fails authentication, which means
 * the ciphertext was tampered with or the signing key changed. Failing loud
 * is correct: silently returning garbage would send a corrupted password to
 * a third-party API.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return stored ?? null;
  if (!isEncrypted(stored)) return stored; // legacy plaintext

  const body = stored.slice(PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted secret: expected 3 parts");
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
