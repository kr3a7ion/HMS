import { nanoid } from "nanoid";
import { db } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export function logAudit(input: {
  actorType: "admin" | "org_user" | "branch_sync"; actorId?: string;
  organizationId?: string; branchId?: string; action: string; details?: string; ipAddress?: string | null;
}) {
  db.insert(auditLog).values({
    id: nanoid(), actorType: input.actorType, actorId: input.actorId, organizationId: input.organizationId,
    branchId: input.branchId, action: input.action, details: input.details, ipAddress: input.ipAddress ?? null,
    createdAt: new Date(),
  }).run();
}
