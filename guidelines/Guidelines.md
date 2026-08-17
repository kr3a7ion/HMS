# Nexura — Engineering & Design Guidelines

Nexura is an offline-first hospitality management platform. Every device at a
property talks to a **local server on the hotel LAN**; that local server syncs
opportunistically to a shared central server. Nothing about the product may
assume the internet is present. Keep that constraint in mind for every
decision below, not just the ones that say so explicitly.

Full product spec: `src/imports/Nexura_Complete_Master_Blueprint.md` and
`src/imports/Nexura_Auth_and_Distribution_Architecture.md`. Those two documents
are the source of truth for screen behavior, roles, and the auth/sync
architecture. This file is the source of truth for *how to write the code*
that implements them. See `ROADMAP.md` at the repo root for current build
sequence and status.

---

## 1. Current state of this repo (read this first)

This codebase is a **click-through UI prototype** — Vite + React + Tailwind +
shadcn/ui, originally generated via Figma Make. Every screen renders from
in-memory mock state in `src/app/data.tsx`; there is no backend, no
persistence, no real auth, and no network calls anywhere in `src/`. Treat the
existing screens as an accurate design spec to build against, not as
production code to extend indefinitely. As real backend work lands (per
`ROADMAP.md`), mock state in a screen should be replaced by real API calls to
the local server, not layered on top of.

## 2. General coding guidelines

- Only use absolute positioning when necessary. Prefer flexbox/grid,
  responsive by default — devices range from front-desk desktops to
  housekeeping tablets.
- Keep files small. `Screens.tsx` is already 3,000+ lines because every
  screen was added to one file — **do not keep adding to it**. New screens go
  in their own file under `src/app/screens/<module>/<ScreenName>.tsx` grouped
  by blueprint module (front-desk, housekeeping, maintenance, etc.).
- Refactor as you go. If you touch a screen that's still using inline hex
  values instead of the token exports in `data.tsx`, fix it while you're
  there.
- No feature flags or backwards-compatibility shims for a prototype with no
  external consumers yet. Change code directly.
- Every list/table/widget needs three states before it's done: **Loading**
  (skeleton), **Empty** (icon + one-line message + CTA), **Offline/Error**
  (amber banner, non-blocking). This is a hard requirement per Blueprint Part
  3.1, not a nice-to-have — offline is the default operating condition for
  this product, not an edge case.

## 3. Architecture guidelines

- **The browser never talks to a third-party API directly** — not TTLock, not
  payment processors, not WhatsApp/SMS. All of that is proxied through the
  local server (Blueprint Part 6.1). If you're adding a screen that needs
  external data, assume a local-server endpoint stands between it and the
  internet.
- **Auth tokens are two separate authorities** — local-server-signed JWTs for
  branch sessions, central-server-signed JWTs for the Platform Admin Console
  and Organization Portal. Never assume a token from one context is valid in
  another (Auth doc Part 1.3, Part 2).
- **Role gating is enforced in three layers**, not just the UI: navigation
  (don't render it), API (reject it), and DB row-level filtering (Auth doc
  9.3). When building the backend, don't rely on the sidebar hiding a menu
  item as the only protection for that screen.
- Anything that requires internet (TTLock issue/revoke, WhatsApp/SMS,
  central sync) must degrade gracefully to a queued/pending state, never a
  blocking error. Model this explicitly in state (`pending_sync`, `failed`,
  `queued`) rather than a boolean `isOnline` check scattered through
  components.

## 4. Design system

Design tokens already live as exports in `src/app/data.tsx` — colors, and the
`mono`/`sans` font stacks. **Import them; do not restate hex values inline.**
If a screen needs a color not yet exported, add it to `data.tsx` rather than
hardcoding it locally.

| Token | Value | Usage |
|---|---|---|
| `PRIMARY` | `#123A73` | Brand color, primary buttons, active accents |
| `NAV_BG` | `#0F2044` | Header bar, sidebar |
| `TEAL` | `#1BA39C` | Secondary actions, links, sync indicators |
| `ORANGE` | `#F57C00` | Occupied status, critical callouts |
| `SUCCESS` | `#2E7D32` | Available status, sync confirmed |
| `WARNING` | `#FFA000` | Cleaning status, pending sync |
| `ERROR` | `#D32F2F` | Maintenance/fault, destructive actions |
| `BORDER` | `#E2E8F0` | Card borders, dividers |
| `TEXT` / `MUTED` / `SUBTLE` | `#0F172A` / `#64748B` / `#94A3B8` | Text hierarchy |

Status-specific color maps (`resStC`, `hkC`, `woC`, `priC` in `data.tsx`)
follow the same pattern — extend these objects for new statuses rather than
writing new `bg`/`text` pairs inline.

- **Typography:** Inter for UI text, JetBrains Mono (`mono` export) for
  anything tabular or identity-bearing — clocks, IDs, invoice numbers, PIN
  codes, money amounts in tables. This distinction is part of the product's
  visual language, not a style preference — keep it consistent.
- **Spacing:** 8px base grid. Card radius 12px standard, 8px for compact
  chips/cells. Minimum interactive target 44px height.
- **Status badges** always use the color-coded conventions in Blueprint Part
  3.3 — never invent a new color for a status that already has a defined one.

## 5. Component & screen conventions

- Every screen component takes `add` (toast dispatcher) and, if it navigates
  elsewhere, `nav`. Follow the existing signature:
  `{ add, nav }: { add: AddToast; nav?: (s: string, label: string) => void }`.
- New screens get added to the `Screen` union type in `data.tsx` first, then
  wired into the `Router` in `App.tsx`, then added to the sidebar config if
  they need direct navigation.
- Role gating for a screen or action should check against the
  `Role` type (`data.tsx`) and mirror the Role-Based Menu Visibility Matrix in
  Blueprint Part 2.5 exactly — don't approximate it.
- Reuse `StatCard`, `Badge`, `EmptyState`, `PageHeader`, `BtnP`/`BtnO`, `Inp`,
  `Sel` from `App.tsx` before building a one-off equivalent.

## 6. Naming & terminology

- Product name is **Nexura**. "HMS" only appears now as a historical/internal
  shorthand inside the blueprint docs — don't introduce new "HMS" branding in
  UI copy, file names, or new docs.
- Use the Blueprint's role codes consistently in code and comments: `PLT`,
  `ORG`, `MGT`, `FD`, `RSV`, `HK`, `MX`, `RT`, `RO`, `CS`, `FIN`, `IT`
  (Blueprint Part 2.4). Don't invent alternate abbreviations.
- Screen references in commit messages / comments should use the Blueprint's
  screen IDs where one exists (e.g. `FD-12`, `HK-04`, `MB-01`) — it's the
  fastest way to cross-reference spec to code.

## 7. Figma ↔ code: direction of authority and the merge protocol

Execution Plan Phase 0.4. This exists because the Figma file and the code have
already diverged once: the navy/teal + Plus Jakarta Sans rebrand happened in
code and was never carried back, so **Figma is the stale one**. Every future
raw export will try to drag the repo back to the old zinc/sky palette and
Inter — along with a re-collapse of the 80-file module structure into four
monoliths, the loss of `SCREEN_ROLE_MAP`, the `ORG` role, real auth, and the
API wiring on 58 screens.

**Direction of authority — decide once, then hold it:**

- **Code is canonical for design tokens.** Colours, type scale, spacing,
  radii, shadows. Figma variables get updated to match `theme.css`; they never
  flow the other way.
- **Figma is canonical for new screen composition only.** New layouts come
  from Figma and get hand-applied to `screens/<module>/` using code tokens.
- **Never run a raw Figma Make export over the repo.** Exports are reference
  material you read, not code you merge.

**Merge protocol for any Figma work:**

1. Export to a scratch directory — never onto a branch.
2. Diff the export's screen components against the corresponding
   `screens/<module>/*.tsx`.
3. Port only *layout and composition* deltas by hand, substituting this
   repo's tokens for the export's.
4. Delete the export.

**Four deltas from the original Figma export were removed deliberately and
stay removed** — each is documented in a code comment at its site:

| Removed | Where | Why it stays removed |
|---|---|---|
| PIN "Reveal" showing a plaintext PIN | `PINManagement.tsx` | Plaintext PINs are never stored; the `74**12` mask is the real model |
| "Approve Leave" in the Attendance header | `AttendanceScreen.tsx` | Leave approval needs its own flow with an approver record |
| "Shift" field on the staff overview | `StaffProfileDetail.tsx` | No shift/assignment model exists yet |
| Dashboard "Export PDF" / "New Reservation" | `DashboardMgmt.tsx` | Decorative in the original — re-add only when export actually works |

Restoring any of these from an export is a regression, not a recovery.

## 8. What not to do

- Don't add a screen or flow that isn't in the Blueprint's screen inventory
  without checking with the user first — the inventory is deliberately
  exhaustive ("no staged, deferred, or MVP framing").
- Don't add online-only requirements to a flow that the Blueprint specifies
  as offline-capable.
- Don't hand-roll a new color, spacing value, or font outside the tokens in
  Section 4.
- Don't grow `Screens.tsx` further — split into per-module files as you touch
  them (Section 2).
