// Backend Blueprint B8 — availability and quoting.
//
// Both answers come from inventory_calendar and the rate resolver. Nothing
// here scans reservations, which is the batch's definition of done.
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { isHandlerError } from "../lib/handlerError.js";
import { formatNaira } from "../lib/money.js";
import { activeRoomTypes, availabilityForType } from "../services/availability/inventory.js";
import { defaultRatePlan, resolveRate } from "../services/availability/rates.js";
import { quoteStay } from "../services/availability/quote.js";

const router = Router();

// GET /availability?from&to&typeId&guests
router.get("/", requireAuth, requirePermission("rates:read", "inventory:calendar", "reservations:create"), (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date();
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return res.status(400).json({ error: "INVALID_DATE_RANGE" });
  }
  const guests = typeof req.query.guests === "string" ? Number(req.query.guests) : undefined;

  const plan = defaultRatePlan(branchId);
  let types = activeRoomTypes(branchId);
  if (typeof req.query.typeId === "string") types = types.filter(t => t.id === req.query.typeId);
  if (guests != null && Number.isFinite(guests)) types = types.filter(t => t.maxOccupancy >= guests);

  res.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    ratePlanId: plan?.id ?? null,
    types: types.map(type => {
      const nights = availabilityForType(branchId, type.id, from, to);
      return {
        roomTypeId: type.id,
        code: type.code,
        name: type.name,
        maxOccupancy: type.maxOccupancy,
        nights: nights.map(n => {
          const rate = plan ? resolveRate(plan.id, type.id, n.stayDate) : null;
          return {
            stayDate: n.stayDate.toISOString().slice(0, 10),
            available: n.available,
            sellable: n.sellable,
            totalRooms: n.totalRooms,
            sold: n.sold,
            rateKobo: rate?.rateKobo ?? null,
            rateSource: rate?.source ?? "none",
            stopSell: rate?.stopSell ?? false,
            closedToArrival: rate?.closedToArrival ?? false,
            closedToDeparture: rate?.closedToDeparture ?? false,
            minStay: rate?.minStay ?? null,
          };
        }),
        // The number actually sellable across the WHOLE range: a stay is only
        // bookable if every night of it is. Reporting the best night would
        // show availability that cannot be booked.
        minAvailable: nights.length > 0 ? Math.min(...nights.map(n => n.available)) : 0,
        minSellable: nights.length > 0 ? Math.min(...nights.map(n => n.sellable)) : 0,
      };
    }),
  });
});

const quoteSchema = z.object({
  roomTypeId: z.string().min(1),
  ratePlanId: z.string().optional(),
  checkInDate: z.coerce.date(),
  checkOutDate: z.coerce.date(),
  guests: z.number().int().positive().optional(),
  exemptionTypes: z.array(z.string()).optional(),
});

// POST /availability/quote — per-night breakdown, taxes, total.
router.post("/quote", requireAuth, requirePermission("rates:read", "reservations:create"), (req: AuthedRequest, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  const d = parsed.data;
  if (d.checkOutDate <= d.checkInDate) return res.status(400).json({ error: "INVALID_DATE_RANGE" });

  try {
    const quote = quoteStay({
      branchId: req.auth!.branchId,
      roomTypeId: d.roomTypeId,
      ratePlanId: d.ratePlanId,
      checkIn: d.checkInDate,
      checkOut: d.checkOutDate,
      guests: d.guests,
      exemptionTypes: d.exemptionTypes,
    });

    res.json({
      ...quote,
      // Rendered strings alongside the kobo, same as the tax preview: the
      // person checking a quote against a rate card is reading naira.
      display: {
        subtotal: formatNaira(quote.subtotalKobo),
        tax: formatNaira(quote.taxTotalKobo),
        total: formatNaira(quote.totalKobo),
        perNight: quote.nights.map(n => ({ date: n.stayDate, rate: formatNaira(n.rateKobo) })),
        taxLines: quote.tax.lines.map(l => ({
          code: l.code, name: l.name, amount: formatNaira(l.amountKobo),
        })),
      },
    });
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

export default router;
