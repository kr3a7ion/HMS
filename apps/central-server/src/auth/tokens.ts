// Auth doc Part 3.3 (Platform Owner) and Part 4.2 (Org Super Admin remote
// access) -- both get a "Central JWT", signed with the central server's own
// key, distinct in shape from the local server's AccessTokenPayload.
import jwt from "jsonwebtoken";
import { centralSigningKeys } from "./keys.js";

const ORG_TOKEN_TTL_SECONDS = 8 * 60 * 60; // Auth doc 4.2: "Expiry: 8 hours"
const ADMIN_TOKEN_TTL_SECONDS = 60 * 60; // Auth doc 3.3: "Access Token (JWT, 1hr expiry)"
const ADMIN_MFA_PENDING_TTL_SECONDS = 5 * 60; // just long enough to type a 6-digit code

export interface OrgTokenPayload {
  type: "org";
  sub: string; // org_users.id
  organization_id: string;
}
export interface AdminTokenPayload {
  type: "admin";
  sub: string; // admin_users.id
}
// Issued after password verification succeeds but before TOTP is verified
// (Auth doc 3.5: "mandatory, no bypass"). Deliberately a distinct `type` so
// requireAdminAuth -- which only accepts `type === "admin"` -- can never be
// satisfied by a token that hasn't cleared MFA yet.
export interface AdminMfaPendingTokenPayload {
  type: "admin_mfa_pending";
  sub: string; // admin_users.id
}
export type CentralTokenPayload = OrgTokenPayload | AdminTokenPayload | AdminMfaPendingTokenPayload;

export function signOrgToken(payload: Omit<OrgTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "org" }, centralSigningKeys.privateKey, {
    algorithm: "RS256", expiresIn: ORG_TOKEN_TTL_SECONDS, issuer: "nexura-central",
  });
}
export function signAdminToken(payload: Omit<AdminTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "admin" }, centralSigningKeys.privateKey, {
    algorithm: "RS256", expiresIn: ADMIN_TOKEN_TTL_SECONDS, issuer: "nexura-central",
  });
}
export function signAdminMfaPendingToken(payload: Omit<AdminMfaPendingTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "admin_mfa_pending" }, centralSigningKeys.privateKey, {
    algorithm: "RS256", expiresIn: ADMIN_MFA_PENDING_TTL_SECONDS, issuer: "nexura-central",
  });
}

export function verifyCentralToken(token: string): (CentralTokenPayload & jwt.JwtPayload) | null {
  try {
    return jwt.verify(token, centralSigningKeys.publicKey, { algorithms: ["RS256"] }) as CentralTokenPayload & jwt.JwtPayload;
  } catch {
    return null;
  }
}
