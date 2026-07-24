// IT-05 Audit Log. Real, append-only writes -- nothing in this codebase
// issues UPDATE/DELETE against audit_log (enforcing that at the DB
// permission level is a Phase 3 deployment-target concern, see ROADMAP.md).
//
// Coverage is deliberately partial, not app-wide: login attempts (auth.ts)
// and the admin-security actions in routes/admin.ts (user role/status
// changes, password resets, device deauthorization, backup/restore). A
// full sweep instrumenting every mutating route in the app is real future
// work, not done here -- see ROADMAP.md.
import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export function logAudit(input: {
  userId: string | null; branchId: string | null; action: string;
  module?: string; recordId?: string; ipAddress?: string | null; details?: string;
}) {
  db.insert(auditLog).values({
    id: nanoid(),
    userId: input.userId,
    branchId: input.branchId,
    action: input.action,
    module: input.module,
    recordId: input.recordId,
    ipAddress: input.ipAddress ?? null,
    details: input.details,
    createdAt: new Date(),
  }).run();
}
