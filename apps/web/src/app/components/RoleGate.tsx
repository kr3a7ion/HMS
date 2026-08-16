// UI Adoption F9 — action-level permission gating.
//
// Doc 3 §2.4: "Renders children only if the user's permission keys allow.
// Complements SCREEN_ROLE_MAP at the action level, so a wired-but-unpermitted
// button is never shown."
//
// THIS IS NOT SECURITY. The server's requirePermission() is the only thing
// enforcing anything; a user who edits this out of the bundle gains nothing
// but a 403. What it buys is that staff are not shown buttons that will fail
// -- FD sees no "Reopen day", HK sees no "Void charge".
//
// Keys must match apps/local-server/src/auth/permissionKeys.ts exactly. They
// come from GET /auth/me, which returns the role's effective permission list
// (added alongside this component -- before it, the client knew only the role
// NAME, which drifts the moment a manager edits a role via HR-03).
import type { ReactNode } from "react";
import { createContext, useContext } from "react";

/**
 * `"*"` is full access — Platform Owner, Org Super Admin, Branch Manager.
 * `undefined` is UNKNOWN, which is a different thing from empty (see below).
 */
export type PermissionSet = string[] | "*" | undefined;

// Default is `undefined` (unknown), NOT `[]` (known to have none).
//
// THIS FAILS OPEN, DELIBERATELY. If the provider is not mounted, or a session
// cached from before /auth/me returned permissions is rehydrated, the honest
// answer is "we don't know yet". Failing closed there would blank every
// gated action in the app and look like a total outage; failing open shows a
// button that the server answers with a 403 the user can actually see and
// report. Since this component is a UX affordance and never the control --
// requirePermission() on the route is -- the open failure is the cheap one.
//
// `[]` still means "this role genuinely has no permissions" and hides.
const PermissionContext = createContext<PermissionSet>(undefined);

export const PermissionProvider = PermissionContext.Provider;

export function usePermissions(): PermissionSet {
  return useContext(PermissionContext);
}

/** OR semantics, mirroring the server's roleHasAnyPermission(). */
export function hasAnyPermission(perms: PermissionSet, required: string[]): boolean {
  if (perms === undefined) return true;          // unknown — see note above
  if (perms === "*") return true;
  if (required.length === 0) return true;
  return required.some(p => perms.includes(p));
}

export function useHasPermission(...required: string[]): boolean {
  return hasAnyPermission(usePermissions(), required);
}

export interface RoleGateProps {
  /** Any one of these is enough, matching the server's OR semantics. */
  permission: string | string[];
  children: ReactNode;
  /**
   * Rendered instead when not permitted. Default is nothing.
   *
   * Prefer the default. Showing a disabled button tells staff an action
   * exists that they cannot reach, which generates a support call; hiding it
   * does not. Supply a fallback only where the absence would be confusing --
   * e.g. a summary tile whose slot would otherwise collapse.
   */
  fallback?: ReactNode;
}

export function RoleGate({ permission, children, fallback = null }: RoleGateProps) {
  const required = Array.isArray(permission) ? permission : [permission];
  return <>{useHasPermission(...required) ? children : fallback}</>;
}
