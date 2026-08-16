// UI Adoption F12 — the single source of truth for design tokens.
//
// Until now these lived in TWO places: `data.tsx` (as TS constants used by
// inline styles) and `styles/theme.css` (as CSS custom properties used by
// Tailwind classes). Nothing kept them in step, and the July Figma export
// drifted an entire palette before anyone noticed. Doc 3 §2.2.
//
// The rule from here: **this file is authoritative.** `theme.css` mirrors it
// as CSS variables; `data.tsx` re-exports from here for the screens that
// still import the old names, and those re-exports die as screens are ported.
//
// Values verified against the Figma export at commit aa66a30 (2026-08-16) —
// the rebrand tokens matched on both sides, which is what made this adoption
// affordable at all.

// ─── Brand ────────────────────────────────────────────────────────────────
/** Sidebar / top nav. Deeper than PRIMARY; never used for text on white. */
export const NAVY = "#0F2044";
export const PRIMARY = "#123A73";
export const TEAL = "#1BA39C";
export const ORANGE = "#F57C00";

// ─── Status ───────────────────────────────────────────────────────────────
export const SUCCESS = "#2E7D32";
export const WARNING = "#FFA000";
export const ERROR = "#D32F2F";

// ─── Neutrals ─────────────────────────────────────────────────────────────
export const BORDER = "#E2E8F0";
export const TEXT = "#0F172A";
export const MUTED = "#64748B";
export const SUBTLE = "#94A3B8";
export const SURFACE = "#FFFFFF";
export const CANVAS = "#F8FAFC";

// ─── Type ─────────────────────────────────────────────────────────────────
export const sans = "'Plus Jakarta Sans', system-ui, sans-serif";
/** Tabular data: money, IDs, timestamps, room numbers. */
export const mono = "'JetBrains Mono', monospace";

// ─── Spacing / radius ─────────────────────────────────────────────────────
export const RADIUS = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

// Touch targets are tier-derived, not a single constant — see
// lib/tier.ts `touchTarget()`. T1 needs 56px (gloved use), T4 needs 36px.
