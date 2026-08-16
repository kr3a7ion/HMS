// Auth doc Part 6.1 — Access Token (RS256, local server as issuer) and
// opaque Refresh Token. Signed/verified entirely with the local signing key
// pair from auth/keys.ts -- no network call, ever (Part 6.2).
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { localSigningKeys, previousVerificationKey } from "./keys.js";

export const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12h default, Part 6.1
export const GRACE_EXTENSION_TTL_SECONDS = 4 * 60 * 60; // Part 7.1
export const GRACE_PERIOD_HOURS = 8; // Part 7.1 -- how stale a token can be and still qualify

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  org_id: string;
  branch_id: string;
  permissions_hash: string;
  session_id: string;
}

export function signAccessToken(payload: AccessTokenPayload, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS): string {
  return jwt.sign(payload, localSigningKeys.privateKey, {
    algorithm: "RS256",
    expiresIn: ttlSeconds,
    issuer: `nexura-local-branch-${payload.branch_id}`,
  });
}

export function signGraceExtensionToken(payload: AccessTokenPayload): string {
  return signAccessToken(payload, GRACE_EXTENSION_TTL_SECONDS);
}

type VerifiedPayload = AccessTokenPayload & jwt.JwtPayload;

/**
 * Tries the current key, then the previous one if it is still inside its
 * rotation overlap window (B17.5).
 *
 * WITHOUT THE FALLBACK, rotating the signing key logs every member of staff
 * out at the same instant -- every token in every browser was signed by the
 * key that just went away. In a hotel that means the whole shift, possibly
 * mid-check-in. The overlap lets tokens age out naturally instead.
 */
function verifyWithRotation(token: string, options: jwt.VerifyOptions): VerifiedPayload | null {
  try {
    return jwt.verify(token, localSigningKeys.publicKey, options) as VerifiedPayload;
  } catch {
    const previous = previousVerificationKey();
    if (!previous) return null;
    try {
      return jwt.verify(token, previous, options) as VerifiedPayload;
    } catch {
      return null;
    }
  }
}

/** Normal request path — rejects if signature invalid OR token expired. */
export function verifyAccessToken(token: string): VerifiedPayload | null {
  return verifyWithRotation(token, { algorithms: ["RS256"] });
}

/**
 * Offline-continue path only (Part 5.2/7.1) — verifies the signature is
 * genuinely ours but ignores expiry, since the whole point is deciding
 * whether an *expired* token still qualifies for a grace extension. Never
 * use this for anything other than the continue-offline endpoint.
 */
export function decodeIgnoringExpiry(token: string): VerifiedPayload | null {
  return verifyWithRotation(token, { algorithms: ["RS256"], ignoreExpiration: true });
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
