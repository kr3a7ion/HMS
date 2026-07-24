// Auth doc Part 6.3 — permissions_hash. A SHA-256 hash of the role's current
// permission set, embedded in every access token. If a manager edits role
// permissions mid-session (real now, via HR-03 -- see auth/permissionKeys.ts
// and routes/hr.ts's /roles endpoints), the hash recomputed here stops
// matching the token's stored hash, and requireAuth() invalidates the
// session immediately (see auth/middleware.ts) instead of waiting for
// token expiry.
//
// This used to be a hardcoded map; that was always documented as a stand-in
// for a real DB-backed lookup once HR-03 landed. Same mechanism, real
// source now: `roles.permissionsJson`, bootstrapped from
// permissionKeys.ts's SYSTEM_ROLE_SEED on first boot (db/client.ts) and
// editable from then on for any role, built-in or custom.
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { roles } from "../db/schema.js";

// HR-03: role assignment (invite, change role, etc.) needs to accept any
// real role -- built-in or custom -- not a hardcoded enum that would make
// "Create Custom Role" a dead end nobody could ever be assigned to.
export function roleExists(roleId: string): boolean {
  return db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).get() != null;
}

export function permissionsForRole(role: string): string[] | "*" {
  const row = db.select({ permissionsJson: roles.permissionsJson }).from(roles).where(eq(roles.id, role)).get();
  if (!row) return [];
  const parsed = JSON.parse(row.permissionsJson) as string[] | "*";
  return parsed;
}

export function permissionsHashForRole(role: string): string {
  const perms = permissionsForRole(role);
  const normalized = perms === "*" ? "*" : perms.slice().sort();
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

// OR semantics, same as the old requireRole(...roles) -- "any one of these
// is enough" -- just checked against a real permission grant instead of a
// literal role-name list. "*" (Platform Owner/Org Super Admin/Branch
// Manager, Blueprint 2.4's full-access roles) always passes.
export function roleHasAnyPermission(role: string, required: string[]): boolean {
  const perms = permissionsForRole(role);
  if (perms === "*") return true;
  return required.some(p => perms.includes(p));
}
