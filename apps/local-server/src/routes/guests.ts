import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq, or, like } from "drizzle-orm";
import { db } from "../db/client.js";
import { guests } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

// FD-04/R-02 guest search (name or phone) — used by New Reservation's guest picker.
router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const branchId = req.auth!.branchId;

  const rows = search
    ? db.select().from(guests).where(and(
        eq(guests.branchId, branchId),
        or(
          like(guests.firstName, `%${search}%`),
          like(guests.lastName, `%${search}%`),
          like(guests.phone, `%${search}%`),
        ),
      )).limit(20).all()
    : db.select().from(guests).where(eq(guests.branchId, branchId)).limit(20).all();

  res.json(rows);
});

const createGuestSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
});

// FD-04 "Create new guest profile" inline flow.
router.post("/", requireAuth, requirePermission("guests:create"), (req: AuthedRequest, res) => {
  const parsed = createGuestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = nanoid();
  db.insert(guests).values({
    id,
    branchId: req.auth!.branchId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    idType: parsed.data.idType,
    idNumber: parsed.data.idNumber,
    vip: false,
    blacklisted: false,
    createdAt: new Date(),
  }).run();

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "guest_created", module: "Reservations", recordId: id, details: `${parsed.data.firstName} ${parsed.data.lastName}`, ipAddress: req.ip });
  const created = db.select().from(guests).where(eq(guests.id, id)).get();
  res.status(201).json(created);
});

export default router;
