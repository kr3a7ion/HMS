import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import "./db/client.js"; // side effect: bootstraps schema on boot
import authRoutes from "./routes/auth.js";
import organizationsRoutes from "./routes/organizations.js";
import syncRoutes from "./routes/sync.js";
import orgDashboardRoutes from "./routes/org-dashboard.js";

export const app = express();

// Genuinely public-internet-facing (Blueprint 0.6/Auth doc 4.2 --
// admin.nexura.app / portal.nexura.app), unlike the local server's LAN-only
// CORS. Still permissive for this dev environment; tighten to the real
// portal/console origins before this ships anywhere real.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/organizations", organizationsRoutes);
app.use("/sync", syncRoutes);
app.use("/org", orgDashboardRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nexura-central-server" });
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[error] ${req.method} ${req.path}:`, err);
  if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
});
