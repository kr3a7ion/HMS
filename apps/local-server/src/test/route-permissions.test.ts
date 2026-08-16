// Backend Blueprint B17.7 — the permission audit.
//
// WHY THIS IS A TEST AND NOT A REVIEW. "Every route declares a permission" is
// a claim about code that does not exist yet as much as code that does: the
// route added next month is exactly where the gap appears, and no amount of
// care at review time catches it reliably. So it is enumerated and enforced.
//
// The rule this file encodes:
//
//   Every registered route is one of three things, and it must be EXPLICIT
//   about which:
//     1. permission-gated  — requireAuth + requirePermission(...)
//     2. authenticated-only — requireAuth, and listed in AUTHENTICATED_ONLY
//        below with a stated reason
//     3. public            — listed in PUBLIC with a stated reason
//
//   Anything else fails. A route that is merely *forgotten* looks identical
//   to one that is deliberately open, and that ambiguity is the whole
//   problem: the failure mode is silent, and it is a data breach.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.resolve(here, "..", "routes");
const appPath = path.resolve(here, "..", "app.ts");

/**
 * Routes that are deliberately reachable WITHOUT authentication.
 * Each needs a reason, because each is an unauthenticated attack surface.
 */
const PUBLIC = new Map<string, string>([
  ["POST /auth/login", "the login endpoint itself — rate-limited (B17.4)"],
  ["POST /auth/continue-offline", "the offline grace extension: verifies the signed token itself, and by definition runs when nothing external is reachable"],
  ["POST /payment-webhooks/:provider", "a payment gateway has no session, so this is authenticated by HMAC SIGNATURE over the raw body instead (B23) — an unsigned call is refused with 401 before anything is read"],
]);

/**
 * Routes that require a session but deliberately no specific permission.
 * Each needs a reason. "Any authenticated member of staff may read this."
 */
const AUTHENTICATED_ONLY = new Map<string, string>([
  // ── The caller's own identity and settings ────────────────────────────
  ["GET /auth/me", "returns the caller's own identity"],
  ["POST /auth/logout", "clears the caller's own session"],
  ["GET /settings/me", "the caller's own preferences"],
  ["POST /settings/me", "the caller's own preferences"],
  ["GET /dashboard/me", "the caller's own role dashboard"],
  ["POST /auth/change-password", "changes the caller's own password (current password is re-verified in-handler)"],

  // ── Operational reads every role needs to do its job ──────────────────
  ["GET /rooms/", "the room list drives navigation on nearly every screen"],
  ["GET /rooms/assignment-board", "front-desk shift board over rooms the branch already exposes"],
  ["GET /reservations/", "the reservation grid is the front-desk home screen"],
  ["GET /reservations/:id", "reservation detail — every operational role opens this"],
  ["GET /reservations/search", "search over the same rows the grid already shows"],
  ["GET /reservations/arrivals", "shift list, same data as the grid"],
  ["GET /reservations/departures", "shift list, same data as the grid"],
  ["GET /reservations/in-house", "shift list, same data as the grid"],
  ["GET /settings/branch", "the sidebar needs enabledModules for every role"],
  ["GET /guests/", "guest lookup is core front-desk work; creating and editing are gated on guests:create"],
  ["GET /guests/:id", "guest profile detail — same rows as the list above, plus this guest's own stay history. A clerk taking a booking needs to see whether the person has stayed before and what they were charged; withholding it from the roles that can already read the list would only push them to the reservation grid to reconstruct it by hand"],
  ["GET /lost-found/", "any staff member may check whether an item was handed in; logging, claiming and disposing are gated"],
  ["GET /housekeeping/rooms", "room status is read by front desk, maintenance and housekeeping alike"],
  ["GET /housekeeping/inspections", "inspection history over the branch's own rooms; recording one is gated"],
  ["GET /restaurant/menu", "the menu is read by anyone taking an order or a room-service request"],
  ["GET /restaurant/tables", "floor layout, same reasoning as the menu"],
  ["GET /users/", "the staff picker behind every assign-to dropdown; contact details are filtered out unless the caller manages people (see users.ts)"],

  // ── Anyone may report a fault; acting on it is gated ──────────────────
  ["GET /maintenance/work-orders", "the work-order list is visible to all staff so a fault is not reported twice"],
  ["POST /maintenance/work-orders", "DELIBERATE: any member of staff may report a fault. Assigning and closing are gated on maintenance:manage"],
  ["GET /maintenance/work-orders/:id", "same as the list"],

  // ── Staff communications: membership-checked inside the handler ───────
  ["GET /announcements/", "staff announcements are addressed to all staff"],
  ["POST /announcements/:id/read", "the caller's own read receipt"],
  ["GET /chat/channels", "returns only channels the caller belongs to"],
  ["POST /chat/dm", "starting a direct message with a colleague"],
  ["GET /chat/channels/:id/messages", "canAccessChannel() enforces membership in-handler — a permission key cannot express 'is a member of THIS channel'"],
  ["POST /chat/channels/:id/messages", "same membership check"],

  // ── Authorised in-handler by a rule a permission key cannot express ───
  ["GET /hr/staff/:id", "isSelfOrManager() in-handler: a staff member may read their OWN profile, a manager may read anyone's. Notes stay gated on hr:manage"],
  ["GET /reports/department", "row-scoped in-handler: a non-manager only ever receives their own department's metrics; managers may request any"],
]);

interface RouteDecl {
  file: string;
  line: number;
  method: string;
  routePath: string;
  hasRequireAuth: boolean;
  permissions: string[];
}

/** Mount prefixes from app.ts, so a route reads as its real URL. */
function readMounts(): Map<string, string> {
  const src = fs.readFileSync(appPath, "utf8");
  const mounts = new Map<string, string>();
  const re = /app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) mounts.set(m[2], m[1]);
  return mounts;
}

/** Which router variable a route file exports, by import name in app.ts. */
function readImports(): Map<string, string> {
  const src = fs.readFileSync(appPath, "utf8");
  const byFile = new Map<string, string>();
  const re = /import\s+(\w+)\s+from\s+["'`]\.\/routes\/([\w-]+)\.js["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) byFile.set(`${m[2]}.ts`, m[1]);
  return byFile;
}

function parseRoutes(): RouteDecl[] {
  const mounts = readMounts();
  const importNames = readImports();
  const decls: RouteDecl[] = [];

  for (const file of fs.readdirSync(routesDir).filter(f => f.endsWith(".ts")).sort()) {
    const src = fs.readFileSync(path.join(routesDir, file), "utf8");
    const importName = importNames.get(file);
    const prefix = importName ? mounts.get(importName) ?? "" : "";

    // Match `router.get("/path", ...middleware..., handler)` up to the first
    // `(req` — enough to see the middleware chain without parsing the body.
    const re = /router\.(get|post|patch|put|delete)\s*\(\s*(["'`])([^"'`]*)\2([\s\S]*?)(?:\(\s*req|\(\s*_req|\(\s*\)|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const [, method, , routePath, middleware] = m;
      const permissions: string[] = [];
      const permRe = /requirePermission\s*\(([^)]*)\)/g;
      let p: RegExpExecArray | null;
      while ((p = permRe.exec(middleware)) !== null) {
        for (const raw of p[1].split(",")) {
          const key = raw.trim().replace(/^["'`]|["'`]$/g, "");
          if (key) permissions.push(key);
        }
      }
      decls.push({
        file,
        line: src.slice(0, m.index).split("\n").length,
        method: method.toUpperCase(),
        routePath: `${prefix}${routePath}`,
        hasRequireAuth: /requireAuth/.test(middleware),
        permissions,
      });
    }
  }
  return decls;
}

const routes = parseRoutes();
const key = (r: RouteDecl) => `${r.method} ${r.routePath}`;

describe("the permission audit", () => {
  test("the parser actually found the routes (a silent zero would pass everything)", () => {
    // Without this, a regex that stopped matching would make every assertion
    // below vacuously true and the audit would report all-clear forever.
    assert.ok(routes.length > 150, `expected 150+ routes, parsed ${routes.length}`);
    assert.ok(
      routes.some(r => r.routePath.startsWith("/reservations")),
      "mount prefixes resolved",
    );
  });

  test("every route is authenticated, or listed as public with a reason", () => {
    const offenders = routes
      .filter(r => !r.hasRequireAuth)
      .filter(r => !PUBLIC.has(key(r)))
      .map(r => `${key(r)}  (${r.file}:${r.line})`);

    assert.deepEqual(
      offenders, [],
      "Unauthenticated routes must be added to PUBLIC with a stated reason.\n"
      + "A route that was merely forgotten looks identical to one deliberately open.",
    );
  });

  test("every authenticated route declares a permission, or is listed with a reason", () => {
    const offenders = routes
      .filter(r => r.hasRequireAuth && r.permissions.length === 0)
      .filter(r => !AUTHENTICATED_ONLY.has(key(r)))
      .map(r => `${key(r)}  (${r.file}:${r.line})`);

    assert.deepEqual(
      offenders, [],
      "Add requirePermission(...), or list the route in AUTHENTICATED_ONLY with a reason.",
    );
  });

  test("every declared permission is a real key in the vocabulary", async () => {
    // A typo'd key is worse than a missing one: requirePermission("folio:reed")
    // matches no role, so the route silently becomes unreachable — or, if the
    // check were ever loosened, silently open.
    const { PERMISSION_KEY_SET } = await import("../auth/permissionKeys.js");
    const unknown: string[] = [];
    for (const r of routes) {
      for (const p of r.permissions) {
        // Skip anything that isn't a literal (e.g. a variable reference).
        if (!/^[a-z_]+:[a-z_]+$/.test(p)) continue;
        if (!PERMISSION_KEY_SET.has(p)) unknown.push(`${key(r)} → "${p}"  (${r.file}:${r.line})`);
      }
    }
    assert.deepEqual(unknown, [], "Unknown permission keys — check permissionKeys.ts");
  });

  test("the allowlists contain no stale entries", () => {
    // An allowlist that outlives its route is how an exemption quietly
    // survives the thing it was granted for.
    const live = new Set(routes.map(key));
    const stale = [...PUBLIC.keys(), ...AUTHENTICATED_ONLY.keys()].filter(k => !live.has(k));
    assert.deepEqual(stale, [], "Remove entries for routes that no longer exist");
  });
});
