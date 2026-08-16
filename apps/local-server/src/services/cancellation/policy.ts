// Backend Blueprint B9 — the cancellation-policy engine.
//
// THIS IS THE FUNCTION TWO EARLIER BATCHES HAVE BEEN WAITING FOR. B5's night
// audit and B10's no-show endpoint both record a no-show with
// `penalty_charge_id = NULL` and a note saying the amount "awaits the
// cancellation-policy engine". That was the right call at the time -- charging
// a real guest an invented figure is worse than charging nothing -- but it
// means a property running the software today absorbs every no-show for free.
// This is the engine, and those two paths now post through it.
//
// THE RULE IS A TYPE, NOT AN AMOUNT. Storing "₦45,000 penalty" at booking time
// would freeze a figure the policy says should move: a first-night penalty on
// a stay whose rate was later renegotiated has to follow the rate. So the
// penalty is computed at the moment it is charged, from the stay as it stands.
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cancellationPolicies, reservations } from "../../db/schema.js";
import { mulKobo, mulRate, type Kobo } from "../../lib/money.js";
import { nightsBetween } from "../roomInventory.js";

export const PENALTY_TYPES = ["none", "first_night", "percentage", "fixed", "full_stay"] as const;
export type PenaltyType = typeof PENALTY_TYPES[number];

export type PenaltyTrigger = "cancellation" | "no_show";

export interface PenaltyQuote {
  /** What the guest owes, before tax. Tax is added by the posting path. */
  amountKobo: Kobo;
  penaltyType: PenaltyType;
  /** Why it is this number, in words, for the preview screen and the audit. */
  basis: string;
  policyId: string | null;
  policyName: string | null;
  /** True when the stay is inside the free-cancellation window. */
  withinFreeWindow: boolean;
  freeUntil: Date | null;
  nights: number;
  nightlyRateKobo: Kobo;
}

export function policyForReservation(reservation: typeof reservations.$inferSelect) {
  if (reservation.cancellationPolicyId) {
    const explicit = db.select().from(cancellationPolicies)
      .where(eq(cancellationPolicies.id, reservation.cancellationPolicyId)).get();
    if (explicit) return explicit;
  }
  // Falls back to the branch default rather than to "no penalty": a stay
  // whose policy row was deleted should not become free to cancel.
  return db.select().from(cancellationPolicies)
    .where(eq(cancellationPolicies.branchId, reservation.branchId)).all()
    .filter(p => p.isActive)
    .sort((a, b) => (a.code === "STANDARD" ? -1 : 0) - (b.code === "STANDARD" ? -1 : 0))[0] ?? null;
}

/**
 * Computes what a cancellation or no-show costs, right now.
 *
 * `at` is the moment of cancellation, which is what the free-cancellation
 * window is measured against. It is a parameter rather than `new Date()` so
 * the preview endpoint and the commit path can be given the same instant and
 * cannot disagree -- a preview that says "free" followed by a charge because
 * the clock ticked past the deadline mid-request is exactly the surprise this
 * batch exists to prevent.
 */
export function computePenalty(
  reservation: typeof reservations.$inferSelect,
  trigger: PenaltyTrigger,
  at: Date = new Date(),
): PenaltyQuote {
  const policy = policyForReservation(reservation);
  const nights = Math.max(1, nightsBetween(reservation.checkInDate, reservation.checkOutDate).length);
  const nightlyRateKobo = reservation.rateKobo;

  const base: Omit<PenaltyQuote, "amountKobo" | "penaltyType" | "basis"> = {
    policyId: policy?.id ?? null,
    policyName: policy?.name ?? null,
    withinFreeWindow: false,
    freeUntil: null,
    nights,
    nightlyRateKobo,
  };

  if (!policy) {
    // No policy configured at all. Charging nothing is the only defensible
    // answer -- the alternative is inventing a rule the property never set.
    return { ...base, amountKobo: 0, penaltyType: "none", basis: "No cancellation policy is configured for this branch." };
  }

  const type = (trigger === "no_show" ? policy.noShowPenaltyType : policy.penaltyType) as PenaltyType;
  const valueBp = trigger === "no_show" ? policy.noShowPenaltyValueBp : policy.penaltyValueBp;
  const fixedKobo = trigger === "no_show" ? policy.noShowPenaltyFixedKobo : policy.penaltyFixedKobo;

  // The free window applies to CANCELLATION only. A guest who simply never
  // arrives has not cancelled, and letting the free window excuse that would
  // make the window the cheapest way to hold a room for nothing.
  if (trigger === "cancellation") {
    const freeUntil = new Date(reservation.checkInDate.getTime() - policy.freeCancellationHours * 3_600_000);
    base.freeUntil = freeUntil;
    if (at <= freeUntil) {
      return {
        ...base,
        withinFreeWindow: true,
        amountKobo: 0,
        penaltyType: "none",
        basis: `Cancelled ${policy.freeCancellationHours}h or more before arrival — inside the free-cancellation window.`,
      };
    }
  }

  switch (type) {
    case "none":
      return { ...base, amountKobo: 0, penaltyType: "none", basis: `${policy.name} charges no ${trigger === "no_show" ? "no-show" : "cancellation"} penalty.` };

    case "first_night":
      return {
        ...base, amountKobo: nightlyRateKobo, penaltyType: "first_night",
        basis: `One night at the booked rate.`,
      };

    case "full_stay":
      return {
        ...base, amountKobo: mulKobo(nightlyRateKobo, nights), penaltyType: "full_stay",
        basis: `The full stay — ${nights} night${nights === 1 ? "" : "s"} at the booked rate.`,
      };

    case "percentage": {
      // Percentage of the STAY total, not of one night: "30% penalty" on a
      // week-long booking that charged 30% of a single night would be a
      // rounding error, not a policy.
      const stayTotal = mulKobo(nightlyRateKobo, nights);
      const bp = valueBp ?? 0;
      return {
        ...base, amountKobo: mulRate(stayTotal, bp), penaltyType: "percentage",
        basis: `${bp / 100}% of the ${nights}-night stay total.`,
      };
    }

    case "fixed":
      return {
        ...base, amountKobo: fixedKobo ?? 0, penaltyType: "fixed",
        basis: `A fixed penalty set by ${policy.name}.`,
      };

    default:
      // An unrecognised type is a configuration error, and charging a guess
      // would be worse than charging nothing while it is investigated.
      return {
        ...base, amountKobo: 0, penaltyType: "none",
        basis: `Unrecognised penalty type "${type}" — no penalty charged.`,
      };
  }
}

export function listPolicies(branchId: string) {
  return db.select().from(cancellationPolicies)
    .where(eq(cancellationPolicies.branchId, branchId)).all()
    .sort((a, b) => a.code.localeCompare(b.code));
}
