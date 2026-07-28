import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
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
import adminRoutes from "./routes/admin.js";
import settingsRoutes from "./routes/settings.js";
import dashboardRoutes from "./routes/dashboard.js";
import syncRoutes from "./routes/sync.js";
import doorLockRoutes from "./routes/doorLock.js";
import { captureError } from "./services/errorLog.js";
import { startQueueProcessor } from "./services/locks/queue.js";
import { startUpdateChecker } from "./services/updater/index.js";
import { getSyncState } from "./services/sync.js";
import { db } from "./db/client.js";
import { syncState } from "./db/schema.js";
import { eq } from "drizzle-orm";

export const app = express();

// LAN-only in production (Auth doc Part 2 -- Layer 3 has no public URL).
// Permissive CORS here is fine for local dev against the Vite dev server;
// tighten to the branch's actual LAN origin(s) before this ships anywhere.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

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
app.use("/reports", reportsRoutes);
app.use("/admin", adminRoutes);
app.use("/settings", settingsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/sync", syncRoutes);
app.use("/door-lock", doorLockRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nexura-local-server" });
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
  captureError(req.method, req.path, err);
  console.error(`[error] ${req.method} ${req.path}:`, err);
  if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
});
