// Backend Blueprint B2 / invariant 2 — money is integer minor units (kobo).
//
// WHY. IEEE-754 doubles cannot represent 0.1, so float money drifts: the
// old folio code carried `Math.round((totalCharges - totalPaid) * 100) / 100`
// specifically to paper over that, and a hotel folio that is a few kobo off
// after fifty postings is an argument with a guest at the front desk. With
// integers the arithmetic is exact and the rounding papering-over is
// deleted, not hidden better.
//
// THE RULE. Every money value in the database, in an API response, and in
// any intermediate calculation is an integer count of kobo (₦1 = 100 kobo).
// Floats appear in exactly two places: at a boundary where something outside
// this system speaks naira (`toKobo`/`fromKobo`), and in presentation
// (`formatNaira`). `mulRate` is the only function that rounds.

/**
 * An integer count of kobo. Declared as a plain `number` alias rather than a
 * branded type so it stays ergonomic across the Drizzle boundary, which
 * hands back plain numbers; the runtime guards below are what actually
 * enforce integrality.
 */
export type Kobo = number;

/** Basis points: 1bp = 0.01%. 7.5% = 750bp. Also an integer. */
export type BasisPoints = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertKobo(value: unknown, label = "value"): asserts value is Kobo {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MoneyError(`${label} must be a finite number, got ${String(value)}`);
  }
  if (!Number.isInteger(value)) {
    // Loud on purpose. A fractional kobo means a float leaked in upstream,
    // and silently rounding here would hide the actual bug.
    throw new MoneyError(`${label} must be an integer number of kobo, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} exceeds the safe integer range: ${value}`);
  }
}

/**
 * Converts naira to kobo at a boundary (an external payload, a legacy float
 * column during migration, an operator-entered number).
 *
 * `naira * 100` alone is wrong: 19.99 * 100 is 1998.9999999999998, and
 * 1.005 * 100 is 100.49999999999999, which rounds to 100 rather than 101.
 * Formatting to a fixed 4dp first collapses that representation error
 * before rounding, so values that are exact in decimal round the way a
 * human expects.
 */
export function toKobo(naira: number): Kobo {
  if (typeof naira !== "number" || !Number.isFinite(naira)) {
    throw new MoneyError(`Cannot convert ${String(naira)} to kobo`);
  }
  const scaled = Number((naira * 100).toFixed(4));
  return roundHalfAwayFromZero(scaled);
}

/**
 * Kobo back to naira. PRESENTATION ONLY -- the result is a float and must
 * never be stored, summed, or sent back as a money value. Its one legitimate
 * non-display use is a boundary where an external system still speaks naira
 * (currently: the sync payload to central, until B20).
 */
export function fromKobo(kobo: Kobo): number {
  assertKobo(kobo, "kobo");
  return kobo / 100;
}

export interface FormatNairaOptions {
  /** Include the ₦ symbol. Default true. */
  symbol?: boolean;
  /** Show decimals. Default true; false renders whole naira only. */
  decimals?: boolean;
}

/** Human-readable naira, e.g. 123456 -> "₦1,234.56". */
export function formatNaira(kobo: Kobo, options: FormatNairaOptions = {}): string {
  assertKobo(kobo, "kobo");
  const { symbol = true, decimals = true } = options;
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const whole = Math.floor(abs / 100);
  const remainder = abs % 100;

  const wholeText = whole.toLocaleString("en-NG");
  const body = decimals ? `${wholeText}.${String(remainder).padStart(2, "0")}` : wholeText;
  return `${negative ? "-" : ""}${symbol ? "₦" : ""}${body}`;
}

/** Exact sum. Throws if any input is not an integer -- see assertKobo. */
export function addKobo(...values: Kobo[]): Kobo {
  let total = 0;
  for (const [i, value] of values.entries()) {
    assertKobo(value, `addKobo argument ${i}`);
    total += value;
  }
  if (!Number.isSafeInteger(total)) throw new MoneyError(`Sum exceeds the safe integer range: ${total}`);
  return total;
}

/** Exact difference. Negative results are legitimate (credits, reversals). */
export function subKobo(a: Kobo, b: Kobo): Kobo {
  assertKobo(a, "subKobo minuend");
  assertKobo(b, "subKobo subtrahend");
  return a - b;
}

/** Exact multiplication by an integer count (e.g. quantity x unit price). */
export function mulKobo(kobo: Kobo, count: number): Kobo {
  assertKobo(kobo, "mulKobo amount");
  if (!Number.isInteger(count)) throw new MoneyError(`mulKobo count must be an integer, got ${count}`);
  const product = kobo * count;
  if (!Number.isSafeInteger(product)) throw new MoneyError(`Product exceeds the safe integer range: ${product}`);
  return product;
}

/**
 * Rounds half away from zero: 7.5 -> 8, -7.5 -> -8.
 *
 * Not Math.round, which rounds half toward +Infinity and therefore maps
 * -7.5 to -7. That asymmetry matters here because B4 posts corrections as
 * negative reversal rows: with Math.round, the tax on a -₦100 reversal would
 * not be the exact negative of the tax on the +₦100 charge, and a folio
 * would fail to return to zero after a full void.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Applies a basis-point rate. THE ONLY PLACE ROUNDING HAPPENS in money
 * arithmetic -- taxes (B6), service charges, percentage discounts and
 * penalties all come through here, so there is exactly one rounding policy
 * to reason about and to point an auditor at.
 *
 * Rounds half away from zero (see above).
 */
export function mulRate(kobo: Kobo, basisPoints: BasisPoints): Kobo {
  assertKobo(kobo, "mulRate amount");
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`mulRate basisPoints must be an integer, got ${basisPoints}`);
  }
  const product = kobo * basisPoints;
  if (!Number.isSafeInteger(product)) {
    throw new MoneyError(`mulRate overflowed the safe integer range: ${kobo} x ${basisPoints}`);
  }
  return roundHalfAwayFromZero(product / 10_000);
}

/**
 * Splits a tax-INCLUSIVE amount into the net base and the tax it contains
 * (Backend Blueprint B6): base = total x 10000 / (10000 + rate_bp).
 *
 * The tax is derived by SUBTRACTION rather than computed independently, and
 * that is the whole point: base + tax then equals the original amount
 * exactly, by construction, for every input. Computing both from the rate
 * and hoping they add up leaves a rounding gap of a kobo on roughly half of
 * all amounts -- on an inclusive ₦10,000 rate at 7.5% the guest would see
 * ₦9,302.33 + ₦697.68 = ₦10,000.01 and be right to query it.
 *
 * Rounds half away from zero, same single policy as mulRate.
 */
export function extractInclusive(totalKobo: Kobo, basisPoints: BasisPoints): { baseKobo: Kobo; taxKobo: Kobo } {
  assertKobo(totalKobo, "extractInclusive amount");
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`extractInclusive basisPoints must be an integer, got ${basisPoints}`);
  }
  if (basisPoints <= -10_000) {
    // A rate of -100% or worse makes the denominator zero or negative, which
    // has no meaning as a tax and would silently return nonsense.
    throw new MoneyError(`extractInclusive basisPoints must be greater than -10000, got ${basisPoints}`);
  }
  const numerator = totalKobo * 10_000;
  if (!Number.isSafeInteger(numerator)) {
    throw new MoneyError(`extractInclusive overflowed the safe integer range: ${totalKobo}`);
  }
  const baseKobo = roundHalfAwayFromZero(numerator / (10_000 + basisPoints));
  return { baseKobo, taxKobo: totalKobo - baseKobo };
}

/**
 * Value of `quantity` units at `unitKobo` each.
 *
 * The second and last sanctioned rounding site, alongside mulRate. It has to
 * exist because stock quantities are genuinely fractional -- 2.5 kg of flour
 * at ₦100.00/kg is a real line -- so unit price x quantity does not always
 * land on a whole kobo. An integer quantity is exact and never rounds; a
 * fractional one rounds half away from zero, same policy as mulRate.
 *
 * Prefer mulKobo when the quantity is known to be an integer (nights,
 * covers, menu-item counts): it throws rather than rounding, so a fractional
 * value arriving where one was not expected is caught instead of absorbed.
 */
export function valueKobo(unitKobo: Kobo, quantity: number): Kobo {
  assertKobo(unitKobo, "valueKobo unit price");
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
    throw new MoneyError(`valueKobo quantity must be a finite number, got ${String(quantity)}`);
  }
  if (Number.isInteger(quantity)) return mulKobo(unitKobo, quantity);
  const product = unitKobo * quantity;
  if (!Number.isSafeInteger(Math.round(product))) {
    throw new MoneyError(`valueKobo overflowed the safe integer range: ${unitKobo} x ${quantity}`);
  }
  // Collapse representation error before rounding, same reasoning as toKobo.
  return roundHalfAwayFromZero(Number(product.toFixed(4)));
}

/**
 * `amount` scaled by the ratio numerator/denominator, rounded half away from
 * zero. Used to work out a tax line's share of a PARTIAL void: reversing
 * ₦30,000 of a ₦50,000 room charge must reverse three fifths of its VAT too,
 * or the guest is left paying tax on money they were refunded.
 *
 * Exact when the ratio is 1 (a full void), which is the case that matters
 * most: the tax line reverses to the kobo, and the folio returns to zero.
 */
export function proportionKobo(amountKobo: Kobo, numerator: number, denominator: number): Kobo {
  assertKobo(amountKobo, "proportionKobo amount");
  if (denominator === 0) throw new MoneyError("proportionKobo denominator must not be zero");
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    throw new MoneyError("proportionKobo ratio must be finite");
  }
  if (numerator === denominator) return amountKobo;
  const product = amountKobo * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new MoneyError(`proportionKobo overflowed the safe integer range: ${amountKobo} x ${numerator}`);
  }
  return roundHalfAwayFromZero(product / denominator);
}

/**
 * Splits an amount into `parts` whole-kobo shares that sum EXACTLY to the
 * input. The remainder is spread one kobo at a time across the leading
 * parts, so splitKobo(10001, 3) is [3334, 3334, 3333], not three 3333s that
 * lose 2 kobo.
 *
 * Needed by split bills and by markup/discount spread, where "the parts must
 * add back up to the whole" is the property that matters more than any
 * individual part being the mathematically ideal share.
 */
export function splitKobo(kobo: Kobo, parts: number): Kobo[] {
  assertKobo(kobo, "splitKobo amount");
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`splitKobo parts must be a positive integer, got ${parts}`);
  }
  const sign = kobo < 0 ? -1 : 1;
  const abs = Math.abs(kobo);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/**
 * Parses operator-typed naira into kobo: "₦1,234.56", "1234.56", " 1 234,56 "
 * are all accepted. Rejects anything that is not a clean amount rather than
 * guessing -- a mistyped rate becomes a wrong charge on a real guest folio.
 *
 * More than two decimal places is an error, not a silent round: "10.005"
 * almost always means a typo or a unit mix-up, and accepting it would make
 * the rounding invisible.
 */
export function parseNairaInput(input: string): Kobo {
  if (typeof input !== "string") throw new MoneyError(`Expected a string, got ${typeof input}`);

  let text = input.trim()
    .replace(/[₦\s]/g, "")
    .replace(/,/g, "");
  if (text === "") throw new MoneyError("Empty amount");

  let sign = 1;
  if (text.startsWith("-")) { sign = -1; text = text.slice(1); }
  else if (text.startsWith("+")) { text = text.slice(1); }

  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) {
    throw new MoneyError(`Not a valid amount: ${JSON.stringify(input)}`);
  }
  const [, wholeText, fractionText = ""] = match;
  if (fractionText.length > 2) {
    throw new MoneyError(`Amounts are precise to 2 decimal places; got ${JSON.stringify(input)}`);
  }

  const whole = wholeText === "" ? 0 : Number(wholeText);
  const fraction = fractionText === "" ? 0 : Number(fractionText.padEnd(2, "0"));
  const total = whole * 100 + fraction;
  if (!Number.isSafeInteger(total)) throw new MoneyError(`Amount too large: ${input}`);
  return sign * total;
}

/** Percentage (e.g. 7.5) to basis points (750). Boundary/config helper. */
export function percentToBasisPoints(percent: number): BasisPoints {
  if (typeof percent !== "number" || !Number.isFinite(percent)) {
    throw new MoneyError(`Cannot convert ${String(percent)} to basis points`);
  }
  return roundHalfAwayFromZero(Number((percent * 100).toFixed(4)));
}

/** Basis points (750) back to a percentage (7.5). Presentation only. */
export function basisPointsToPercent(basisPoints: BasisPoints): number {
  if (!Number.isInteger(basisPoints)) {
    throw new MoneyError(`basisPoints must be an integer, got ${basisPoints}`);
  }
  return basisPoints / 100;
}
