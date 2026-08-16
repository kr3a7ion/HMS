// Backend Blueprint B5 — the scheduled night audit.
//
// "On a LAN box nobody may be logged in at 3am" is the whole reason this
// exists: the day must close whether or not a human is present.
//
// Deliberately NOT node-cron. The requirement is "once an hour, check
// whether the day is due" -- a setInterval does that with no added
// dependency, and the audit is idempotent so an extra check costs nothing.
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { branches } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import { runNightAudit, pendingNightCount } from "./index.js";

const CHECK_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

export function startNightAuditScheduler(): NodeJS.Timeout | null {
  if (process.env.NEXURA_DISABLE_NIGHT_AUDIT_SCHEDULER === "1") {
    logger.info("[night-audit] Scheduler disabled by NEXURA_DISABLE_NIGHT_AUDIT_SCHEDULER");
    return null;
  }

  const tick = () => {
    try {
      for (const branch of db.select().from(branches).all()) {
        const pending = pendingNightCount(branch.id);
        if (pending <= 0) continue;
        logger.info({ branchId: branch.id, pending }, "[night-audit] Scheduled run starting");
        // operatorUserId null marks this as the scheduler rather than a
        // person, which the run record and the audit log both show.
        const results = runNightAudit(branch.id, { operatorUserId: null });
        const failed = results.filter(r => r.status === "failed");
        logger.info(
          { branchId: branch.id, closed: results.length - failed.length, failed: failed.length },
          "[night-audit] Scheduled run finished",
        );
      }
    } catch (err) {
      // Never let a scheduler tick take the server down.
      logger.error({ err }, "[night-audit] Scheduled run threw");
    }
  };

  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  timer.unref?.(); // don't hold the process open in tests
  return timer;
}
