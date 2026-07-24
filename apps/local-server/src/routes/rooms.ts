import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { rooms } from "../db/schema.js";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";

const router = Router();

// R-01 Reservation Grid / FD-03 Room Assignment / FD-01 Step 3 all read this.
router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const branchRooms = db.select().from(rooms).where(eq(rooms.branchId, req.auth!.branchId)).all();
  res.json(branchRooms.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })));
});

export default router;
