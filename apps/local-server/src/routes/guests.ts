import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq, or, like } from "drizzle-orm";
import { db } from "../db/client.js";
import { guests, reservations, rooms } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";
import { folioSummary } from "../services/folio.js";

const router = Router();

// FD-04/R-02 guest search (name or phone) — used by New Reservation's guest
// picker, and by FD-06 Guest Profiles as its list.
//
// The limit was a hardcoded 20, which is right for a type-ahead picker and
// wrong for a directory screen: a property with 500 guests showed 20 and gave
// no indication the rest existed. It is now a parameter with the picker's 20
// as the default, capped so a caller cannot ask for the whole table.
router.get("/", requireAuth, (req: AuthedRequest, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const branchId = req.auth!.branchId;

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 20;

  const rows = search
    ? db.select().from(guests).where(and(
        eq(guests.branchId, branchId),
        or(
          like(guests.firstName, `%${search}%`),
          like(guests.lastName, `%${search}%`),
          like(guests.phone, `%${search}%`),
        ),
      )).limit(limit).all()
    : db.select().from(guests).where(eq(guests.branchId, branchId)).limit(limit).all();

  // FD-06 Guest Profiles shows stay counts, last stay, current-stay flag and
  // outstanding balance, and two of its filter tabs ("Active Stay", "Has
  // Balance") are meaningless without them.
  //
  // OPT-IN, because the same endpoint backs New Reservation's type-ahead
  // guest picker, which fires on every keystroke and needs none of this. A
  // picker paying for folio summaries it will not render is how a search box
  // starts feeling slow.
  if (req.query.withStats !== "true") return res.json(rows);

  // One pass over the branch's reservations rather than a query per guest.
  const byGuest = new Map<string, (typeof reservations.$inferSelect)[]>();
  for (const r of db.select().from(reservations).where(eq(reservations.branchId, branchId)).all()) {
    const list = byGuest.get(r.guestId);
    if (list) list.push(r); else byGuest.set(r.guestId, [r]);
  }

  res.json(rows.map(g => {
    const stays = (byGuest.get(g.id) ?? [])
      .filter(r => r.status === "checked_in" || r.status === "checked_out")
      .sort((a, b) => b.checkOutDate.getTime() - a.checkOutDate.getTime());

    // Folio summaries are the expensive part, so they run only over stays
    // that can still carry a balance -- a cancelled booking never had one.
    let balanceKobo = 0;
    for (const stay of stays) balanceKobo += folioSummary(stay.id).balanceKobo;

    return {
      ...g,
      totalStays: stays.length,
      lastStayAt: stays[0] ? stays[0].checkOutDate.toISOString() : null,
      activeStay: stays.some(r => r.status === "checked_in"),
      balanceKobo,
    };
  }));
});

// FD-06 Guest Profile Detail. Added for the UI adoption: the screen existed
// and had nowhere to read from -- GET /guests returns a capped list and
// nothing served a single guest, so the detail view could only have been
// built by fetching the list and filtering client-side, which breaks the
// moment a property has more than a page of guests.
//
// Stay history is included rather than left to a second request: it is the
// entire point of a guest profile, and the alternative is every caller
// re-deriving "reservations where guestId = this one".
router.get("/:id", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const guest = db.select().from(guests).where(and(
    eq(guests.id, req.params.id),
    eq(guests.branchId, branchId),
  )).get();
  if (!guest) return res.status(404).json({ error: "NOT_FOUND" });

  const roomById = new Map(
    db.select().from(rooms).where(eq(rooms.branchId, branchId)).all().map(r => [r.id, r]),
  );
  const stays = db.select().from(reservations).where(and(
    eq(reservations.branchId, branchId),
    eq(reservations.guestId, guest.id),
  )).all()
    .sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime())
    .map(r => ({
      id: r.id,
      checkInDate: r.checkInDate,
      checkOutDate: r.checkOutDate,
      status: r.status,
      rateKobo: r.rateKobo,
      roomNumber: r.roomId ? roomById.get(r.roomId)?.number ?? null : null,
    }));

  // Cancellations and no-shows are excluded from the count a clerk reads as
  // "how often has this person stayed here" -- a booking that never happened
  // is not a stay.
  const completed = stays.filter(s => s.status === "checked_out" || s.status === "checked_in");

  // LIFETIME VALUE IS WHAT THEY WERE CHARGED, not the nightly rate.
  //
  // The first version summed `rateKobo`, which is the rate PER NIGHT. A guest
  // with two three-night stays at 45,000 and 38,000 came back as 83,000 --
  // roughly a third of the truth, and it would have been read as "this
  // person is worth 83,000 to us" when deciding whether to comp an upgrade.
  //
  // The folio is the only thing that knows what was actually charged: room
  // nights, extras, tax, and any adjustment made along the way.
  const lifetimeValueKobo = completed.reduce(
    (sum, s) => sum + folioSummary(s.id).totalChargesKobo, 0);

  res.json({
    ...guest,
    stays,
    totalStays: completed.length,
    lastStayAt: completed[0]?.checkOutDate ?? null,
    lifetimeValueKobo,
  });
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
