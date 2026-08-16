// Backend Blueprint B2 / invariant 2 — the browser half of the kobo rule.
//
// The API speaks integer kobo end to end; formatting to naira happens here,
// at render time, and nowhere else. Mirrors apps/local-server/src/lib/
// money.ts deliberately rather than sharing a package: these are two
// independently-deployed npm packages (see ROADMAP.md on the workspace
// split), and a shared-lib build step is not worth adding for ~60 lines.
// The two files must be kept in step -- the server's version is the
// authority, and its test suite is where the arithmetic is proven.
//
// Arithmetic on money in the browser should be rare to nonexistent: totals
// come from the server, which is the side with the ledger. addKobo/subKobo
// exist for display-only aggregation (e.g. summing a table column already
// fetched), not for deriving anything that gets sent back.

export type Kobo = number;

/** Human-readable naira: 123456 -> "₦1,234.56". */
export function formatNaira(
  kobo: Kobo | null | undefined,
  options: { symbol?: boolean; decimals?: boolean; fallback?: string } = {},
): string {
  const { symbol = true, decimals = true, fallback = "—" } = options;
  if (kobo == null || !Number.isFinite(kobo)) return fallback;

  const negative = kobo < 0;
  const abs = Math.abs(Math.round(kobo));
  const whole = Math.floor(abs / 100);
  const remainder = abs % 100;

  const wholeText = whole.toLocaleString("en-NG");
  const body = decimals ? `${wholeText}.${String(remainder).padStart(2, "0")}` : wholeText;
  return `${negative ? "-" : ""}${symbol ? "₦" : ""}${body}`;
}

/**
 * Compact form for dashboard tiles where a full amount would not fit:
 * 1_250_000_00 kobo -> "₦1.25M". Display only -- never round-trip this.
 */
export function formatNairaCompact(kobo: Kobo | null | undefined, fallback = "—"): string {
  if (kobo == null || !Number.isFinite(kobo)) return fallback;
  const naira = Math.round(kobo) / 100;
  const abs = Math.abs(naira);
  const sign = naira < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}₦${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}₦${(abs / 1_000).toFixed(1)}K`;
  return formatNaira(kobo);
}

/** Naira number (e.g. from a number input) to kobo, for sending to the API. */
export function toKobo(naira: number): Kobo {
  if (!Number.isFinite(naira)) throw new Error(`Cannot convert ${String(naira)} to kobo`);
  const scaled = Number((naira * 100).toFixed(4));
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Kobo to a naira number, for pre-filling a numeric input. Display only. */
export function fromKobo(kobo: Kobo): number {
  return kobo / 100;
}

/**
 * Parses a typed amount into kobo. Returns null rather than throwing, so a
 * form can show a validation message while the user is still typing --
 * unlike the server's version, which throws because by then the value is
 * being written to a ledger.
 */
export function parseNairaInput(input: string): Kobo | null {
  if (typeof input !== "string") return null;
  let text = input.trim().replace(/[₦\s]/g, "").replace(/,/g, "");
  if (text === "") return null;

  let sign = 1;
  if (text.startsWith("-")) { sign = -1; text = text.slice(1); }
  else if (text.startsWith("+")) { text = text.slice(1); }

  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[1] === "" && (match[2] ?? "") === "")) return null;
  const [, wholeText, fractionText = ""] = match;
  if (fractionText.length > 2) return null;

  const whole = wholeText === "" ? 0 : Number(wholeText);
  const fraction = fractionText === "" ? 0 : Number(fractionText.padEnd(2, "0"));
  const total = whole * 100 + fraction;
  return Number.isSafeInteger(total) ? sign * total : null;
}

/** Display-only aggregation of amounts already fetched from the API. */
export function addKobo(...values: Array<Kobo | null | undefined>): Kobo {
  return values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

/** Basis points (750) to a percentage number (7.5), for display. */
export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}

/** Percentage (7.5) to basis points (750), for sending to the API. */
export function percentToBasisPoints(percent: number): number {
  const scaled = Number((percent * 100).toFixed(4));
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}
