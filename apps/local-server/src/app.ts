import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import path from "node:path";
import fs from "node:fs";
import { logger } from "./lib/logger.js";
import { requestIdMiddleware } from "./lib/requestId.js";
import { corsAllowlist, isProduction, originAllowed, STATE_CHANGING } from "./lib/security.js";
import type { AuthedRequest } from "./auth/middleware.js";
import "./db/client.js"; // side effect: bootstraps schema on boot
import authRoutes from "./routes/auth.js";
import roomsRoutes from "./routes/rooms.js";
import guestsRoutes from "./routes/guests.js";
import reservationsRoutes from "./routes/reservations.js";
import housekeepingRoutes from "./routes/housekeeping.js";
import usersRoutes from "./routes/users.js";
import lostFoundRoutes from "./routes/lost-found.js";
import maintenanceRoutes from "./routes/maintenance.js";
import financeRoutes from "./routes/finance.js";
import restaurantRoutes from "./routes/restaurant.js";
import chatRoutes from "./routes/chat.js";
import guestMessagesRoutes from "./routes/guestMessages.js";
import announcementsRoutes from "./routes/announcements.js";
import shiftHandoverRoutes from "./routes/shift-handover.js";
import inventoryRoutes from "./routes/inventory.js";
import hrRoutes from "./routes/hr.js";
import reportsRoutes from "./routes/reports.js";
import foliosRoutes from "./routes/folios.js";
import invoicesRoutes from "./routes/invoices.js";
import receiptsRoutes from "./routes/receipts.js";
import roomTypesRoutes from "./routes/roomTypes.js";
import ratePlansRoutes from "./routes/ratePlans.js";
import rateCalendarRoutes from "./routes/rateCalendar.js";
import availabilityRoutes from "./routes/availability.js";
import inventoryCalendarRoutes from "./routes/inventoryCalendar.js";
import refundsRoutes from "./routes/refunds.js";
import depositsRoutes from "./routes/deposits.js";
import updatesRoutes from "./routes/updates.js";
import paymentsRoutes from "./routes/payments.js";
import settlementsRoutes from "./routes/settlements.js";
import paymentWebhookRoutes from "./routes/paymentWebhooks.js";
import nightAuditRoutes from "./routes/nightAudit.js";
import adminRoutes from "./routes/admin.js";
import settingsRoutes from "./routes/settings.js";
import dashboardRoutes from "./routes/dashboard.js";
import syncRoutes from "./routes/sync.js";
import doorLockRoutes from "./routes/doorLock.js";
import { captureError } from "./services/errorLog.js";
import { startQueueProcessor } from "./services/locks/queue.js";
import { startNightAuditScheduler } from "./services/nightAudit/scheduler.js";
import { ensureLegacyTaxCodesForAllBranches } from "./services/tax/branchDefaults.js";
import { healthReport, isEssentialPath, writesBlockedByDisk } from "./services/health/index.js";
import { startHeartbeat } from "./services/health/heartbeat.js";
import { startBackupScheduler } from "./services/backup/scheduler.js";
import { startUpdateChecker } from "./services/updater/index.js";
import { getSyncState } from "./services/sync.js";
import { db, schemaVersion } from "./db/client.js";
import { syncState } from "./db/schema.js";
import { eq } from "drizzle-orm";

export const app = express();

// Backend Blueprint B17.3 — helmet. Registered FIRST so its headers are on
// every response including errors and 404s.
//
// The CSP has no 'unsafe-inline' for scripts: the Vite production build emits
// external modules, so it complies. Styles keep 'unsafe-inline' because the
// screens use inline `style={{ }}` objects throughout -- removing that is a
// frontend refactor (Phase 3's token work), and claiming a stricter policy
// than the app can actually satisfy would just mean turning CSP off later.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      // Same-origin only: the packaged image serves the frontend from this
      // server, and a local server has no business calling anywhere else.
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],   // clickjacking
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  // HSTS only in production: sending it in dev would pin http://localhost to
  // https in the developer's browser and be a nuisance to undo.
  hsts: isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  // The API is not a document; referrers leak reservation ids in URLs.
  referrerPolicy: { policy: "no-referrer" },
  crossOriginResourcePolicy: { policy: "same-site" },
}));

// Backend Blueprint B17.2 — CORS from an explicit allowlist.
//
// `origin: true` reflected whatever Origin the caller sent, which with
// `credentials: true` means ANY website a logged-in staff member visited
// could read this API using their session cookie. In production the allowlist
// is empty by design: the packaged image serves the frontend same-origin, so
// a legitimate browser never makes a cross-origin request here at all.
const allowedOrigins = corsAllowlist();
app.use(cors({
  origin(origin, callback) {
    if (originAllowed(origin, allowedOrigins)) return callback(null, true);
    // Not an exception: an Express error here becomes a 500. A rejected
    // origin simply gets no CORS headers, and the browser blocks it.
    return callback(null, false);
  },
  credentials: true,
}));

// A second, independent check on state-changing methods. CORS is advisory --
// it constrains browsers, and only those that implement it. This rejects the
// request outright rather than relying on the caller to police itself.
app.use((req, res, next) => {
  if (!STATE_CHANGING.has(req.method)) return next();
  if (originAllowed(req.get("origin"), allowedOrigins)) return next();
  logger.warn({ origin: req.get("origin"), path: req.path, method: req.method }, "[security] Cross-origin write rejected");
  return res.status(403).json({ error: "CROSS_ORIGIN_FORBIDDEN" });
});

// Backend Blueprint B0.4/B0.5. These two must sit ABOVE the body parser:
// express.json() rejects oversized and malformed bodies by throwing, and a
// request rejected there still needs an ID to report and a log line to
// appear in. Registering them after the parser silently exempts exactly the
// requests most worth tracing.
//
// The HTTP logger still observes the finished response (status + duration)
// because pino-http hooks response events rather than the downstream chain;
// `actor` is resolved lazily at log time since requireAuth populates
// req.auth further down.
app.use(requestIdMiddleware);
app.use(pinoHttp({
  logger,
  genReqId: (req) => (req as express.Request).requestId,
  customProps: (req) => {
    const auth = (req as AuthedRequest).auth;
    return auth ? { actorId: auth.userId, actorRole: auth.role, branchId: auth.branchId } : {};
  },
  // Express already 4xx's for client mistakes; those are not server errors
  // and shouldn't page anyone, so only 5xx logs at error level.
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
}));

// Backend Blueprint B0.6. Express's default JSON limit is 100kb, but it is
// stated nowhere in this file -- an explicit limit means a future bump for
// one large endpoint is a visible decision rather than a silent global
// change. 256kb comfortably covers the largest real payload here (a bulk
// housekeeping assignment or a rooming-list import).
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

// Backend Blueprint B17.4 — rate limiting.
//
// Two limiters, because the two surfaces have opposite shapes. A front desk
// legitimately makes hundreds of API calls a minute during check-in rush, so
// a global limit tuned for /auth would break the product. /auth is where
// guessing happens and where a handful of attempts per minute is already
// generous.
//
// Disabled under test: the suites fire hundreds of logins in seconds and
// would throttle themselves, which would make the tests measure the limiter
// rather than the thing under test.
const rateLimitingEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;

if (rateLimitingEnabled) {
  app.use("/auth", rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS", scope: "auth" },
  }));

  app.use(rateLimit({
    windowMs: 60_000,
    // Sized for a busy front desk, not for a single user: this is the ceiling
    // that stops a runaway client or a scraper, not a per-action budget.
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  }));
}

// Backend Blueprint B19.7 — the disk headroom guard.
//
// Below the blocking threshold, work that only ADDS data is refused while the
// paths that free space or settle money keep working. A property at 400 MiB
// free must still be able to check a guest out, take a payment and close the
// day; blocking everything would strand guests in rooms the system refuses to
// release.
app.use((req, res, next) => {
  if (!STATE_CHANGING.has(req.method)) return next();
  if (isEssentialPath(req.path)) return next();
  if (!writesBlockedByDisk()) return next();
  return res.status(507).json({
    error: "INSUFFICIENT_STORAGE",
    message: "The server is critically low on disk space and is refusing non-essential writes. "
      + "Check-out, payment and day-close remain available. Free space or restore headroom immediately.",
  });
});

app.use("/auth", authRoutes);
app.use("/rooms", roomsRoutes);
app.use("/guests", guestsRoutes);
app.use("/reservations", reservationsRoutes);
app.use("/housekeeping", housekeepingRoutes);
app.use("/users", usersRoutes);
app.use("/lost-found", lostFoundRoutes);
app.use("/maintenance", maintenanceRoutes);
app.use("/finance", financeRoutes);
app.use("/restaurant", restaurantRoutes);
app.use("/chat", chatRoutes);
app.use("/guest-messages", guestMessagesRoutes);
app.use("/announcements", announcementsRoutes);
app.use("/shift-handovers", shiftHandoverRoutes);
app.use("/inventory", inventoryRoutes);
app.use("/hr", hrRoutes);
app.use("/folios", foliosRoutes);
app.use("/invoices", invoicesRoutes);
app.use("/receipts", receiptsRoutes);
app.use("/room-types", roomTypesRoutes);
app.use("/rate-plans", ratePlansRoutes);
app.use("/rate-calendar", rateCalendarRoutes);
app.use("/availability", availabilityRoutes);
app.use("/inventory-calendar", inventoryCalendarRoutes);
app.use("/refunds", refundsRoutes);
app.use("/deposits", depositsRoutes);
app.use("/updates", updatesRoutes);
app.use("/payments", paymentsRoutes);
app.use("/settlements", settlementsRoutes);
app.use("/payment-webhooks", paymentWebhookRoutes);
app.use("/night-audit", nightAuditRoutes);
app.use("/reports", reportsRoutes);
app.use("/admin", adminRoutes);
app.use("/settings", settingsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/sync", syncRoutes);
app.use("/door-lock", doorLockRoutes);

// Backend Blueprint B1 DoD: "migration version visible in a health
// endpoint" -- so an operator can confirm which schema a property is
// actually on without shelling in. B19 turns this into a real health check
// (DB writability, disk headroom, lock provider reachability) rather than a
// hardcoded ok:true.
// Backend Blueprint B19.6 — a health endpoint that can say "no".
//
// This used to be `res.json({ ok: true })`: a hardcoded literal that reported
// healthy while the disk was full, while the database was read-only, and while
// migrations had failed, because it never asked anything. B18's automatic
// rollback watches this endpoint -- a health check that cannot fail would have
// told it a broken build was fine.
//
// Unauthenticated by design: a container orchestrator and the updater's own
// probe both need it before any session exists. It returns operational state,
// never data.
app.get("/health", (_req, res) => {
  const report = healthReport();
  // 503 when genuinely unable to operate, so a load balancer or the updater's
  // probe reacts without having to parse the body.
  res.status(report.ok ? 200 : 503).json(report);
});

// Distribution (Auth/Distribution doc Part 10.1): the packaged local server
// serves the compiled frontend build alongside its own API on the same
// origin. `public/` only exists when server/Dockerfile copied a frontend
// build in at image-build time -- `npm run dev` here plus a separately-run
// Vite dev server (the normal local dev setup) is unaffected. Registered
// after every API route so a genuine 404 under e.g. /rooms/nope still 404s
// instead of being swallowed by the SPA fallback.
const publicDir = path.resolve(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
}

// Blueprint 6.10: retry queued lock commands every 2 minutes.
startQueueProcessor();

// Backend Blueprint B5: close the trading day even with nobody logged in.
startNightAuditScheduler();

// Backend Blueprint B6: every branch has a tax code, whatever created it.
// Migration 0006 covers branches that already existed; this covers any
// created afterwards by a path that forgot. Creates only, never updates, so
// a rate an operator deliberately changed is never reverted on restart.
ensureLegacyTaxCodesForAllBranches();

// Backend Blueprint B19.5 — a heartbeat every 60s. The alert central raises
// is an ABSENCE, so this has to keep ticking whether or not anything is wrong.
startHeartbeat();

// Backend Blueprint B19.1-19.4 — scheduled backups, retention pruning, and
// the monthly restore test that makes a backup a backup.
startBackupScheduler();

// Blueprint 11.1: the auto-updater's own scheduled check, independent of
// sync (which also triggers a check on every pull -- see services/sync.ts
// -- so "Sync Now" in Settings doesn't have to wait up to 6h for a fresh
// answer). No-ops safely if NEXURA_REGISTRY_URL isn't set, same "not
// configured" pattern as sync itself before a branch is provisioned.
startUpdateChecker(
  () => { const s = getSyncState(); return { channel: s.updateChannel ?? "stable", rollbackTarget: s.rollbackToVersion }; },
  (result) => {
    db.update(syncState).set({ lastUpdateCheckAt: new Date(), lastUpdateStatus: result.status, lastUpdateError: result.error ?? null }).where(eq(syncState.id, "singleton")).run();
  },
);

// IT-02 error-log capture -- must be registered after every route so
// Express treats it as the error handler (4-arg signature is what makes
// that happen, not registration order relative to other middleware).
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // body-parser signals a rejected request through `err.type` and carries
  // its own status. Without this, an oversized or malformed body (B0.6's
  // 256kb limit doing its job) surfaces as a 500 -- which tells the client
  // the server broke when the request was actually at fault, files an
  // IT-02 error-log entry for a non-error, and logs at error level so
  // routine junk traffic would drown real failures.
  const bodyErr = err as { type?: string; status?: number; statusCode?: number };
  const status = bodyErr?.status ?? bodyErr?.statusCode;
  const isClientBodyError =
    typeof bodyErr?.type === "string" &&
    ["entity.too.large", "entity.parse.failed", "encoding.unsupported", "request.aborted", "parameters.too.many"].includes(bodyErr.type) &&
    typeof status === "number" && status >= 400 && status < 500;

  if (isClientBodyError) {
    logger.warn({ requestId: req.requestId, method: req.method, path: req.path, type: bodyErr.type, status }, "Rejected malformed or oversized request body");
    if (!res.headersSent) {
      res.status(status!).json({
        error: bodyErr.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST_BODY",
        requestId: req.requestId,
      });
    }
    return;
  }

  captureError(req.method, req.path, err);
  logger.error({ err, requestId: req.requestId, method: req.method, path: req.path }, "Unhandled error");
  // The request ID goes back to the client so a user reporting a failure can
  // quote it and land support directly on the matching log line (B0.4).
  if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR", requestId: req.requestId });
});
