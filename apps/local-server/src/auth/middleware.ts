// Auth doc Part 6.2 (token validation, no network call) + Part 6.3
// (permissions_hash mismatch -> immediate invalidation). This is the API
// layer of the three-layer role enforcement in Auth doc 9.3 -- navigation
// hiding a screen in the frontend is not security, this is.
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { activeSessions } from "../db/schema.js";
import { verifyAccessToken } from "./tokens.js";
import { permissionsHashForRole, roleHasAnyPermission } from "./permissions.js";

export interface AuthContext {
  userId: string;
  role: string;
  orgId: string;
  branchId: string;
  sessionId: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

function extractToken(req: Request): string | undefined {
  if (req.cookies?.access_token) return req.cookies.access_token;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "NO_TOKEN" });

  const payload = verifyAccessToken(token);
  if (!payload) return res.status(401).json({ error: "TOKEN_INVALID_OR_EXPIRED" });

  const session = db.select().from(activeSessions).where(eq(activeSessions.sessionId, payload.session_id)).get();
  if (!session || session.revokedAt) return res.status(401).json({ error: "SESSION_REVOKED" });

  const currentHash = permissionsHashForRole(payload.role);
  if (currentHash !== payload.permissions_hash) {
    db.update(activeSessions)
      .set({ revokedAt: new Date(), revokeReason: "permissions_changed" })
      .where(eq(activeSessions.sessionId, payload.session_id))
      .run();
    return res.status(401).json({ error: "PERMISSIONS_CHANGED" });
  }

  req.auth = {
    userId: payload.sub,
    role: payload.role,
    orgId: payload.org_id,
    branchId: payload.branch_id,
    sessionId: payload.session_id,
  };
  next();
}

// HR-03: real, DB-backed permission checks (auth/permissions.ts), not a
// hardcoded role-string list. Every call site names the specific
// permission(s) it needs (see auth/permissionKeys.ts for the full
// vocabulary) -- OR semantics across multiple keys, same as the old
// requireRole(...roles) list.
export function requirePermission(...permissionKeys: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "NO_TOKEN" });
    if (!roleHasAnyPermission(req.auth.role, permissionKeys)) return res.status(403).json({ error: "FORBIDDEN" });
    next();
  };
}
