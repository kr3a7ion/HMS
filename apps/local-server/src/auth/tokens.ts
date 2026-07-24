// Auth doc Part 6.1 — Access Token (RS256, local server as issuer) and
// opaque Refresh Token. Signed/verified entirely with the local signing key
// pair from auth/keys.ts -- no network call, ever (Part 6.2).
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { localSigningKeys } from "./keys.js";

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

/** Normal request path — rejects if signature invalid OR token expired. */
export function verifyAccessToken(token: string): VerifiedPayload | null {
  try {
    return jwt.verify(token, localSigningKeys.publicKey, { algorithms: ["RS256"] }) as VerifiedPayload;
  } catch {
    return null;
  }
}

/**
 * Offline-continue path only (Part 5.2/7.1) — verifies the signature is
 * genuinely ours but ignores expiry, since the whole point is deciding
 * whether an *expired* token still qualifies for a grace extension. Never
 * use this for anything other than the continue-offline endpoint.
 */
export function decodeIgnoringExpiry(token: string): VerifiedPayload | null {
  try {
    return jwt.verify(token, localSigningKeys.publicKey, {
      algorithms: ["RS256"],
      ignoreExpiration: true,
    }) as VerifiedPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
