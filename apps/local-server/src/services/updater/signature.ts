// Backend Blueprint B18.1/18.2 — image signature verification.
//
// THIS IS THE CORE OF THE BATCH. Everything else in B18 is procedure; this is
// the part that decides whether code from the internet gets to run as root on
// a hotel's server.
//
// WHAT IS BEING SIGNED. Not the tag — a tag is a mutable pointer and signing
// one would mean nothing. The signature covers the IMAGE DIGEST
// (`sha256:...`), which is the content address of the exact bytes. Verify the
// signature over a digest, then pull BY that digest, and what was verified is
// necessarily what runs. Verifying a tag and then pulling the tag leaves a
// window in which the tag moved.
//
// TRUST IS PINNED, NOT DISCOVERED. The public key lives in this file (and is
// overridable at deploy time for a self-hosted registry). It is never fetched
// alongside the image, because a signature checked against a key supplied by
// the same party that supplied the image proves only that they can sign their
// own work.
//
// COSIGN COMPATIBILITY, stated honestly: cosign's own bundle format wraps a
// payload in a sigstore envelope. What this verifies is the cryptographic
// core -- an ECDSA-P256 signature over the digest -- which is what `cosign
// sign --key` produces at bottom. A deployment using keyless/Fulcio signing
// would need certificate-chain validation this does not implement, and that
// is called out rather than implied. The CI half (actually running `cosign
// sign` on the published image) is a pipeline change, not application code.
import crypto from "node:crypto";
import { logger } from "../../lib/logger.js";

export type SignatureStatus = "verified" | "unsigned" | "unknown_key" | "invalid" | "unverified";

export interface TrustedKey {
  keyId: string;
  /** SPKI PEM of the public half. */
  publicKeyPem: string;
}

export interface ImageSignature {
  /** Base64 signature over the digest string. */
  signature: string;
  /** Which pinned key the signer claims to have used. */
  keyId: string;
}

/**
 * Keys this build trusts, pinned at compile time.
 *
 * NEXURA_UPDATE_TRUSTED_KEYS lets a self-hosted deployment supply its own
 * (JSON array of {keyId, publicKeyPem}). That is a deliberate escape hatch
 * for properties running their own registry -- it is set at provisioning, on
 * the machine, not fetched.
 *
 * Empty by default in this build: no release-signing key exists yet, because
 * no release pipeline exists yet. An empty trust set means EVERY image is
 * refused, which is the correct failure direction -- see verifyImageSignature.
 */
export function trustedKeys(): TrustedKey[] {
  const raw = process.env.NEXURA_UPDATE_TRUSTED_KEYS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as TrustedKey[];
    return parsed.filter(k => typeof k.keyId === "string" && typeof k.publicKeyPem === "string");
  } catch {
    // A malformed trust set is treated as NO trust set, not as "skip
    // verification". A typo in a deploy variable must not open the gate.
    logger.error("[updater] NEXURA_UPDATE_TRUSTED_KEYS is not valid JSON — treating the trust set as empty, so all updates will be refused.");
    return [];
  }
}

export interface VerificationResult {
  status: SignatureStatus;
  keyId: string | null;
  detail: string;
}

/**
 * Verifies a signature over an image digest against the pinned trust set.
 *
 * EVERY FAILURE MODE RETURNS A NON-"verified" STATUS. There is deliberately
 * no path that returns success on error, no "could not check, assume fine",
 * and no configuration flag that skips this. An updater that fails open is
 * indistinguishable from one with no signing at all, and it is worse, because
 * it looks protected.
 */
export function verifyImageSignature(
  digest: string,
  signature: ImageSignature | null,
  keys: TrustedKey[] = trustedKeys(),
): VerificationResult {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    return { status: "invalid", keyId: null, detail: `Not a valid image digest: ${digest}` };
  }
  if (!signature) {
    return { status: "unsigned", keyId: null, detail: "The release carries no signature." };
  }
  if (keys.length === 0) {
    return {
      status: "unknown_key", keyId: signature.keyId,
      detail: "No trusted signing keys are pinned in this build, so no image can be verified. "
        + "Set NEXURA_UPDATE_TRUSTED_KEYS at provisioning time.",
    };
  }

  const key = keys.find(k => k.keyId === signature.keyId);
  if (!key) {
    // Signed by SOMETHING, but not by anyone this build trusts. This is the
    // compromised-registry case: an attacker can sign perfectly well, just
    // not with our key.
    return {
      status: "unknown_key", keyId: signature.keyId,
      detail: `Signed by "${signature.keyId}", which is not a trusted key.`,
    };
  }

  try {
    const ok = crypto.verify(
      "sha256",
      Buffer.from(digest, "utf8"),
      { key: key.publicKeyPem, dsaEncoding: "der" },
      Buffer.from(signature.signature, "base64"),
    );
    return ok
      ? { status: "verified", keyId: key.keyId, detail: `Signature verified against "${key.keyId}".` }
      : { status: "invalid", keyId: key.keyId, detail: "Signature does not match the image digest." };
  } catch (err) {
    // A malformed key or signature blob lands here. Still a refusal.
    return {
      status: "invalid", keyId: key.keyId,
      detail: `Signature could not be checked: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** True only for the one status that permits a swap. */
export function signaturePermitsSwap(status: SignatureStatus): boolean {
  return status === "verified";
}
