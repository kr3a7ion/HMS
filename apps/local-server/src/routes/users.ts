import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { roleHasAnyPermission } from "../auth/permissions.js";

const router = Router();

// The staff picker behind every "assign to…" dropdown: work orders,
// housekeeping attendants, shift rosters. Deliberately available to any
// authenticated user, because assigning work is not a privileged act.
//
// EMAIL IS NOT. Found by B17.7's route audit: this returned every colleague's
// email address to anyone with a login, which is a staff-directory dump and
// the raw material for a phishing run against the property. A dropdown needs
// a name and an id; it has never needed the email. It is now returned only to
// roles that manage people or accounts, which are the roles that legitimately
// need to contact or administer them.
router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const branchId = req.auth!.branchId;
  const maySeeContactDetails = roleHasAnyPermission(req.auth!.role, ["hr:manage", "admin:manage"]);

  const rows = db.select({
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    role: users.role,
    email: users.email,
  })
    .from(users)
    .where(role ? and(eq(users.branchId, branchId), eq(users.role, role)) : eq(users.branchId, branchId))
    .all();

  res.json(maySeeContactDetails
    ? rows
    : rows.map(({ email, ...rest }) => rest));
});

export default router;
