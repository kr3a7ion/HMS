// Minimal branch staff listing -- currently just backs the Housekeeping
// Board's attendant assignment dropdown. Will grow into the real HR-01
// Staff Directory once that module gets its own pass.
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";

const router = Router();

router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const branchId = req.auth!.branchId;
  const rows = db.select({
    id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, email: users.email,
  }).from(users).where(role ? and(eq(users.branchId, branchId), eq(users.role, role)) : eq(users.branchId, branchId)).all();
  res.json(rows);
});

export default router;
