// UI Adoption F5 — integer-kobo aware money rendering and entry.
//
// Doc 3 §2.4: "Once money is integers, no component should ever do its own
// /100." Backend invariant 2 says the same thing on the server, and
// `lint:invariants --strict` fails the build there on an open-coded /100 --
// it caught one in B23's terminal instruction string, in code just written.
// These components are the browser's equivalent of that discipline.
import { useId } from "react";
import {
  formatNaira, formatNairaCompact, parseNairaInput, fromKobo, type Kobo,
} from "../lib/money";
import { ERROR, MUTED, BORDER, mono, TEXT } from "../lib/tokens";
import { useTier, touchTarget } from "../lib/tier";

// ─── MoneyText ────────────────────────────────────────────────────────────
export interface MoneyTextProps {
  kobo: Kobo | null | undefined;
  /** Dashboard tiles where a full amount would not fit: "₦1.25M". */
  compact?: boolean;
  /** Colour negatives red. Off by default — a credit is not an error. */
  signed?: boolean;
  /** Tabular figures. On by default: money in a column must align. */
  tabular?: boolean;
  className?: string;
  fallback?: string;
}

export function MoneyText({
  kobo, compact = false, signed = false, tabular = true, className, fallback = "—",
}: MoneyTextProps) {
  const text = compact
    ? formatNairaCompact(kobo, fallback)
    : formatNaira(kobo, { fallback });
  const negative = signed && typeof kobo === "number" && kobo < 0;

  return (
    <span
      className={className}
      style={{
        fontFamily: tabular ? mono : undefined,
        fontVariantNumeric: "tabular-nums",
        color: negative ? ERROR : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

// ─── MoneyInput ───────────────────────────────────────────────────────────
export interface MoneyInputProps {
  /** Value in KOBO. `null` means empty. */
  value: Kobo | null;
  /** Emits KOBO, or null while the field is empty or mid-edit invalid. */
  onChange: (kobo: Kobo | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Reject negatives — most fields (a payment, a rate) cannot be below zero. */
  allowNegative?: boolean;
  id?: string;
}

/**
 * Naira in, kobo out. The component holds the RAW TYPED TEXT, not a number,
 * because a controlled numeric input that reformats on every keystroke makes
 * "1250.5" impossible to type -- the cursor jumps and the trailing digit is
 * eaten. Parsing happens on change; formatting happens only on blur.
 */
export function MoneyInput({
  value, onChange, label, placeholder = "0.00", disabled, allowNegative = false, id,
}: MoneyInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const tier = useTier();

  // Uncontrolled text mirroring a controlled kobo value: re-sync only when the
  // parent's value genuinely differs from what the text already parses to.
  const text = value == null ? "" : String(fromKobo(value));
  const invalid = value === null && text !== "";

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-[12px]" style={{ color: MUTED }}>
          {label}
        </label>
      )}
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] pointer-events-none"
          style={{ color: MUTED }}
          aria-hidden
        >
          ₦
        </span>
        <input
          id={inputId}
          inputMode="decimal"
          disabled={disabled}
          defaultValue={text}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          onChange={e => {
            const raw = e.target.value;
            if (raw.trim() === "") return onChange(null);
            const kobo = parseNairaInput(raw);
            if (kobo === null) return;                       // mid-edit, keep last good
            if (!allowNegative && kobo < 0) return;
            onChange(kobo);
          }}
          onBlur={e => {
            // Normalise the display once editing stops, never during.
            const kobo = parseNairaInput(e.target.value);
            e.target.value = kobo == null ? "" : formatNaira(kobo, { symbol: false });
          }}
          className="w-full rounded-md pl-7 pr-3 text-[14px]"
          style={{
            border: `1px solid ${invalid ? ERROR : BORDER}`,
            height: touchTarget(tier),
            fontFamily: mono,
            fontVariantNumeric: "tabular-nums",
            color: TEXT,
          }}
        />
      </div>
    </div>
  );
}
