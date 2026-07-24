# Nexura — Ultimate Product & Design Blueprint (v2)

**Status:** Living design + product brief, written against the real, currently-implemented system (not the aspirational spec). Cross-check with `ROADMAP.md` for build status of any individual item and `src/imports/Nexura_Complete_Master_Blueprint.md` / `Nexura_Auth_and_Distribution_Architecture.md` for the original functional spec this was built from.

**Purpose:** This document is written to be handed to a design tool (Figma AI / Figma Make) to regenerate Nexura's UI. It documents three things together, deliberately: what the product *is* today (architecture, flows, screens), what's *missing* against real competitors, and what the *new visual direction* should be. A design brief written without the first two sections produces a reskin that looks nice and fights the product; this one doesn't.

---

## 1. What Nexura Is

Nexura is an **offline-first hotel management platform** for independent hotels and small regional chains (5–200 rooms), built around one non-negotiable constraint the rest of this document keeps coming back to: **a single branch must be fully operational with zero internet connection.** Reservations, check-in/out, housekeeping, POS, billing — all of it runs against a local server on the hotel's own LAN. The cloud only ever handles things that are inherently cross-property: the Platform Owner's org/billing console, an organization's owner checking on branches from their phone, and lightweight KPI sync between branches.

This is the product's real differentiator against every competitor researched for this document (§3) — Cloudbeds, Mews, OPERA, StayNTouch, RoomRaccoon, apaleo, Little Hotelier are all cloud-dependent; a lost internet connection degrades or stops front-desk operations. Nexura's pitch to an independent hotelier in a market with unreliable connectivity is "your hotel doesn't stop running because your ISP did." **Nothing in the redesign should compromise this** — no screen should assume a live network call succeeds before a staff member can do their job.

---

## 2. System Architecture (as built)

Three independently-deployed pieces:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Platform (cloud, admin.nexura.app)                    │
│  central-server/  — multi-tenant, always-online                  │
│  Users: Platform Owner (1 account) via Admin Console              │
└─────────────────────────────────────────────────────────────────┘
                              │ organizations, branches, billing
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Organization (cloud, portal.nexura.app)                │
│  Same central-server/, different auth context                    │
│  Users: Organization Super Admin, remote — via Org Portal         │
└─────────────────────────────────────────────────────────────────┘
                              │ KPI snapshot push/pull only
                              ▼ (asymmetric, branch-initiated)
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Branch (LAN, nexura.local, one per physical property) │
│  local-server/ — offline-capable, owns all operational data       │
│  Users: all branch staff, incl. Super Admin/Manager when on-site  │
└─────────────────────────────────────────────────────────────────┘
```

No layer shares tokens with another — a token issued by the local server is meaningless to the central server and vice versa. Sync between Layer 3 and Layers 1–2 is a branch-initiated push/pull of KPI snapshots and deployment instructions (force-update, rollback, channel), never live queries — the branch is never *waiting on* the cloud for anything operational.

**Distribution:** each branch runs the local server as a Docker image (backend + SQLite + the compiled frontend served from the same origin), pollable for updates against a private registry, with staged rollout channels (`stable`/`beta`) and a rollback path — all real, verified infrastructure (see `ROADMAP.md` Phase 4).

---

## 3. Competitive Landscape

Researched directly (web, current as of this document): Cloudbeds, Mews, Oracle OPERA Cloud, StayNTouch, RoomRaccoon, apaleo, Little Hotelier.

| Platform | Position | What they do well | What Nexura should take |
|---|---|---|---|
| **Cloudbeds** | Market leader, mid-market | Control-Dashboard-first UX, role-based dashboard views, cash drawer, integrated housekeeping | Dashboard-as-command-center pattern (§9.9) |
| **Mews** | Modern cloud-native | Unified PMS+POS+RMS in one dashboard so staff without hospitality background ramp in days; built-in automations (auto-assign tasks, real-time room status) | Automation-first framing for HK/MX task assignment |
| **Oracle OPERA Cloud** | Enterprise / chains | Deep multi-property, guest CRM with full stay history, 200-country fiscal compliance | Guest profile depth — a real gap (§8) |
| **StayNTouch** | Mobile-first | Staff operate fully from a tablet anywhere on property, not chained to a front desk | Aligns with Nexura's own LAN-tablet housekeeping/maintenance flows — validate, don't need to copy |
| **RoomRaccoon** | Independent/boutique, all-in-one | PMS + channel manager + booking engine + payments in one dashboard, drag-and-drop rate/allotment management | Bundled-simplicity framing for the "small hotel" segment Nexura targets |
| **apaleo** | API-first / developer platform | Every function is an API; open marketplace of best-of-breed apps instead of one vendor doing everything | Validates Nexura's own module-licensing/plugin posture; an OpenAPI spec (already a ROADMAP item) is worth prioritizing |
| **Little Hotelier** | Small property, ease-of-use | Clean single synchronized calendar, near-zero training curve, 96% support satisfaction | Bar to clear on onboarding simplicity |

**Industry-wide 2026 direction** (confirmed across multiple sources): AI-native guest personalization (unified guest profiles aggregating preferences/behavior across stays, auto-flagged to relevant departments on rebooking), dynamic/AI-assisted pricing, conversational AI as a booking-conversion layer, and predictive housekeeping scheduling tied to occupancy forecasts. None of this exists in Nexura today — see §8.

---

## 4. Auth & Identity Flow (as built, real)

Three genuinely separate authentication contexts, matching the three layers in §2. This is real, implemented, and load-bearing for the design — every screen's chrome (login, session-expiry handling, role-switch UI) needs to reflect which of these three a user is in.

### 4.1 Platform Owner (Admin Console)
- Email + password, **then mandatory TOTP MFA — no bypass path exists.** Real RFC 6238 implementation, verified against the official RFC 4226 test vectors.
- First login walks the owner through real enrollment (secret shown as text — no QR renderer exists, every authenticator app supports manual key entry). Later logins go straight to a 6-digit code prompt.
- Password success alone never issues a usable session — it issues a 5-minute-lived "pending" token that can *only* call the MFA endpoints, nothing else. Verified live: this pending token gets a flat 401 from every real admin route.
- 5-failed-attempt lockout (15 min), shared between the password and MFA steps so an attacker can't reset the counter by re-entering a known-correct password.
- Session token: 1 hour.

### 4.2 Organization Super Admin
- **Two separate sessions depending on physical location** — this is a real UX fork the design needs to represent, not paper over:
  - **On-site at a branch:** logs into the local server like any branch staff member (role `ORG`, full local access).
  - **Remote (Org Portal):** separate central-server login, 8-hour session, scoped to cross-branch KPI viewing only — cannot touch operational data directly, by design (the branch owns its own data).

### 4.3 Branch Staff (all operational roles)
- Local-server JWT, 12-hour access token + 30-day refresh token.
- **Offline continuation:** if the access token expires while the branch has no path to re-auth (network down, but the local server itself is obviously still reachable on LAN), a token that's expired **within the last 8 hours** can self-extend for 4 more hours — genuinely offline-safe, no phone-home required. Past 8 hours, forced re-login.
- **Live permission enforcement, not just menu-hiding:** every role's permission set is DB-backed and hashed into the token at login. If a manager edits a role's permissions mid-shift (§5), every active session holding that role is invalidated on its *very next request* — verified live, this actually happens, not just a documented intention.

### 4.4 Login screen states the UI must support
1. Branch staff login (local, LAN-only, simple email/password)
2. Branch staff mid-offline-extension (silent, no user-facing screen — but a subtle "reconnecting" indicator is worth adding, currently absent)
3. Org Portal login (central, remote)
4. Admin Console login — 3 states: credentials → first-time MFA enrollment → returning MFA verification
5. Locked-out state (both admin and branch) with a real countdown, not just an error toast

---

## 5. Role & Permission Model

**12 built-in roles** (Platform Owner, Organization Super Admin, Branch Manager — full access — plus Front Desk, Reservations Staff, Housekeeping, Maintenance, Restaurant Staff, Resident Officer, Customer Service, Finance/Accountant, IT Department).

**This is a real, DB-backed, editable permission matrix — not a fixed enum.** HR-03 "Roles & Permissions" lets a Manager/ORG/IT user:
- View any role's current permissions grouped by module, as toggle rows
- Edit a built-in role's permissions (with live session invalidation as the consequence, §4.3)
- **Create genuinely new custom roles** (e.g. "Night Auditor" with only folio-read + revenue-report access) and assign staff to them — verified end-to-end, including that a custom role's user gains exactly its granted access and nothing else.

**Design implication:** the nav/sidebar is not a fixed role→menu lookup table to hardcode in Figma — it's driven by a permission set that can genuinely differ per hotel, per role, at runtime. Any "here's what the FD sidebar looks like" mockup should be labeled as *one instance* of a dynamic system, not the only possible shape.

---

## 6. Module & Screen Inventory (current, real — 71 screens)

Every module below is wired to a real backend (not mock data) unless flagged. Screens are grouped exactly as the current sidebar groups them.

| Module | Screens | Status |
|---|---|---|
| **Dashboard** | Role-based overview, Management overview | Real |
| **Reservations** | Grid, New Reservation, Group Bookings, Waitlist, Rate Management, Search, Cancellation/Refund | Real |
| **Front Desk** | Check-In, Check-Out, Room Assignment, Guest Profiles (+Detail), In-House Guests, Arrivals, Departures, Folio, Walk-In, Key Card Mgmt, Room Access Mgmt, Key Card Log, PIN Management | Real, incl. real TTLock door-lock integration |
| **Housekeeping** | Board, My Tasks, Schedule, Inspection Log, Lost & Found, Linen & Supplies, DND Log | Real |
| **Maintenance** | Work Orders (+Detail), Asset Register, Preventive Schedule, Vendor Contacts | Real |
| **Restaurant/POS** | POS Terminal, Kitchen Display, Table Management, Menu Management, Room Service, Guest Room Charges, Dining Reservations | Real |
| **Finance & Billing** | Folio Management, Daily Summary, Invoice & Receipts, Accounts Payable, Revenue Reports | Real |
| **Inventory** | Stock Dashboard, Products, Suppliers, Stock Transactions, Purchase Orders | Real |
| **HR & Staff** | Staff Directory (+Profile), **Roles & Permissions**, Attendance, Shift Scheduler, Payroll Summary | Real, incl. full custom-RBAC (§5) |
| **Communications** | Internal Chat, Guest Messaging, Announcements, Shift Handover | Real (chat is polling-based, not push — documented simplification) |
| **IT Admin** | User Management, System Health, Device Management, Backup & Restore, Audit Log | Real, incl. append-only audit trail enforced at the DB level |
| **Reports** | Occupancy, Revenue, Department, Guest Analytics, Inventory, Staff | Real |
| **Multi-Branch** | Branch Overview, Branch Comparison, Central Sync Status | Real (Phase 3, scoped to KPI snapshots) |
| **Settings** | Hotel Config, Sync Settings, Door Lock Settings, My Preferences | Real |
| **Platform** | Admin Console (orgs, branch tracker, billing, **deployment control**, audit log), Org Portal | Real |

---

## 7. Auth/Distribution Docs → Real Implementation, What Changed

Two items the original spec called out as needing to be built later are now real and should inform the design:

- **TOTP MFA** (Auth doc 3.5) — was a documented gap, now real (§4.1). Design needs enrollment + verification screens, not just a login form.
- **Roles & Permissions** (Blueprint 2.5, HR-03) — was explicitly deferred as "a system-wide RBAC rewrite," now real (§5). Design needs the permission-matrix screen to look and feel like a serious, trustworthy security control — this is where a hotelier decides how much to trust the software with staff access.
- **Deployment control** — Docker packaging, staged rollout, force-update/rollback — now real, with a working Admin Console UI. Worth a proper "Deployment" section in the Admin Console redesign, not an afterthought tab.

---

## 8. Feature Gaps (competitor-informed, honestly scoped)

Ranked by how much they'd move the needle, with an explicit call on whether each fits Nexura's offline-first branch model or belongs at the central-server (cloud) layer only.

| Gap | Competitors who have it | Fits at | Why |
|---|---|---|---|
| **True drag-and-drop timeline/gantt reservation grid** (rooms × dates, not a room list) | Every competitor researched — this is the industry-standard front-desk pattern | Branch (local) | Nexura's current Reservation Grid is a room-status *list*, not a timeline. This is the single highest-impact screen redesign — see §9.10. |
| **Channel Manager (OTA sync — Booking.com, Expedia, Airbnb)** | Cloudbeds, Mews, RoomRaccoon, Little Hotelier all bundle this | **Central only, opt-in per organization** | Inherently needs an always-online service layer; already correctly scoped this way in `ROADMAP.md` Phase 5 — don't let it leak into branch-local code. |
| **Direct booking engine** | RoomRaccoon, Little Hotelier, Mews | **Central only, opt-in** | Same reasoning — guest-facing, reads from the central KPI/availability snapshot. Already scoped in ROADMAP Phase 5. |
| **Unified guest CRM (cross-stay preference/history)** | OPERA (deepest), Mews | Branch-primary, **optionally central-aggregated for multi-branch orgs** | Currently guest profiles are real but per-branch and per-stay; no "this guest has stayed 4 times, prefers high floor, allergic to feathers" surfaced automatically at new-reservation time. Real, buildable gap. |
| **AI-assisted dynamic pricing** | Cloudbeds, Mews, OPERA (via RMS) | Branch, with optional central benchmarking | Rate Management exists but is manual. A "suggested rate based on occupancy trend" nudge (not full RMS) is a realistic, scoped first step. |
| **Predictive housekeeping scheduling** | Mews | Branch | HK task assignment is manual today; occupancy-forecast-driven suggested staffing is a real, scoped addition. |
| **Guest self-service / conversational AI** | Nearly all 2026-current competitors | Central (guest-facing) | Contactless check-in, chatbot pre-arrival messaging. Bigger lift — flag as Phase 5+, not this redesign pass. |
| **OpenAPI spec for local-server endpoints** | apaleo built their entire pitch on this | Branch | Already a documented `ROADMAP.md` item (`NEW`, not started) — worth prioritizing given how much apaleo's market position validates it. |

**Deliberately not adopting:** full enterprise multi-property consolidation at OPERA's scale (wrong market — Nexura targets independent/small-chain, not IHG-scale portfolios), or a from-scratch RMS engine (scope far beyond a redesign pass).

---

## 9. UI/Design Direction — The Redesign Brief

### 9.1 The problem, stated plainly

The current UI (`apps/web/src/app/data.tsx` tokens) is a flat navy-and-teal palette (`#123A73` primary, `#1BA39C` accent, standard slate grays) over a fairly generic admin-dashboard shell — usable, but indistinguishable from thousands of other SaaS back-offices, and doesn't read as "premium hospitality software" the way the product itself is positioned. The brief: move toward something that feels **royal, distinctive, and professional** — a hotelier should feel like they bought something premium, not a spreadsheet with rounded corners.

### 9.2 Grounding: what "royal" actually looks like in real luxury hospitality brands

Researched directly rather than guessed:

- **Ritz-Carlton:** deep blue (`#006B95`) + gold (`#B3812A`) + a near-black neutral (`#4F5B65`) — the "royal" association is real but this palette is *still blue-forward*, which doesn't solve the "not blue" ask.
- **Aman / Rosewood tier (ultra-luxury boutique):** near-black onyx (`#0A0A0A`), 24-karat gold (`#C69B3C`), platinum (`#BFC1C2`), ivory (`#F4EADE`) — no blue at all. Reads as serious, expensive, restrained.
- **Four Seasons:** neutral + deep green, clean sans-serif — calm rather than opulent.

### 9.3 The chosen direction: Emerald & Silver

**This is final — not one of several options.** Three other directions were evaluated and rejected; kept here briefly for the record so the decision isn't relitigated:

| Considered | Register | Why not chosen |
|---|---|---|
| Onyx & Gold | Classic warm-regal (Aman/Rosewood) | Gold-on-black is the *expected* luxury move — every ultra-luxury hospitality brand already owns this territory; less distinctive than it first appears |
| Deep Plum & Antique Gold | Bold, unexpected | Strong distinctiveness but plum reads more "beauty/fashion brand" than "hospitality operations tool" on reflection |
| Emerald & Brass | Warm boutique-luxury (Four Seasons-adjacent) | Right hue family, but brass/warm-gold is still the default metallic everyone reaches for |

**Emerald & Silver (platinum)** is the real choice: cool-on-cool, not warm-on-cool. It trades "classic regal" for **modern, quietly confident luxury** — the closest real-world reference is Rolex's green-dial/steel watch family, probably the single most recognizable emerald+silver luxury pairing that exists. Nobody in hotel software reaches for this register; the overwhelming default is gold. That's exactly why it's distinctive.

**Brand foundation** — a full hue *family* per color, not single hex values, because both light and dark mode (§9.4–9.5) need different steps of the same hue:

```
EMERALD (brand primary — sidebar, primary actions, brand marks)
  emerald-950   #0B1F19   darkest — dark-mode sidebar option, deepest shadow-adjacent surface
  emerald-900   #0F332A   primary dark surface (sidebar, both modes)
  emerald-800   #164A3B   secondary dark surface / hover state on emerald-900
  emerald-700   #1D6350   elevated emerald surface, data-viz series
  emerald-600   #257A62   brighter emerald for dark-mode primary CTA fill (needs more luminance to pop on dark bg)
  emerald-500   #2F9179   decorative/chart accent only — never text-on-background at this step

PLATINUM (brand secondary — the "silver," accents, secondary actions, dark-mode surfaces)
  platinum-100  #F1F2F3   near-white — dark-mode primary text, light-mode card-on-card highlight
  platinum-200  #E6E8EA   light-mode elevated surface / subtle highlight
  platinum-300  #C8CDD1   light-mode borders/dividers
  platinum-400  #B8BEC4   THE accent step — icons, secondary buttons, active-state rings, dividers on dark
  platinum-500  #9AA1A8   dark-mode muted text
  platinum-600  #6B7280   light-mode muted text
  platinum-700  #4A5057   dark-mode borders/dividers
  platinum-800  #2C3033   dark-mode card/surface background (elevated above page bg)
  platinum-900  #17191B   dark-mode page background (neutral near-black, deliberately NOT emerald-tinted — see §9.5)

CREAM (warm neutral — light-mode page background only, ties the cool palette to "hospitality warmth")
  cream-50      #FBFAF7   light-mode card background (warm white, not stark #FFFFFF)
  cream-100     #F6F4EE   light-mode page background
  cream-200     #EDE9DF   light-mode section dividers, subtle fills

SEMANTIC (adjusted per mode — see §9.4/9.5, do not reuse one hex for both modes)
  success   light #2F7D5A / dark #4CAF82
  warning   light #B8873A / dark #D9A857
  error     light #9B3B3B / dark #D97070
```

**The one rule that makes this palette work, not wash out:** emerald is the *action* color (primary buttons, active nav, links); platinum/silver is the *structural/accent* color (icons, dividers, secondary buttons, focus rings) — silver is never asked to carry the same "click here" job gold would, because a flat silver CTA underperforms next to the cool neutrals already required for borders and muted text (this was the real risk identified before committing to this direction). Keeping the two roles strictly separate is what keeps the accent legible instead of disappearing into UI chrome.

### 9.4 Light mode — full specification

Light mode is a **hybrid layout**: the emerald sidebar/header stays dark and brand-colored regardless of mode (constant brand presence, and it mirrors the app's existing structural pattern of a colored nav rail), while the content area is warm and light. This is the same pattern Linear, Notion, and Vercel use — colored/dark chrome, light content.

```
Surface/page-bg           cream-100   #F6F4EE
Surface/card-bg           cream-50    #FBFAF7   (cards sit slightly lighter than page — subtle, not stark white)
Surface/sidebar-bg        emerald-900 #0F332A
Surface/sidebar-hover     emerald-800 #164A3B   (hovered/active nav item background)

Text/primary              (near-emerald ink) #12201A   -- NOT generic gray-900; derived from the emerald family so body text ties to the brand instead of looking bolted-on
Text/on-sidebar           platinum-100 #F1F2F3   (nav labels)
Text/on-sidebar-muted     platinum-400 #B8BEC4   (inactive nav icons/secondary labels)
Text/muted                platinum-600 #6B7280

Border/default            cream-200   #EDE9DF
Border/card               platinum-300 #C8CDD1   (slightly more defined than the cream divider, for card outlines)

Accent/primary            emerald-900 #0F332A   (primary button fill, active states, links)
Accent/primary-hover      emerald-800 #164A3B
Accent/secondary          platinum-400 #B8BEC4   (secondary button border/icon color, focus rings)

Semantic/success          #2F7D5A
Semantic/warning          #B8873A
Semantic/error            #9B3B3B
```

**Primary button (light mode):** emerald-900 fill, platinum-100 text, no border. **Secondary/ghost button:** transparent or cream-50 fill, platinum-300 border, emerald-900 text. Silver is never the primary CTA fill in light mode — see the rule in §9.3.

### 9.5 Dark mode — full specification

Not currently implemented in the app at all; specifying it now rather than bolting it on later, since HK/Maintenance/night-audit staff genuinely work night shifts and a Front-Desk lobby is a different lighting environment than a back-office at 2am — this is a real operational need, not a cosmetic extra.

**Key structural decision:** the content-area background in dark mode is a **neutral near-black (platinum-900), not an emerald-tinted black.** This keeps the sidebar reading as a distinct "branded chrome" band against neutral "content," the same separation light mode has (emerald chrome vs. cream content) — if the whole screen went emerald-black, the sidebar would visually merge into the page and the brand color would stop meaning anything.

```
Surface/page-bg           platinum-900 #17191B
Surface/card-bg           platinum-800 #2C3033   (elevation via lightness step, not shadow — box-shadows barely read on dark backgrounds, so "raised" = "lighter," a level up the platinum scale)
Surface/card-hover        (platinum-800 → 700 blend) #383C40
Surface/sidebar-bg        emerald-900 #0F332A   (unchanged from light mode — brand constant)
Surface/sidebar-hover     emerald-800 #164A3B

Text/primary              platinum-100 #F1F2F3
Text/on-sidebar           platinum-100 #F1F2F3   (same as content text — sidebar text doesn't need to change between modes since its background doesn't)
Text/muted                platinum-500 #9AA1A8

Border/default            platinum-700 #4A5057   (low-contrast, intentionally subtle against platinum-800 cards)

Accent/primary            platinum-100 #F1F2F3   (primary button fill — see below, this inverts from light mode)
Accent/primary-text       emerald-900 #0F332A    (dark text on the silver button)
Accent/secondary          emerald-600 #257A62    (brighter emerald, used for links/secondary emphasis where it needs to read against dark platinum surfaces)

Semantic/success          #4CAF82   (brightened from light mode's #2F7D5A — flat #2F7D5A fails contrast on a dark surface)
Semantic/warning          #D9A857
Semantic/error            #D97070
```

**Why the primary button inverts (silver fill, not emerald, in dark mode):** this is a deliberate, physically-grounded choice, not an arbitrary swap. Metallics visually "read" as more metallic against dark backgrounds — it's the same reason jewelry and watch photography is almost always shot on black. A platinum-100 button with emerald-900 text against a platinum-800/900 dark surface produces a genuine "polished metal" moment dark mode is uniquely suited to show off; keeping the button emerald-on-emerald in dark mode (matching light mode's fill) would barely register as a distinct interactive element against the emerald sidebar. Every other accent rule from §9.3 still holds — silver still isn't used for *structural* decoration it wasn't already doing, it's specifically promoted to the CTA role only in this one mode, for this one legibility/physical-perception reason.

**Semantic color rule, stated explicitly:** every semantic color needs a brighter, more saturated value for dark mode than its light-mode counterpart, because the same hex that hits 4.5:1 contrast against a warm near-white card fails against a dark platinum card. Never reuse one semantic hex across both modes — this is a common, real mistake worth calling out so it isn't repeated when someone implements this.

### 9.6 Mode switching — implementation notes

- **Where it lives:** the existing Settings → My Preferences screen (ST-04) already persists per-user preferences (language, date format, notification settings) — theme mode is the same shape of setting and belongs there, not as a global/hotel-wide toggle. Different staff on different shifts in the same hotel should be able to choose independently.
- **Default:** respect the OS-level `prefers-color-scheme` on first load ("system"); once a user picks explicitly, remember it. Three states: `system` / `light` / `dark`.
- **Scope:** per-user, not per-branch or per-organization — this is a personal-comfort setting, not a brand-consistency one (the brand stays consistent because the emerald sidebar doesn't change between modes, §9.4–9.5).

### 9.7 Typography

Current system uses system-ui sans + a mono for data/codes (reasonable, keep the mono for tabular/reference data — room numbers, PINs, sync keys, audit timestamps). For the primary typeface, move off default system-ui to something with more character at display sizes: a serif or high-contrast sans for headers (`H1`/`H2`/page titles, e.g. **Fraunces**, **Newsreader**, or **Canela**-adjacent for a genuinely "hospitality" feel) paired with a clean grotesk (**Inter**, already likely available, or **General Sans**) for UI chrome and body text. Serif headers + sans body is the single fastest way to make software feel like a hospitality brand instead of a dev tool, without touching information density.

### 9.8 Card-based structure (the explicit ask)

Grounded in 2026 SaaS dashboard research: the pattern that scales cleanly (Linear/Notion/Stripe-style) is **sidebar (240–280px) + a KPI card strip (4–6 cards) + a flexible CSS-Grid content area** that mixes cards, tables, and charts without needing per-screen custom layout. Concretely, for Nexura:

- **Every module landing screen** gets a top strip of 3–5 stat cards (not the current mix of raw `StatCard` components scattered inconsistently) — occupancy %, revenue today, open issues, etc., using the module's own real data.
- **Cards get real elevation and structure**, not just a border and `rounded-xl` (current pattern): a subtle shadow, consistent 20–24px internal padding, a clear header row (icon + label + optional trend indicator), and a defined content zone. Right now cards are visually flat and slightly ad hoc across screens — this needs a single reusable `<Card>` primitive used everywhere, not per-screen inline styles (current codebase pattern of inline `style={{...}}` on every element should collapse into a real component library for the redesign).
- **Tables live inside cards**, not as bare full-width elements — gives every screen a consistent "container" language.
- Dashboard specifically should adopt the "north-star metric first" pattern from the research: one hero metric (e.g. today's occupancy or revenue) prominent at the top, secondary metrics as a card row below, detail/drill-down on demand — not a wall of 10 equally-weighted numbers.

### 9.9 Dashboard-as-command-center (from Cloudbeds/Mews research)

The role-based dashboard should function as a genuine operational command center per role, not a generic stats page:
- **Front Desk view:** today's arrivals/departures front and center, room-status heat strip, pending folio disputes
- **Housekeeping view:** room status board as the hero element, not buried in a sub-nav
- **Manager/ORG view:** the current cross-department overview, but restructured with the hero-metric pattern above

### 9.10 Reservation Grid — the highest-impact single screen redesign

Every competitor researched uses a **timeline/gantt grid**: rooms as rows, dates as columns, reservation bars spanning the stay length, drag-to-move / drag-to-extend interactions, color-coded by status. Nexura's current Reservation Grid is a room-status list table. Rebuilding this as a true timeline view is the single highest-leverage change in this entire redesign — it's the screen front desk staff live in all day, and it's the screen every competitor has converged on the same pattern for because it's genuinely the right pattern (spatial + temporal booking data needs a spatial + temporal layout).

### 9.11 Door lock / security screens

These already carry real security weight (TOTP enrollment, permission matrix, key card log) — give them a visually distinct "secure" treatment in both modes: a subtle ink/emerald-950 header band plus a small lock/shield glyph in the page header, so staff instinctively recognize "this screen matters more" without reading copy. In dark mode this naturally intensifies (the header band is already close to the page background's darkness), which is a nice, free reinforcement of "this is a serious screen" rather than something to correct for.

### 9.12 Component states & interaction patterns

Specified once here, generically, rather than repeated per-screen — every screen in the Figma file should reuse these, not invent new button/input treatments.

**Buttons**
| Variant | Light mode | Dark mode |
|---|---|---|
| Primary — rest | emerald-900 fill, platinum-100 text | platinum-100 fill, emerald-900 text |
| Primary — hover | emerald-800 fill | platinum-200 fill |
| Primary — disabled | platinum-300 fill, platinum-500 text, 60% opacity | platinum-700 fill, platinum-500 text, 60% opacity |
| Secondary/ghost — rest | transparent fill, platinum-300 border, emerald-900 text | transparent fill, platinum-700 border, platinum-100 text |
| Secondary — hover | cream-200 fill | platinum-800 fill |
| Danger | error-color fill, platinum-100 text (both modes use their respective mode's error hex, §9.4/9.5) | — |
| Focus ring (any variant, any mode) | 2px platinum-400 ring, 2px offset | 2px platinum-400 ring, 2px offset — same value, it's the one color already tuned to work on both a light and a dark surface |

**Form inputs:** cream-50/platinum-800 background (light/dark) matching card background, platinum-300/platinum-700 border at rest, emerald-900/platinum-100 border + ring on focus, error-color border on validation failure — never rely on color alone for the error state, always pair with an inline message (existing app pattern, keep it).

**Badges/status pills** (room status, reservation status, work-order status, etc.): background = semantic color at 12–15% opacity over the card background, text = the full-strength semantic color. This is the one place bright, saturated color is *correct* — status pills are meant to be scannable at a glance across a dense table, unlike buttons/text which should stay restrained.

**Table rows:** rest = transparent, hover = cream-200/platinum-800 (light/dark) at low opacity, selected = a thin platinum-400 left border + the hover background. Zebra-striping is not part of this system — the existing card container already provides enough visual grouping; striping would fight the "calm, restrained" brief in §9.8.

**Nav items (sidebar, both modes — sidebar colors don't change between modes, §9.4/9.5):** rest = platinum-400 icon + platinum-100 label at 85% opacity, hover = emerald-800 background + platinum-100 at 100%, active = emerald-800 background + a platinum-400 left-edge indicator bar + platinum-100 text at 100%. The active-state indicator bar is the *only* place platinum is used for pure decoration in the sidebar — deliberately, so it stays meaningful.

**Cards:** rest = the mode's card-bg + card-rest elevation (§10); interactive/drill-down cards (e.g. clickable KPI cards) get a hover state that raises them one elevation step and nudges the border toward platinum-400 — signals "clickable" without needing a separate button-styled affordance bolted onto a card.

### 9.13 Accessibility & contrast validation

Concrete pairs to check against WCAG AA (4.5:1 body text, 3:1 large text/UI components) before this ships to Figma or code — these are the pairings most likely to fail in a cool-toned metallic palette, so check them first, not last:

- Light mode: `Text/primary` (#12201A) on `Surface/card-bg` (#FBFAF7) — high margin, safe.
- Light mode: `platinum-100` nav text on `emerald-900` sidebar — verify; if it reads under 4.5:1, step down to platinum-200 for sidebar text specifically (not for anything else).
- Dark mode: `platinum-500` muted text on `platinum-800` card — the tightest pairing in the whole system, verify explicitly, this is the one most likely to need adjustment during implementation.
- Dark mode: `emerald-600` secondary accent on `platinum-900` page background — verify before using it for any text, not just decorative elements.
- Any semantic color on its mode's card background — confirmed by the brightened dark-mode semantic values in §9.5, but re-verify once real type sizes are set in Figma.

---

## 10. Design Tokens (ready for Figma variables)

Structured as light/dark **mode pairs** within one variable collection — this is literally how Figma's own variables feature models light/dark (one collection, two modes), so this table maps directly to a Figma variables setup with no translation needed.

```
COLOR                        LIGHT               DARK
  Surface/page-bg            #F6F4EE (cream-100) #17191B (platinum-900)
  Surface/card-bg            #FBFAF7 (cream-50)   #2C3033 (platinum-800)
  Surface/card-hover         #F1EEE5             #383C40
  Surface/sidebar-bg         #0F332A (emerald-900) #0F332A (unchanged)
  Surface/sidebar-hover      #164A3B (emerald-800) #164A3B (unchanged)

  Text/primary               #12201A             #F1F2F3 (platinum-100)
  Text/on-sidebar            #F1F2F3             #F1F2F3 (unchanged)
  Text/on-sidebar-muted      #B8BEC4 (platinum-400) #B8BEC4 (unchanged)
  Text/muted                 #6B7280 (platinum-600) #9AA1A8 (platinum-500)

  Border/default             #EDE9DF (cream-200) #4A5057 (platinum-700)
  Border/card                #C8CDD1 (platinum-300) #4A5057 (platinum-700)

  Accent/primary             #0F332A (emerald-900) #F1F2F3 (platinum-100)
  Accent/primary-text        #F1F2F3             #0F332A (emerald-900)
  Accent/primary-hover       #164A3B             #E6E8EA (platinum-200)
  Accent/secondary           #B8BEC4 (platinum-400) #257A62 (emerald-600)

  Semantic/success           #2F7D5A             #4CAF82
  Semantic/warning           #B8873A             #D9A857
  Semantic/error             #9B3B3B             #D97070

  Focus/ring                 #B8BEC4 (platinum-400) #B8BEC4 (unchanged — the one token that's identical in both modes)

TYPE
  Display/H1    → serif/high-character display face, 28–32px
  Display/H2    → same family, 20–22px
  Body/default  → grotesk sans, 14px
  Body/small    → grotesk sans, 12px
  Data/mono     → existing mono stack, unchanged (room #s, PINs, keys, timestamps)

SPACING (8px base grid)
  card-padding      → 20–24px
  card-gap          → 16px
  sidebar-width     → 260px
  content-max-width → fluid, CSS Grid auto-fill for card strips

RADIUS
  card      → 12–16px (softer than current, more "premium" than sharp corners)
  button    → 8–10px
  input     → 8px

ELEVATION
  Light mode: card-rest → subtle 1-layer shadow (not just a border); card-hover → shadow deepens one step, for interactive/drill-down cards
  Dark mode:  card-rest → Surface/card-bg (platinum-800) against Surface/page-bg (platinum-900) — the lightness step *is* the elevation, shadows barely render on dark backgrounds so don't rely on them; card-hover → Surface/card-hover (platinum-700-adjacent), one more lightness step up
```

---

## 11. What NOT to Change

Explicit, so a redesign doesn't accidentally regress real, hard-won correctness:
- Any screen's underlying data flow, permission gating, or offline behavior — this is a visual/structural redesign, not a re-architecture.
- The role-based nav must remain driven by the real permission system (§5), not hardcoded per-role menus baked into static Figma frames.
- Security-critical screens (MFA enrollment, permission matrix, PIN generation) must preserve their real one-time-reveal / no-retrieval behavior — don't "simplify" a PIN screen back into showing a retrievable code, that was a deliberate security fix.
- Door lock, audit log, and deployment-control screens' honesty about unverifiable/simulated state (e.g., "no USB encoder in this environment") should carry through as a design pattern (a clear "not connected" state), not be designed away.
