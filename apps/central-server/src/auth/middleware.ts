// Stateless JWT verification -- no session-revocation DB lookup like the
// local server's requireAuth has. That complexity (Auth doc 6.5/7.1) exists
// locally to support offline continuation; the central server is assumed
// always-online, so there's no equivalent "was this token issued before an
// outage" question to answer here.
import type { Request, Response, NextFunction } from "express";
import { verifyCentralToken, type OrgTokenPayload, type AdminTokenPayload, type AdminMfaPendingTokenPayload } from "./tokens.js";

export interface OrgAuthedRequest extends Request {
  orgAuth?: OrgTokenPayload;
}
export interface AdminAuthedRequest extends Request {
  adminAuth?: AdminTokenPayload;
}
export interface AdminMfaPendingRequest extends Request {
  adminMfaPending?: AdminMfaPendingTokenPayload;
}

function extractToken(req: Request): string | undefined {
  if (req.cookies?.central_access_token) return req.cookies.central_access_token;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

function extractMfaPendingToken(req: Request): string | undefined {
  return req.cookies?.central_mfa_pending_token;
}

export function requireOrgAuth(req: OrgAuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });
  const payload = verifyCentralToken(token);
  if (!payload || payload.type !== "org") return res.status(401).json({ error: "TOKEN_INVALID_OR_EXPIRED" });
  req.orgAuth = payload;
  next();
}

export function requireAdminAuth(req: AdminAuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });
  const payload = verifyCentralToken(token);
  if (!payload || payload.type !== "admin") return res.status(401).json({ error: "TOKEN_INVALID_OR_EXPIRED" });
  req.adminAuth = payload;
  next();
}

// Only satisfied by the short-lived token issued between password success
// and TOTP verification (Auth doc 3.5) -- never by a full admin session
// token, so this can't be used to reach any real admin route.
export function requireAdminMfaPending(req: AdminMfaPendingRequest, res: Response, next: NextFunction) {
  const token = extractMfaPendingToken(req);
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });
  const payload = verifyCentralToken(token);
  if (!payload || payload.type !== "admin_mfa_pending") return res.status(401).json({ error: "TOKEN_INVALID_OR_EXPIRED" });
  req.adminMfaPending = payload;
  next();
}
