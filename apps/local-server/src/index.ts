import { app } from "./app.js";
import { logger } from "./lib/logger.js";
import { InsecureConfigError, logSecurityPosture, resolveBindHost } from "./lib/security.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Backend Blueprint B17.1 — refuse to bind every interface in production.
//
// A LAN-only product has no public URL. Listening on 0.0.0.0 on a hotel's
// back-office PC exposes the API to whatever else that machine can see --
// which, in a small property with one router, includes the guest wifi. This
// throws rather than warning, because a warning in a boot log on a machine in
// a back office is a warning nobody reads.
let host: string | undefined;
try {
  host = resolveBindHost();
} catch (err) {
  if (err instanceof InsecureConfigError) {
    logger.fatal(err.message);
    process.exit(1);
  }
  throw err;
}

const server = host ? app.listen(PORT, host) : app.listen(PORT);

server.on("listening", () => {
  logSecurityPosture(PORT, host);
  logger.info(
    { port: PORT, host: host ?? "0.0.0.0" },
    `[nexura-local-server] listening on http://${host ?? "localhost"}:${PORT}`,
  );
});
