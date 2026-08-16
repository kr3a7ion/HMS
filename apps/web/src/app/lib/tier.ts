// UI Adoption F1 — device tiers.
//
// Doc 3 §2.3 calls this "the most important UI decision you have to make",
// and warns that retrofitting responsiveness after 92 screens exist is the
// most expensive mistake available. So: define it now, apply it as we wire.
//
//   T1 Wearable  360-420px  arm-strapped 5" Android, one-handed, gloved
//   T2 Handheld  390-430px  phone -- guest portal, staff self-service
//   T3 Tablet    800-1280px 10" Android -- in-room, supervisor, POS, KDS
//   T4 Desktop   >=1280px   manager, finance, front desk, IT
//
// TWO RULES THAT SHAPE THIS FILE:
//
// 1. **Tier is a LAYOUT decision, not a component fork.** One component,
//    tier-aware primitives. Do not build `HKBoardMobile.tsx`.
//
// 2. **T1 cannot be detected from viewport width.** Read the ranges above:
//    T1 is 360-420 and T2 is 390-430, so they OVERLAP. That is not sloppy
//    spec-writing -- T1 is a device *class* (a field device strapped to a
//    housekeeper's forearm, operated with gloves) and T2 is a phone held in
//    the hand. The same 400px viewport is T1 or T2 depending on which the
//    user is holding, and no media query can tell them apart.
//
//    So T1 is declared by the SHELL, never inferred: the field app mounts
//    <TierProvider tier="T1">. Width-based inference covers T2/T3/T4 only.
//    Getting this wrong would put 56px gloved-use controls on a guest's
//    phone, or 32px controls on a gloved hand.

import { createContext, useContext, useEffect, useState } from "react";

export type Tier = "T1" | "T2" | "T3" | "T4";

/** Lower bound of each width-inferable tier. T1 is excluded by design. */
const T3_MIN = 800;
const T4_MIN = 1280;

/** Width-based inference. Returns T2, T3 or T4 -- never T1 (see note 2). */
export function tierForWidth(width: number): Exclude<Tier, "T1"> {
  if (width >= T4_MIN) return "T4";
  if (width >= T3_MIN) return "T3";
  return "T2";
}

const TierContext = createContext<Tier | null>(null);

/**
 * Mount once per shell. `AppShell` and `PortalShell` leave `tier` undefined
 * and get width inference; `FieldShell` passes "T1" explicitly.
 */
export const TierProvider = TierContext.Provider;

export function useTier(): Tier {
  const forced = useContext(TierContext);
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? T4_MIN : window.innerWidth,
  );

  useEffect(() => {
    if (forced) return;                       // no listener needed when pinned
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [forced]);

  return forced ?? tierForWidth(width);
}

// ─── Tier-derived layout facts ────────────────────────────────────────────
// Read these instead of re-deriving `tier === "T4"` inside every component.
// Each encodes a rule from Doc 3 §2.3 rather than a personal preference.

/**
 * Minimum tap target in px. T1 is 56 because the user may be gloved; below
 * T4 the accessibility floor is 44. A desktop-first control that ships 28px
 * buttons is unusable on a housekeeper's handset.
 */
export function touchTarget(tier: Tier): number {
  if (tier === "T1") return 56;
  return tier === "T4" ? 36 : 44;
}

/**
 * Whether a collection renders as a dense table. **T4 only** -- "single
 * column, no tables" at T1, card lists at T2/T3. <DataView> reads this.
 */
export function prefersTable(tier: Tier): boolean {
  return tier === "T4";
}

/**
 * Hover is not an affordance below T4. Several screens currently use
 * `hover:bg-[#FAFBFD]` as the ONLY row feedback; on touch that is invisible.
 */
export function hasHover(tier: Tier): boolean {
  return tier === "T4";
}

/** Sheets come from the right on desktop, from the bottom on touch. */
export function sheetSide(tier: Tier): "right" | "bottom" {
  return tier === "T4" ? "right" : "bottom";
}

/**
 * Scan-to-identify replaces typing below T3. "Zero free-text where a scan or
 * picker works" -- typing a room number one-handed and gloved is not viable.
 */
export function prefersScan(tier: Tier): boolean {
  return tier === "T1" || tier === "T2";
}
