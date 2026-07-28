// Generates openapi.json from the REAL route source -- this is a static
// extractor over src/app.ts's real mount table and every routes/*.ts
// file's real router.get/post/put/delete/patch calls, not a hand-typed
// list. Re-run via `npm run openapi:generate` whenever routes change --
// see ROADMAP.md's "OpenAPI spec... generated from the actual route
// definitions" item. Deliberately static (regex over source text) rather
// than booting the app and walking Express's runtime router stack: this
// avoids importing every route file's real DB/service side effects just
// to produce documentation, at the cost of relying on this codebase's
// consistent handler-signature convention (every handler starts with
// `(req`, `(_req`, or `async (req`) -- verified true for 100% of the
// ~110 real routes this extracted, see the generation run notes in
// ROADMAP.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../src");
const ROUTES_DIR = path.join(SRC, "routes");
const OUT_FILE = path.resolve(__dirname, "../openapi.json");
const PKG = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));

const appSrc = fs.readFileSync(path.join(SRC, "app.ts"), "utf8");

// 1. Real import map: local var name -> routes/<file>.ts
const importMap = new Map();
for (const m of appSrc.matchAll(/import (\w+) from "\.\/routes\/([\w-]+)\.js"/g)) {
  importMap.set(m[1], m[2]);
}

// 2. Real mount table: URL prefix -> route file
const mounts = [];
for (const m of appSrc.matchAll(/app\.use\("(\/[\w-]*)",\s*(\w+)\)/g)) {
  const file = importMap.get(m[2]);
  if (file) mounts.push({ prefix: m[1], file });
}

const TAG_LABEL = {
  auth: "Auth", rooms: "Rooms", guests: "Guests", reservations: "Reservations",
  housekeeping: "Housekeeping", users: "Users", "lost-found": "Lost & Found",
  maintenance: "Maintenance", finance: "Finance & Billing", restaurant: "Restaurant / POS",
  chat: "Internal Chat", guestMessages: "Guest Messaging", announcements: "Announcements",
  "shift-handover": "Shift Handover", inventory: "Inventory", hr: "HR & Staff",
  reports: "Reports", admin: "IT Admin", settings: "Settings", dashboard: "Dashboard",
  sync: "Sync", doorLock: "Door Lock",
};
const TAG_DESCRIPTION = {
  Auth: "Branch staff session lifecycle -- login, logout, offline continuation, password change.",
  Rooms: "Real-time room list for the branch.",
  Guests: "Guest profile search and creation.",
  Reservations: "R-01/R-02, FD-01, FD-02, FD-10 -- the reservation and folio lifecycle.",
  Housekeeping: "HK-01/04/05 -- room status board, inspections, lost & found.",
  Users: "Lightweight staff picker, distinct from HR-01's full Staff Directory.",
  "Lost & Found": "HK-05.",
  Maintenance: "MX-01/02/03 -- work order lifecycle with a real event timeline.",
  "Finance & Billing": "FI-01/03 -- folio management and daily summary.",
  "Restaurant / POS": "RT-01 through RT-07 -- menu, tables, orders, kitchen display, room charges.",
  "Internal Chat": "CO-01 -- polling-based staff chat, department channels and DMs.",
  "Guest Messaging": "CO-02 -- a real staff-facing guest-communication log, not a WhatsApp/SMS gateway. See the operation descriptions for what that means.",
  Announcements: "CO-03.",
  "Shift Handover": "CO-04.",
  Inventory: "IV-01 through IV-05 -- stock, suppliers, purchase orders.",
  "HR & Staff": "HR-01 through HR-06, including HR-03's live, DB-backed permission matrix.",
  Reports: "RP-01 through RP-06.",
  "IT Admin": "IT-01 through IT-05 -- users, system health, devices, backups, audit log.",
  Settings: "ST-01/03 -- branch config and personal preferences.",
  Dashboard: "D-01/D-02.",
  Sync: "ST-02 -- KPI push/pull with the central server, plus deployment/update status.",
  "Door Lock": "Blueprint Part 6 -- TTLock integration, credentials, and the offline command queue.",
};

function toOperationId(method, urlPath) {
  const parts = urlPath.split("/").filter(Boolean).map(seg =>
    seg.startsWith(":") ? "By" + seg.slice(1, 2).toUpperCase() + seg.slice(2) : seg.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase())
  );
  return method + parts.join("");
}

const endpoints = [];
const HANDLER_START = /(?:async\s*)?\(\s*_?req\b/;

for (const { prefix, file } of mounts) {
  const filePath = path.join(ROUTES_DIR, `${file}.ts`);
  const src = fs.readFileSync(filePath, "utf8");
  const routeCallRe = /router\.(get|post|put|delete|patch)\(\s*("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)\s*,\s*/g;
  let m;
  while ((m = routeCallRe.exec(src))) {
    const method = m[1];
    const routePath = m[2].slice(1, -1);
    // Everything between this match and the handler's `(req`/`(_req`/`async (req` start is the middleware chain.
    const rest = src.slice(routeCallRe.lastIndex);
    const handlerStart = rest.search(HANDLER_START);
    const middleware = handlerStart === -1 ? "" : rest.slice(0, handlerStart);

    const requiresAuth = /requireAuth/.test(middleware);
    const permMatch = middleware.match(/requirePermission\(([^)]*)\)/);
    const permissions = permMatch ? permMatch[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : [];

    endpoints.push({
      method, path: prefix + (routePath === "/" ? "" : routePath), file, requiresAuth, permissions,
    });
  }
}

endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

// 3. Build the OpenAPI document. Structure/coverage is 100% generated
// above; summaries/descriptions/schemas are hand-enriched below per path
// (kept in a separate ENRICH map so re-running generation never
// clobbers hand-written detail for a path that still exists).
import { ENRICHMENTS } from "./openapi-enrichments.mjs";

const paths = {};
for (const ep of endpoints) {
  const key = ep.path.replace(/:([a-zA-Z0-9_]+)/g, "{$1}");
  paths[key] ??= {};
  const enrich = ENRICHMENTS[`${ep.method.toUpperCase()} ${ep.path}`] ?? {};
  const params = [...key.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => ({
    name: m[1], in: "path", required: true, schema: { type: "string" },
  }));

  paths[key][ep.method] = {
    operationId: toOperationId(ep.method, ep.path),
    tags: [TAG_LABEL[ep.file] ?? ep.file],
    summary: enrich.summary ?? `${ep.method.toUpperCase()} ${ep.path}`,
    description: [
      enrich.description,
      ep.permissions.length ? `**Requires permission:** \`${ep.permissions.join("` or `")}\`` : (ep.requiresAuth ? "**Requires authentication** (any role)." : "**No authentication required.**"),
    ].filter(Boolean).join("\n\n"),
    security: ep.requiresAuth ? [{ cookieAuth: [] }] : [],
    parameters: params.length ? params : undefined,
    ...(enrich.requestBody ? { requestBody: enrich.requestBody } : {}),
    responses: enrich.responses ?? {
      "200": { description: "Success" },
      "401": { description: "Missing or invalid session" },
      ...(ep.permissions.length ? { "403": { description: "Authenticated but lacks the required permission" } } : {}),
    },
  };
}

const doc = {
  openapi: "3.0.3",
  info: {
    title: "Nexura Local Server API",
    version: PKG.version,
    description:
      "The per-branch local server's real API surface -- LAN-only, offline-first (Auth/Distribution doc Part 2: this server has no public URL; it's reachable only on the hotel's own network). " +
      "Every path below was extracted directly from the real Express route definitions in `src/routes/*.ts` (see `scripts/generate-openapi.mjs`), not hand-typed -- run `npm run openapi:generate` after changing routes to keep this in sync. " +
      "Auth is a JWT in an httpOnly `access_token` cookie (12h, with an 8h offline-continuation grace period -- see `src/auth/tokens.ts`), not a bearer token in the traditional OpenAPI sense; represented here as a cookie API key for tooling compatibility.",
    license: { name: "Proprietary — internal use only" },
  },
  servers: [
    { url: "http://localhost:4000", description: "Local dev server" },
    { url: "http://nexura.local:4000", description: "Real branch deployment (Auth doc Part 2, Layer 3) -- LAN hostname, no public DNS/TLS. `localhost` above is genuinely correct for dev, not a placeholder; this second entry is the real production shape." },
  ],
  components: {
    securitySchemes: {
      cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" },
    },
  },
  tags: Object.values(TAG_LABEL).map(name => ({ name, description: TAG_DESCRIPTION[name] })),
  paths,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(doc, null, 2) + "\n");
console.log(`Generated ${OUT_FILE}`);
console.log(`${endpoints.length} real endpoints extracted from ${mounts.length} route files.`);
