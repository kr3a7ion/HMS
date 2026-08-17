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
// Backend Blueprint B0.6 -- see the matching comment in local-server/app.ts.
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/organizations", organizationsRoutes);
app.use("/sync", syncRoutes);
app.use("/org", orgDashboardRoutes);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "nexura-central-server" });
});

app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // See the matching handler in local-server/app.ts: body-parser rejections
  // (B0.6's 256kb limit, malformed JSON) are client errors and must not be
  // reported as 500s.
  const bodyErr = err as { type?: string; status?: number; statusCode?: number };
  const status = bodyErr?.status ?? bodyErr?.statusCode;
  const isClientBodyError =
    typeof bodyErr?.type === "string" &&
    ["entity.too.large", "entity.parse.failed", "encoding.unsupported", "request.aborted", "parameters.too.many"].includes(bodyErr.type) &&
    typeof status === "number" && status >= 400 && status < 500;

  if (isClientBodyError) {
    console.warn(`[warn] ${req.method} ${req.path}: rejected request body (${bodyErr.type})`);
    if (!res.headersSent) {
      res.status(status!).json({ error: bodyErr.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST_BODY" });
    }
    return;
  }

  console.error(`[error] ${req.method} ${req.path}:`, err);
  if (!res.headersSent) res.status(500).json({ error: "INTERNAL_ERROR" });
});
