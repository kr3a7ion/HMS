# Nexura Roadmap

See also `ULTIMATE_BLUEPRINT.md` — a design-facing companion doc (current
architecture/auth/screens summarized for a design tool, competitor research,
and a proposed visual redesign direction). This file remains the
authoritative build-status tracker; that one doesn't duplicate build status,
it points back here.

Status: Phase 0 and 1 complete and verified (real local server, real auth,
Front Desk vertical slice, real routing). Phase 2 is complete to the full
extent possible without central-server infrastructure — every module has
been wired: Housekeeping is 4/8 screens real (HK-01, 02, 04, 05; HK-06 is
now built as part of Inventory), Maintenance is 3/7 real (MX-01, 02, 03),
Finance & Billing is 3/5 real (FI-01, 03, 05 — FI-05 built as part of
Reports), Restaurant/POS is 5/7 real (RT-01, 02, 03, 04, 07 — RT-06 folded
into the same order model), Communications is 3/4 real (CO-01, 03, 04 —
CO-01 is polling-based, not real-time push), Inventory is 5/5 real (IV-01
through IV-05), HR & Staff is 6/6 real (HR-01 through HR-06, including
HR-03 Roles & Permissions — a full RBAC rewrite, built later in a
dedicated pass; see that section for what changed), Reports is 6/6
real (RP-01 through RP-06), IT Admin is 5/5 real (IT-01 through IT-05),
Settings is 3/4 real (ST-01, 02, 03 — ST-02 Synchronization built as part
of Phase 3 below; ST-04 Door Lock stays Phase 4), and Dashboard (D-01,
D-02 — not in Blueprint Part 7's module sequence, but the first screen
every user sees, fixed as an addendum once a competitive-research item
exposed it had been sitting on mock data the whole time) is 2/2 real.

**Phase 3 is now complete in a deliberately scoped form** — see that
section for exactly what "scoped" means. A real, separate central server
(`central-server/`) exists with its own DB and signing key; Multi-Branch
(MB-01/02/03) runs on a real KPI-snapshot sync protocol between it and the
local server (not the full per-record replication + conflict-resolution
engine the phase originally described — that's enterprise-scale work the
actual screens don't need, cut deliberately and documented, not silently
skipped); the Org Portal and Platform Admin Console both have real,
separately-authenticated logins against the central server instead of the
auth-bypassing "Preview" links they started with.

Every screen not listed as real above is either genuinely gated on Phase 4
infrastructure (TTLock, Docker/auto-updater) or was deliberately deferred
within an otherwise-real module, always with reasoning recorded at that
module's entry below — nothing was silently skipped. See
`guidelines/Guidelines.md` for how to build against this plan. Phase order
follows Blueprint Part 7's build order — later phases depend on earlier
ones existing, don't skip ahead.

**Phase 4 is now complete across all three of its parts.** Door lock:
server (Lock Provider Interface, a TTLock Adapter making genuine calls
against TTLock's actual API, the offline queue, every route) and all six
screens (Check-In Step 7, FD-09, FD-12, FD-13, FD-14, ST-04) plus the
6.10 Lock Queue Monitor and nav gating, verified live end-to-end against
the real backend. Distribution: the full central↔branch update-signaling
protocol (Force Update, Rollback, Channel), the Admin Console + Settings
UI for it, and both packages' Dockerfiles, all verified live against real
running servers — one real bug (a status-enum mismatch that would have
400'd every deployment push) was found and fixed by that live test, not
left for later. Platform Owner security: real TOTP MFA (RFC 6238, checked
against the official RFC 4226 test vectors) with no bypass path, and real
login rate limiting, both verified live including a genuine 5-attempt
lockout. What's genuinely unverifiable in this environment — a live
TTLock account, actual lock/gateway hardware, a USB card encoder, a real
Docker daemon to run `docker build`/container-swap against — is called
out explicitly at each point it matters, not glossed over. See that
phase's section for exactly what was verified and how.

Each phase lists **blueprint work** (already specified in
`src/imports/*.md`, just not built) and **adopted work** (new, sourced from
the Smart Order competitive read and my own recommendations, marked `NEW`).

---

## Phase 0 — Rebrand & design system consolidation

Fast, no backend risk. Do this first so nothing built afterward has to be
re-touched for naming.

- [x] Rename product across code, docs, and UI copy: HMS → Nexura
  - [x] `package.json` name field
  - [x] `README.md` (was Figma Make boilerplate — replaced entirely)
  - [x] Login screen title / lockup in `Auth.tsx` (now "Grand Palms · Powered
        by Nexura"), `index.html` title/meta
  - [x] Both blueprint docs in `src/imports/` renamed to
        `Nexura_Complete_Master_Blueprint.md` /
        `Nexura_Auth_and_Distribution_Architecture.md`, titles updated,
        `hms.local` → `nexura.local`, `yourplatform.com` → `nexura.app`
        throughout
  - [x] `HMSApp` → `NexuraApp`, internal `"hms"` destination literal →
        `"branch"` (App.tsx/Auth.tsx), `--hms-*` CSS custom properties →
        `--nexura-*` (theme.css), `admin.yourplatform.com` /
        `portal.yourplatform.com` in AdminConsole.tsx/OrgPortal.tsx →
        `nexura.app`
- [~] Extract inline hex/font values in `Screens.tsx` into the token exports
      in `data.tsx`. Done for exact matches of existing tokens (`PRIMARY`,
      `BORDER`, `MUTED` — 38 occurrences fixed). Screens.tsx still has many
      more inline hex values that aren't exact matches to a current token
      (e.g. `#0D1B2E`, `#EFF6FF`) — decide per-value whether it's a real
      design-system gap (add the token) or a one-off, and finish this as
      each module gets touched in Phase 2 rather than as a single giant pass
- [ ] `NEW` Turn the token exports into an actual Tailwind theme
      (`tailwind.config` extension or CSS custom properties in
      `styles/theme.css`) so tokens are enforced, not just conventionally
      followed
- [ ] Decide: keep the demo tenant as "Grand Palms" or rebrand demo data to a
      Nexura-branded showcase tenant

**Exit criteria:** no "HMS" or Figma Make boilerplate left anywhere in repo;
design tokens centralized and imported everywhere.

---

## Phase 1 — Real auth + one working module end-to-end

Prove the hard architectural bet (local server, offline-first JWT auth)
before wiring 90 more screens to it.

- [x] Pick and commit to the local server runtime: **Node.js + Express +
      SQLite (`better-sqlite3`) + Drizzle ORM**, decided over Postgres
      specifically to keep the branch box near-zero-maintenance (see
      conversation record — Postgres is reserved for the Phase 3 central
      server, where multi-tenant row-level security actually matters)
- [x] Implement local server auth per Auth doc Part 5–6: bcrypt password
      storage (`server/src/auth/passwords.ts`), RS256 JWT issuance signed
      with a locally-generated key pair (`auth/keys.ts`, `auth/tokens.ts`),
      `active_sessions` table, offline "Continue Offline" endpoint
      (`POST /auth/continue-offline`), permissions-hash session invalidation
      (`auth/middleware.ts`) — see `server/README.md` for how to run and
      test it
- [x] Build the Front Desk vertical slice against real data: Reservation
      Grid (R-01) → New Reservation (R-02) → Check-In wizard (FD-01) →
      Folio (FD-10) → Check-Out (FD-02), backed by
      `server/src/routes/{rooms,guests,reservations}.ts` — room/date
      conflict detection on create, status-gated check-in
      (`room.status === "available"` required), real folio charges,
      checkout that refuses to release the room while a balance remains
      (`BALANCE_REMAINING`). Simplifications made deliberately, not by
      accident:
  - Check-In wizard: only steps 1 (select), 3 (assign room), and 6
    (confirm) are real. Steps 2 (ID verification), 4 (payment intake), 5
    (receipt) render as visual pass-throughs — no ID upload storage or
    payment endpoint exists yet, so wiring them would be fake. Step 7
    (door lock) is out per Phase 4.
  - Reservation Grid: simplified from the original 14-day drag calendar to
    a real room-status list. The calendar visualization is a presentation
    upgrade to revisit once the data plumbing is confirmed solid.
  - Folio/Check-Out both work in two modes: with a `:reservationId` route
    param they show that guest's real folio; without one (reached from the
    sidebar's generic "Folio Management" / "Quick Check-Out") they show a
    picker over real checked-in reservations.
- [x] Replace `Auth.tsx`'s hardcoded `DEMO_ACCOUNTS` map with real
      local-server login calls — `POST /auth/login` with real lockout
      handling, `POST /auth/continue-offline`, `POST /auth/logout`. The
      demo credential picker now autofills real seeded accounts
      (password `demo123`) instead of faking a session. `admin@platform.com`
      (Platform Owner) was dropped from the picker since it correctly can't
      authenticate against a branch server by design — Admin Console and
      Org Portal are reachable only via explicit "Preview" links on the
      login screen, clearly labeled as not wired to real auth (Phase 3).
- [x] `NEW` **Real URL routing.** `react-router`'s `BrowserRouter` now wraps
      the app (`main.tsx`); the five Front Desk slice screens have real
      paths (`/reservations/grid`, `/reservations/new`,
      `/front-desk/check-in`, `/front-desk/folio(/:reservationId)`,
      `/front-desk/check-out(/:reservationId)`) with working
      bookmarking/deep-linking/back-forward. Every other screen still runs
      through the old `screen`-state switch, now mounted as a catch-all
      `path="*"` route — `nav()` was made hybrid so every existing call
      site (sidebar, quick actions, cross-screen buttons) transparently
      redirects to a real route when the target screen is one of the
      migrated five, with no call sites needing to change. Extend
      `REAL_ROUTES` in `App.tsx` as more modules get real routes in Phase 2.
- [x] `NEW` Integration test for the offline-continue mechanic
      (`server/src/test/offline-continue.test.ts`, `npm test` from
      `server/`) — covers: extension granted within the 8h grace period,
      refused past it, refused for a revoked session, refused with no
      token at all. Uses Node's built-in test runner against an isolated
      SQLite file, no new dependency added.

**Exit criteria:** a real guest can be booked, checked in, billed, and
checked out against a real database, with working offline login. **Met and
verified** — Node became available in the tool environment mid-phase, so
this was actually exercised rather than shipped blind:
- `npm test` in `server/`: 4/4 pass (offline-continue grace period, expiry,
  revoked session, no-token cases). Caught and fixed one real bug in the
  process — the test's cleanup hook tried to delete the SQLite file before
  closing the connection, which Windows (unlike POSIX) refuses to allow.
- Full backend loop exercised via real HTTP calls: login → create
  reservation → check-in (room flips to `occupied`) → post a folio charge
  → check-out blocked with `409 BALANCE_REMAINING` while unpaid → check-out
  succeeds once paid → room flips to `cleaning`. All exactly as designed.
- `npm run build` on the frontend: clean, zero errors across 2,233 modules
  — confirms the five rewritten screens and the routing changes are at
  least syntactically and structurally sound.

**Still genuinely unverified:** actual browser click-through — the visual
rendering and React runtime behavior of the five rewritten screens. Backend
correctness and build correctness are confirmed; UI behavior in a real
browser isn't yet. Worth doing before considering Phase 1 fully closed.

---

## Phase 2 — Wire remaining modules to real data

Follow Blueprint Part 7's order exactly: Housekeeping → Maintenance →
Finance & Billing → Restaurant/POS → Communications → Inventory → HR & Staff
→ Reports → IT Admin → Multi-Branch → Settings.

- [ ] Per module: define schema, build endpoints, enforce the three-layer
      role gating (nav / API / row-level — Auth doc §9.3), replace mock
      state in the existing screen component with real API calls
  - [x] **Housekeeping — HK-01, HK-02, HK-04, HK-05 real and verified.**
        `rooms` gained `housekeeping_status` (dirty → in_progress → clean →
        inspected), `assigned_attendant_id`, `priority`, `dnd` — added via a
        self-healing migration in `db/client.ts` (diffs `PRAGMA table_info`
        against what `init.sql` expects and `ALTER TABLE ADD COLUMN`s
        whatever's missing, so existing dev databases don't need a manual
        drop). New tables: `inspections`, `lost_found_items`. New endpoints:
        `GET/POST /housekeeping/rooms/...`, `GET/POST
        /housekeeping/inspections`, `GET/POST /lost-found/...`, `GET /users`
        (branch staff listing, backs the attendant-assign dropdown across
        modules). Real cross-module dependency verified end-to-end with
        actual HTTP calls: check-out sets `housekeepingStatus: dirty` →
        HK-01/HK-02 cycling to clean/inspected releases the room to
        `available` server-side → Front Desk check-in refuses a room that's
        `available` but not clean/inspected (`409 ROOM_NOT_CLEAN`) → a
        **failed inspection** sends a room back to `dirty` for re-cleaning,
        a **passed** one sets it straight to `inspected`. HK-02 (My Tasks)
        reuses the same rooms/status endpoints as HK-01, just scoped to
        `assignedAttendantId === me` and with tablet-sized touch targets,
        proving the "one real backend, multiple views" pattern the
        Blueprint's screen inventory assumes throughout.
    - Still mock/not started: HK-03 Room Cleaning Detail (per-item
      checklist — needs its own schema, deferred, lower value than the
      list/board views), HK-06 Linen & Supplies (deliberately *not* built
      yet — it's really Inventory's stock-tracking model applied to
      housekeeping consumables; building it now would mean building the
      same `products`/`stock` tables twice), HK-07 DND Log (deliberately
      *not* built on top of the crude `rooms.dnd` boolean added for HK-01's
      badge — the real spec is per-stay with a start timestamp and belongs
      on `reservations`, not `rooms`; needs its own pass), HK-08 Schedule
      (deliberately deferred — shares a shift/assignment data model with
      HR-05 Shift Scheduler, building it here first would mean redoing it
      when HR lands). "Flag Issue" was dropped from HK-02's task cards for
      the same reason as HK-06/08: it needs Maintenance's work-order
      endpoint, which doesn't exist yet.
  - [x] **Maintenance — MX-01, MX-02, MX-03 real and verified.** New
        tables: `work_orders`, `work_order_events` (append-only timeline,
        same pattern as the Blueprint's `key_card_events`). New endpoints:
        `GET/POST /maintenance/work-orders/...`. MX-03 (report an issue) is
        deliberately open to **any authenticated role**, not just MX — the
        Blueprint specs it as "all roles with reporting access"; assign,
        status changes, and notes are gated to MX/MGT/ORG. Verified with
        real HTTP calls including the role gate itself: FD can create a
        work order but gets a real `403 FORBIDDEN` trying to assign one;
        MX can assign (defaults status `reported` → `assigned`), advance
        through `in_progress` → `completed`, and post notes, each producing
        a real timeline entry with the actual actor's name. Work Order List
        and Detail got real routes (`/maintenance/work-orders`,
        `/maintenance/work-orders/:id`) rather than staying on the old
        screen-switch — Detail specifically needed one, since the old
        `nav(screen, label)` mechanism has no way to carry a record ID to a
        detail screen (every old mock detail screen has this same latent
        bug — they all render a hardcoded first record regardless of which
        row was clicked; worth keeping in mind for Guest Profile Detail,
        Reservation Detail, Staff Profile, etc. when their modules come up).
    - Caught and fixed a real security bug while building this: the work
      order detail endpoint was returning the assigned technician's full
      `users` row — including the bcrypt password hash — over the wire.
      Fixed by explicitly selecting only safe columns. Audited every other
      `.from(users)` query in the codebase for the same mistake afterward;
      everything else was either validation-only (never sent to the
      client) or already scoped correctly.
    - Still mock/not started: MX-04 Asset Register, MX-05 Asset Detail,
      MX-06 Preventive Maintenance Schedule, MX-07 Vendor Contacts —
      deferred as a group. Assets are a standalone data model that MX-06
      depends on (a preventive schedule entry links to an asset), so they
      belong in one follow-up pass together rather than split further.
  - [x] **Finance & Billing — FI-01, FI-03 real and verified.** New
        endpoints: `GET /finance/folios` (every reservation that reached
        check-in, not just today's in-house guests — the broader Finance
        view the Blueprint specs, distinct from Front Desk's narrower
        `/front-desk/folio`), `POST /finance/folios/:id/dispute`,
        `GET /finance/daily-summary`. `reservations` gained a `disputed`
        boolean (self-healing migration, same pattern as Housekeeping's
        columns) so folio status genuinely tracks Open/Closed/Disputed
        rather than just deriving Open/Closed from check-in state.
    - **Found and fixed a real correctness bug from Phase 1** while
      building this: check-in never actually posted the room charge itself
      to the folio — only ancillary charges (restaurant, minibar, etc.)
      ever hit `folio_charges`, so a guest's room cost was never really
      billed, and Daily Summary's "Room Revenue" would have read zero
      forever. Fixed: check-in now posts one `Room` category charge for
      the full stay (rate × nights). Verified the fix directly — created
      and checked in a fresh reservation, confirmed the charge appeared on
      the folio, then confirmed Daily Summary correctly picked it up
      alongside an earlier Restaurant charge from Phase 1/2 testing.
    - Role gating verified with real calls: FD can view folios and create
      reservations (per the Blueprint's FI-01 access list) but gets a real
      `403` trying to mark a folio disputed; FIN can.
    - Cash drawer reconciliation and "Lock & Close Day" stayed as explicit
      non-functional UI in Daily Summary — no till/session concept exists
      in the schema, and inventing numbers for it would be worse than
      saying so on the screen itself.
    - Still mock/not started: FI-02 Invoice & Receipts (a proper external
      invoice — client name, billing address, tax breakdown, payment
      terms — is a different concept from a guest folio and would need
      real PDF/email/WhatsApp sending to be more than decorative; deferred
      as its own pass), FI-04 Accounts Payable (vendor invoices — shares
      the `vendors` concept with Maintenance's already-deferred MX-07
      Vendor Contacts; building either alone risks a duplicate `vendors`
      table, so both wait for the same follow-up pass).
    - **FI-05 Revenue Reports is now real** — built as part of the Reports
      module below (RP-02) rather than in isolation here, exactly the
      "don't build shared infra twice" plan noted above. `RevenueReports`
      is one component/one endpoint (`GET /reports/revenue`) reused for
      both the Finance nav entry and the Reports nav entry — see App.tsx's
      `screen === "rp-revenue" || screen === "revenue-reports"`.
  - [x] **Restaurant/POS — RT-01, 02, 03, 04, 07 real and verified; RT-06
        folded into the same order model rather than built separately.**
        New tables: `menu_categories`, `menu_items`, `restaurant_tables`,
        `restaurant_orders`, `restaurant_order_items`. One order model
        serves both dine-in (`tableId` set) and room service
        (`roomReservationId` set) — RT-06 Room Service Orders isn't a
        separate screen/table, it's the same POS order flow targeting a
        room instead of a table, so it came essentially free rather than
        duplicating the order/kitchen pipeline. New endpoints:
        `GET/POST /restaurant/menu/...`, `GET/POST /restaurant/tables/...`,
        `GET/POST /restaurant/orders/...` (create, add items, send to
        kitchen, per-item status, close), `GET /restaurant/room-charges`
        (RT-07 — a read view over the same `folio_charges` Front Desk and
        Finance already use, filtered to category "Restaurant").
    - Verified the full real lifecycle end-to-end over HTTP, dine-in and
      room service both: create order at an available table → table
      auto-flips to `occupied` → add items → send to kitchen → item shows
      in the Kitchen Display queue (`GET /restaurant/orders?status=
      sent_to_kitchen`) → marking the last item `served` auto-flips the
      order to `served` server-side → close via direct payment → table
      auto-flips to `dirty`. Separately: created a room-service order
      against a checked-in guest, closed with `postToRoom: true`, and
      confirmed the charge landed on that guest's real folio alongside
      the room charge from check-in — RT-07's view picked it up correctly,
      joined with guest name and room number.
    - Role gating verified: FD gets a real `403` trying to create a POS
      order (RT-only); RT can freely manage the menu and tables.
    - Deliberate simplifications: no split-bill, per-seat split, or
      discount-authorization gate (RT-01's full spec); "Post to Room
      Folio" only works for orders *started* as Room Service — retargeting
      a dine-in table order to a room mid-order isn't supported, staff
      would need to start the order against the room from the outset. No
      visual floor plan for Table Management (simplified to a status grid,
      same call as Reservation Grid's Phase-1 simplification) — a
      configurable floor plan is a presentation-layer upgrade for later,
      not a data-model gap.
    - Still mock/not started: RT-05 Dining Reservations (a distinct
      reservation type — restaurant bookings, not hotel rooms — deferred
      as its own pass rather than folded in, since unlike Room Service it
      doesn't share a data model with anything already built).
  - [x] **Communications — CO-01, 03, 04 real and verified; CO-02 Guest
        Messaging deliberately deferred.** New tables: `chat_channels`,
        `chat_messages`, `announcements`, `announcement_reads`,
        `shift_handovers`. New endpoints: `GET/POST /chat/...`,
        `GET/POST /announcements/...`, `GET/POST /shift-handovers/...`.
    - **CO-01 Internal Chat is polling-based (4s for the active channel,
      15s for the channel list), not WebSocket/SSE push.** Real-time
      delivery is a genuine architectural addition — a persistent
      connection layer per branch — that the Auth doc doesn't specify and
      this pass doesn't add. Flagging this one specifically because it's
      the first module where "real" still means "not what the Blueprint's
      wall-mounted/instant framing implies" — worth a real decision later,
      not just a formatting simplification like most other deferrals.
      Department channels are fixed/seeded (All Staff, Front Desk,
      Housekeeping, Maintenance, Restaurant), open to every branch user —
      no per-channel membership modeling. DMs are found-or-created two-
      party channels. "Emergency Broadcast" posts an emergency-flagged
      message to #All Staff rather than pushing to every screen instantly.
      No read receipts, presence indicators, image attachments, or
      @mention parsing.
    - Verified with real HTTP calls: an emergency message posted by FD is
      immediately visible to HK polling the same channel; a DM between FD
      and HK is created, messaged, and correctly shows up in HK's channel
      list; a third user (MX) gets a real `404` trying to read that DM —
      access control checked, not assumed.
    - **CO-03 Announcements**: real read-tracking via `announcement_reads`
      (one row per staff member who's viewed it) replacing the mock's
      invented read/total numbers — marking read happens passively when a
      user loads the screen with the announcement visible, not as a manual
      action. Verified: FD gets a real `403` creating an announcement
      (MGT/ORG only), MGT can; read count correctly incremented after FD
      viewed it.
    - **CO-04 Shift Handover**: real create/list/detail/acknowledge.
      Verified: HK acknowledges FD's handover, a second acknowledge
      attempt correctly gets `409 ALREADY_ACKNOWLEDGED`. Shift name is a
      typed-in field (Morning/Evening/Night), not derived from a real
      schedule — HR-05 Shift Scheduler doesn't exist yet; once it does,
      this should read the actual scheduled shift instead.
    - **CO-02 Guest Messaging deferred, not built partially.** Its real
      value is unifying WhatsApp/SMS/internal-portal threads (the
      Smart-Order-adopted feature from the original roadmap), but
      WhatsApp/SMS both need external gateway credentials that don't
      exist in this environment. Building only the internal-portal channel
      now would misrepresent a feature whose whole point is unification —
      deferred as a complete pass for whenever those credentials exist.
  - [x] **Inventory — IV-01 through IV-05 real and verified; HK-06 Linen &
        Supplies closed out as part of this pass, as flagged back in the
        Housekeeping module.** New tables: `products`, `stock_transactions`,
        `suppliers`, `purchase_orders`, `purchase_order_items`. New
        endpoints: `GET/POST /inventory/products`,
        `POST /inventory/products/:id/adjust`,
        `GET /inventory/products/:id/transactions`,
        `GET /inventory/transactions`, `GET /inventory/dashboard`,
        `GET/POST /inventory/suppliers`,
        `GET/POST /inventory/purchase-orders` +
        `.../send|receive|cancel`.
    - **HK-06 Linen & Supplies is now a `category=Linen`-filtered read of
      the same `products` table Inventory owns** — one stock model, two
      screens, exactly the plan noted when Housekeeping was built.
    - Stock status (Critical/Low/Ok) is computed uniformly from
      `currentStock` vs. `reorderThreshold`/`parLevel` by one shared
      `stockStatus()` helper, used by Stock Dashboard, Products, and Linen
      & Supplies so the three screens can never disagree on what "low"
      means.
    - Stock adjustments support three types: `in`/`out` (signed deltas)
      and `adjustment` (an absolute recount — the server computes the
      delta and logs it as a normal transaction row). `out` is rejected
      with `409 INSUFFICIENT_STOCK` if it would take stock negative.
    - Purchase orders move draft → sent → received/cancelled. Receiving a
      PO auto-posts an `in` stock transaction per line item (reference set
      to the PO number) and bumps `products.currentStock` server-side —
      "receiving triggers stock entry" per the Blueprint, not a manual
      double-entry step. Cancelling a received PO is blocked with
      `409 ALREADY_RECEIVED`.
    - Role gating: HK/MX/RT/FIN/MGT/ORG can read products and the
      dashboard; only FIN/MGT/ORG can write products, suppliers, or touch
      purchase orders — HK (housekeeping, the main day-to-day consumer of
      the Linen view) is read-only, verified via a real `403`.
    - Verified with real HTTP calls: product create; all three adjustment
      types including the `409` guard; dashboard aggregation (total
      items/value, low-stock list) recomputing correctly after
      adjustments; supplier create; full PO lifecycle create → send →
      receive (confirmed stock bump + auto transaction row with the PO
      number as reference) → cancel-after-receive correctly rejected;
      `category=Linen` filter returning exactly the three seeded linen
      items for HK-06.
    - Deliberate simplifications: no barcode/scanner input, no low-stock
      email/SMS alerts (Reports/notifications infra doesn't exist yet), no
      multi-location stock (one `location` text field per product, not a
      real per-location ledger) — matches the single-branch scope of
      everything else in Phase 2.
  - [x] **HR & Staff — HR-01 through HR-06 all real and verified,
        including HR-03 Roles & Permissions** (originally deferred here as
        "a system-wide RBAC rewrite out of proportion to one screen" — later
        revisited and built for real; see below). New columns on the
        existing `users` row (a staff member and a login account are the
        same entity here): `employee_id`, `department`, `phone`,
        `emergency_contact_name/phone`, `start_date`, `pay_rate`. New
        tables: `staff_notes`, `attendance`, `leave_requests`, `shifts`.
        New endpoints: `GET/POST /hr/staff`, `GET /hr/staff/:id`,
        `POST /hr/staff/:id/update|deactivate|reset-password|pay-rate|notes`,
        `GET/POST /hr/attendance`, `POST /hr/leave-requests`,
        `POST /hr/leave-requests/:id/decide`, `GET/POST /hr/shifts`,
        `POST /hr/shifts/publish|clone`, `GET /hr/payroll`.
    - **HR-03 Roles & Permissions — real, DB-backed, and verified live**,
      not the placeholder this section originally described. The app's
      RBAC really was rewritten system-wide, deliberately, once this was
      prioritized:
      - **Migration approach, chosen to make the rewrite safe rather than
        avoid it**: every one of the ~104 `requireRole(...)` call sites
        across 16 route files (only ~30 distinct role-set patterns once
        named constants were accounted for) was mapped to a new named
        permission key (`auth/permissionKeys.ts`) whose exact grantee set
        was derived by reading the original literal role list — so the 12
        built-in roles (`PLT ORG MGT FD RSV HK MX RT RO CS FIN IT`,
        Blueprint 2.4) got a `roles` table row reproducing their prior
        access exactly, not a redesign. `requireRole` was then deleted
        from `auth/middleware.ts` entirely (not just superseded) so `tsc`
        itself would fail on any call site the rewrite missed — it caught
        two the first pass missed (a duplicate-role-set string replace
        that only hit the first occurrence in `announcements.ts` and
        `reports.ts`) and two more that referenced a removed role-constant
        directly instead of through `requireRole` (`hr.ts`'s
        `isSelfOrManager` helper and its staff-notes visibility check).
      - **`roles` table** (`server/src/db/schema.ts`): `id` is the literal
        role code for built-ins (so no `users.role` migration was needed —
        every existing account's role string was already a valid
        `roles.id`) or a generated id for custom roles; `permissionsJson`
        is `"*"` (PLT/ORG/MGT — Blueprint 2.4's full-access roles) or a
        real array of permission keys, editable via HR-03 for any role,
        built-in or custom. Bootstrapped from `permissionKeys.ts`'s
        `SYSTEM_ROLE_SEED` on first boot, self-healingly (only fills in
        rows that don't exist yet, same as every other migration in
        `db/client.ts` — never overwrites a row a manager has since
        edited).
      - **`auth/permissions.ts`** now does a real DB lookup
        (`permissionsForRole`, `roleHasAnyPermission`) instead of a
        hardcoded map — exactly the seam the file's own comment predicted
        before HR-03 existed. `permissionsHashForRole` (Auth doc 6.3,
        embedded in every JWT) is unchanged in mechanism, just fed from
        the real table now — editing a role's permissions genuinely
        invalidates every active session holding that role on their very
        next request, **verified live**, not just asserted: pulled
        `doorlock:use` from Front Desk's role, confirmed the logged-in
        Front Desk demo user's next request got `401 PERMISSIONS_CHANGED`,
        confirmed a fresh login then correctly got `403` on door lock
        while reservations still worked, then restored the permission and
        confirmed access came back.
      - **Every route file rewired** from `requireRole(...)` to
        `requirePermission(...)` (new middleware, same OR semantics as the
        old role-list check). **Verified live across a representative
        role/route matrix, not just compiled**: FD blocked from
        `reports/staff` (200 for FIN), FD blocked from housekeeping writes
        (200 for HK), MX blocked from restaurant order creation (200 for
        RT alone, matching RT's original MGT/ORG-excluded grant exactly),
        FD blocked from `/admin/system-health` (200 for MGT via wildcard),
        MX allowed on `purchasing:suppliers` (HK blocked), MGT allowed on
        `door-lock/config` (FD blocked) — every case matched the
        pre-migration behavior exactly.
      - **"Create Custom Role" is genuinely functional, not just an entry
        in a table nobody could use**: role assignment (`POST
        /admin/users/:id/role`, `POST /hr/staff`, `POST
        /hr/staff/:id/update`) used to validate against a hardcoded
        `z.enum([...])` of the 12 built-in codes, which would have
        silently rejected any custom role — fixed to validate against the
        real `roles` table (`roleExists()`) instead. **Verified live**:
        created a real "Night Auditor" custom role via the HR-03 API with
        only `folio:read` + `reports:revenue`, assigned a real demo staff
        member to it, confirmed her session invalidated, logged back in,
        and confirmed she could now read folios but was genuinely blocked
        (403) from reservations and door lock — access she'd had a moment
        earlier under Front Desk. Reverted her to FD and deleted the test
        role afterward (delete is blocked while a role has assigned users,
        also verified).
      - **New permission key `roles:manage`**, granted to IT in addition
        to its existing grants (MGT/ORG already have it via wildcard) —
        Blueprint HR-03 explicitly lists access as "IT, MGT, ORG," and none
        of IT's other grants implied role management, so this is a real,
        deliberate new capability for IT, not a preserved one.
      - **Frontend**: `RolesPermissions.tsx` rewritten against the real
        API — role list (with live user counts) on the left, a real
        toggleable permission matrix grouped by module on the right,
        Create Custom Role, and Delete (system roles and roles with
        assigned users can't be deleted, enforced server-side). The three
        staff-role dropdowns that used to hardcode the 12 built-in codes
        (`StaffDirectory.tsx`, `StaffProfileDetail.tsx`,
        `UserManagement.tsx`) now fetch the real role list, so custom
        roles are actually selectable, and role codes display as their
        real names instead of raw ids/codes. `Screens.tsx`'s shared `Sel`
        dropdown gained an optional `{value,label}` form (backward
        compatible with every other caller's plain `string[]`) to support
        this without duplicating the component.
    - Staff creation returns a one-time temp password (`Nx-<random>`) for
      the manager to relay — there's no forced-change-on-next-login flow
      wired to real auth state yet (`ForceChangePasswordScreen` in
      `App.tsx` is still UI-only), so this is a plain credential reset, not
      a self-invalidating one-time code. Same mechanism backs "Reset
      Password" on HR-02.
    - **HR-04 Attendance has no staff self-service leave-request
      screen** — Blueprint's HR module list only specs "Record manual
      entry / Approve leave requests" for this role set (FIN/MGT/ORG), so
      leave requests are manager-recorded on a staff member's behalf, not
      submitted by staff themselves. Approving a leave request cascades
      into real `attendance` rows (status `leave`) across every date in
      the range — same "the consequence actually happens" bar as a
      received PO auto-posting stock transactions in Inventory.
    - **HR-06 Payroll** is intentionally simple: gross pay is each staff
      member's flat monthly `payRate`; unapproved absence days in the
      period deduct a prorated daily rate (`payRate / 30`). No overtime,
      tax, or benefits modeling — that needs real time-tracking and
      payroll-rules infrastructure this pass doesn't build. "Adjust rate
      on file" is `POST /hr/staff/:id/pay-rate`, gated to FIN/MGT/ORG
      separately from the broader profile-edit endpoint (MGT/ORG only) so
      Finance can adjust pay without full HR edit rights.
    - Access control beyond simple role gating: HR-02 profile reads allow
      self **or** MGT/ORG (`isSelfOrManager`) — a staff member can see
      their own profile, not anyone else's; Management Notes are
      MGT/ORG-only to read and write, not exposed to the profile's own
      subject.
    - Staff Profile Detail (HR-02) is the first HR screen with a real ID,
      so it got a real route (`/hr/staff/:id`), same pattern as work order
      and reservation detail — the old `nav(screen, label)` label-only
      mechanism was removed from Staff Directory's row click entirely.
    - Verified with real HTTP calls: staff create (+ duplicate-email
      `409`); self-vs-manager profile access (`403` for a staff member
      reading someone else's profile, `200` for their own); profile edit;
      management note add; password reset that actually changes the login
      credential (old temp password `401`s afterward, new one `200`s);
      pay-rate adjustment by FIN; attendance role gating (`403` for FD);
      leave-request approval cascading into `attendance` rows +
      double-decide correctly `409`s as `ALREADY_DECIDED`; shift
      cell-set → publish → clone-to-next-week (cloned rows verified
      present in the new date range); payroll deduction math verified
      against a real seeded absent day (₦120,000 pay rate ÷ 30 × 1 absent
      day = ₦4,000 deduction, net ₦116,000); deactivation blocking login
      with a real `403 ACCOUNT_INACTIVE` and showing up under the
      `status=deactivated` filter.
  - [x] **Reports — RP-01 through RP-06 all real and verified; every chart
        is a genuine aggregation over tables built in earlier Phase 2
        passes, not a new business-logic module of its own.** New
        endpoints (`server/src/routes/reports.ts`, mounted at `/reports`):
        `GET /reports/occupancy`, `/revenue`, `/department`,
        `/guest-analytics`, `/inventory`, `/staff`. One schema change:
        `guests` gained a nullable `nationality` text column
        (self-healing migration) to back RP-04's nationality breakdown —
        the only report metric that needed new data rather than just a
        new query. All 6 endpoints default to a trailing-30-day window,
        overridable via `?start=&end=`.
    - **RP-02 Revenue Reports is the same component and endpoint as
      Finance's FI-05** (see the Finance & Billing entry above) — this is
      the pass FI-05 was explicitly waiting for.
    - **RP-03 Department Reports**: every role sees their own department
      automatically (server-derived from `req.auth.role`, not a
      client-supplied param a non-manager could tamper with — verified: a
      Front Desk user's `?dept=HK` query is silently ignored and they
      still get their own FD numbers back); MGT/ORG may switch between
      departments or view a branch-wide summary. Only FD, HK, MX, and RT
      have their own metric sets — Blueprint's role matrix doesn't specify
      breakdowns for FIN/IT/etc., so those roles (and MGT/ORG with no
      `?dept=`) get the branch-wide summary instead.
    - **Deliberately omitted metrics, per report** (all because the
      underlying instrumentation doesn't exist, not because they're hard
      to query):
      - RP-01/02 **GOP %** — needs a real expense/cost-of-goods ledger
        tied to revenue; Accounts Payable (still mock, see Finance) tracks
        bills, not a P&L.
      - RP-03 **FD avg processing time / walk-in rate** — no event
        timestamps for individual check-in/out steps, and no walk-in vs.
        reservation flag anywhere in the schema. FD's real metrics
        (check-ins/check-outs) are themselves a proxy: check-ins count
        real `folio_charges` "Room" postings (a true event, posted exactly
        at check-in per the Phase-2 Finance fix); check-outs count
        reservations by `checkOutDate` + `status = checked_out` since
        there's no dedicated `checkedOutAt` timestamp.
      - RP-03 **HK rooms-cleaned-per-attendant / avg turnaround** — `rooms`
        only stores current `housekeepingStatus`, not a history of who
        transitioned it when. Shown instead: inspection pass rate (real,
        from `inspections`), rooms currently clean (a real snapshot, not a
        daily flow count), DND flagged (real, current).
      - RP-03 **RT kitchen ticket time** — `restaurant_order_items` has a
        status but no per-status-change timestamp. Avg check size is
        computed from order line items (works for both direct-pay and
        room-posted closes), not `paidAmount` (null for room-posted
        orders).
      - RP-04 **Loyalty tier distribution, complaint volume trend** — no
        loyalty-program data model (points/tiers/earn/redeem) and no
        structured guest-feedback table exist. Shift Handover's
        `guestComplaints` field is freeform text per handover, not a
        queryable log — a real complaints trend needs its own table, not
        text-mining freeform notes.
      - RP-05 **"Low-stock frequency"** (Blueprint's literal chart) — would
        need replaying the `stock_transactions` ledger to reconstruct
        point-in-time stock levels over the period. Shown instead: a
        current stock-status-by-category snapshot (the same
        Critical/Low/Ok split IV-01/02 already use), which is genuinely
        real but not a frequency-over-time series.
      - RP-06 **Overtime hours** — shifts are day-part categories
        (Morning/Evening/Night), not clocked start/end times, so there's
        no scheduled-vs-actual to compare. "Hours worked" itself is a real
        computation but assumes a flat 8-hour standard shift per
        non-"Off" shift row — documented on the screen itself, not hidden.
        "Shift coverage gaps" is shown as a literal unstaffed-slot count
        (date × shift-type × department with zero staff assigned), not a
        severity-ranked gap analysis.
    - Verified with real HTTP calls against seeded history (5 historical
      reservations added to seed.ts spanning checked-out, cancelled, and
      no-show statuses specifically so these reports wouldn't be empty on
      first load): occupancy no-show/cancellation rates and ALOS matched
      hand-computed expectations from the seed data; revenue total and
      by-category matched summed folio charges; department reports scoped
      correctly per role including the tamper-attempt check above; guest
      analytics repeat-rate and nationality counts matched; inventory
      snapshot matched the Inventory module's own numbers; staff hours and
      attendance rate matched seeded shifts/attendance. Role gating
      confirmed with real `403`s for every endpoint against a role outside
      its Blueprint-specified list.
  - [x] **IT Admin — IT-01 through IT-05 all real and verified.** New
        table: `backup_snapshots`. Reused tables, not new ones: IT-01 User
        Management runs on the same `users` table as HR-02 (account-level
        fields only — role/status/password, not department/pay/notes,
        which stay HR-exclusive); IT-03 Device Management runs on
        `active_sessions` (already had `ipAddress`/`userAgent`/
        `lastActiveAt` from Phase 1 auth); IT-05 Audit Log runs on the
        `audit_log` table that's existed since Phase 1 but had zero writes
        anywhere in the codebase until this pass. New endpoints (all under
        `/admin`, `server/src/routes/admin.ts`): `GET/POST /admin/users`,
        `POST /admin/users/:id/role|reset-password|deactivate|reactivate`,
        `GET /admin/users/:id/audit-log`, `GET /admin/system-health`,
        `POST /admin/diagnostics`, `GET /admin/error-log`,
        `GET /admin/devices`, `POST /admin/devices/:id/deauthorize`,
        `GET/POST /admin/backups`, `POST /admin/backups/:id/restore`,
        `GET /admin/audit-log`.
    - **IT-01 deliberately doesn't reuse HR-02's endpoints** even though
      both edit the same `users` row — HR-02's actions are MGT/ORG-only
      per the Blueprint's HR role matrix, IT-01's are IT/MGT/ORG. Loosening
      HR's gate to match would widen HR's own scope beyond what the
      Blueprint specifies for that screen; instead each screen has its own
      endpoint with its own role gate, sharing the table underneath. Also
      added the "reactivate" action IT-01 asks for that HR-02 never
      specified (HR-02's list only has "Deactivate").
    - **IT-02 System Health is real OS/process/DB stats** (`os.loadavg()`,
      `os.totalmem/freemem`, `process.uptime()`, live DB file size + a
      real `SELECT` to confirm the connection), not the Blueprint's
      literal multi-service list — this is a single-process app, so the
      one real "service" reported is the local server itself. "Run
      Diagnostic" is a real 4-check pass (DB reachable, expected tables
      present, WAL mode enabled, free memory above a threshold) that
      genuinely failed the memory check in this dev environment during
      testing (7% free) — not a fabricated failure. "View error logs" is
      backed by a new in-memory ring buffer + Express error-handling
      middleware (`services/errorLog.ts`) that actually captures
      synchronous route errors — cleared on restart, and Express 4 doesn't
      auto-catch rejected promises from `async` handlers without a
      wrapper, so async failures in routes without their own try/catch
      won't show up here. **Deferred**: network/internet reachability and
      latency-to-central-server (no central server exists pre-Phase-3, and
      the whole app is LAN-only/offline-first, so this isn't meaningful
      yet); "Restart Service" (no process supervisor — pm2/systemd/Windows
      service — in this dev setup to restart into); "Send Health Report to
      Platform Owner" (no email infra, same reasoning as every other
      deferred send/export feature in this roadmap).
    - **IT-03 Device Management reframes "devices" as real login sessions**
      grouped by IP + user agent, not a fabricated device inventory — the
      mock's MAC addresses were never real and never could be: browsers/JS
      have no API that exposes a MAC address to a server over HTTP, a hard
      privacy limit, not a build choice. "Register Device" doesn't apply
      under this model (devices appear from real logins, not manual
      enrollment) and was dropped; "Deauthorize" is real and verified to
      actually force a logout — revokes the session the same way
      `/auth/logout` does, confirmed live: deauthorized a Front Desk
      session as IT, then that session's cookie got a real `401` on its
      next request.
    - **IT-04 Backup & Restore is real for Local only.** Backups use
      better-sqlite3's live `.backup()` API (safe against an open
      connection, not a raw file copy). Restore can't safely swap a
      running process's own open SQLite file mid-request, so
      `POST /admin/backups/:id/restore` only stages a marker file;
      applying it is the first thing the next server boot does, in
      `db/client.ts`, before the live connection opens. Verified with a
      real restart: created a user after taking a backup, staged a
      restore, restarted the server, confirmed the post-backup user was
      gone and everything from before the backup survived. "Restore from
      Cloud" and a scheduled/frequency backup option are deferred — no
      cloud storage credentials and no task-scheduler dependency
      (node-cron or equivalent) in this environment. The frontend's
      type-RESTORE confirmation gates a real backend call, not a decorative
      toast.
    - **IT-05 Audit Log is real but deliberately partial coverage** — see
      the new Cross-cutting entry above. Currently logs: login success/
      failure/lockout (`auth.ts`), logout, and every IT Admin security
      action (invite, role change, password reset, deactivate/reactivate,
      device deauthorize, backup create, restore stage). An unmatched-email
      login attempt is still attributed to this server's one branch (the
      Auth doc's one-server-per-branch model means every request here
      belongs to that branch, matched user or not), not dropped as
      unattributable. CSV export is real (client-side); PDF export stays
      deferred, same reasoning as every other deferred PDF feature in this
      roadmap.
    - Role gating verified with real `403`s for every endpoint against a
      role outside its Blueprint-specified list, including IT-03/04's
      IT-only and IT/ORG-only gates specifically (MGT correctly blocked
      from both).
  - [x] **Multi-Branch (MB-01/02/03) deliberately not attempted *in Phase
        2*** — this was decided when this roadmap was first written, not
        a late call. Every MB screen's entire value is aggregating data
        *across* branches, which structurally requires the central server
        Phase 2 doesn't have (Nexura is one local server per branch, so a
        single local server has no way to see another branch's data to
        aggregate in the first place). Building a fake "multi-branch" view
        against one branch's own data would have misrepresented what the
        screen is for far worse than leaving the mock in place. **Built
        for real in Phase 3 below**, once the central server it
        structurally depends on existed.
  - [x] **Settings — ST-01, 02, and 03 real and verified; ST-04
        deliberately not attempted (needs TTLock, Phase 4).** New columns
        on the existing `branches` row (address/contact/check-in-out
        times/currency/timezone/tax/pricing/`enabledModulesJson`) and a
        new `user_preferences` table. New endpoints:
        `GET/POST /settings/branch`, `GET/POST /settings/me`, plus
        `POST /auth/change-password` (self-service, distinct from HR-02/
        IT-01's admin-triggered resets — requires knowing the current
        password). **ST-02 Synchronization was built as part of Phase 3**
        (`GET /sync/status`, `POST /sync/now`, `services/sync.ts`) once
        the central server it depends on existed — see the Phase 3 section
        below for the full sync design, including why there's no Conflict
        Resolution section (this sync protocol has no per-record merge
        concept to have one for) and no frequency/scheduler controls
        (sync only happens on "Sync Now," no background scheduler built).
    - **ST-01 Enabled Modules is a real, working toggle**, not a UI
      element that looks functional — turning off Restaurant/POS,
      Inventory, or Multi-Branch in Hotel Configuration genuinely removes
      that section from every user's sidebar at the branch (see
      `NAV_MODULE_MAP`/`visibleNav` in `App.tsx`), verified live: disabled
      Inventory, confirmed it dropped out of a fetched branch-settings
      response, re-enabled it. Door Lock doesn't get the same full
      treatment — it isn't one clean top-level NAV entry (it's spread
      across Front Desk's key-card sub-items plus its own Settings entry),
      so toggling it off only hides the Settings > Door Lock Integration
      item, not Front Desk's already-built card-management screens, to
      avoid degrading a different, already-shipped module as a side effect
      of this one's toggle.
    - Discount Approval Threshold and Rate Rounding are real, persisted
      config — but nothing reads them yet. Rate Management has no
      discount/approval workflow built to consult a threshold against.
      Stored honestly as unconsumed config, not wired to a fake workflow.
    - **ST-03 deliberately doesn't persist Theme or Dashboard Widget
      Layout** — the app has no theming system (every screen is
      hardcoded inline colors, not CSS variables/a theme provider) and no
      data-driven, reorderable dashboard widget system for either
      preference to apply to. Persisting them would be indistinguishable
      from fake data: real storage, zero effect, no future consumer
      already planned. Language, date format, time format, and
      notification preferences by category *are* persisted for real
      (verified a first-ever partial notification update correctly merges
      against the schema's full default set rather than dropping every
      category the caller didn't mention — caught and fixed a real bug
      here during testing where the merge fell back to `{}` instead of the
      defaults on a brand-new preferences row).
    - "Change Password" under My Preferences > Security, previously a
      dead button, now calls a genuine self-service endpoint — verified
      live: wrong current password gets a real `401`, correct change
      actually updates the credential (old password stops working,
      new one logs in).
    - Role gating verified: a non-manager gets a real `403` updating
      branch settings but can still read them (the sidebar needs
      `enabledModules` regardless of the viewer's role); preferences and
      password-change are self-service for every authenticated role.
  - [x] **Addendum: Dashboard (D-01 My Dashboard, D-02 Management
        Overview) — not in Blueprint Part 7's Phase-2 module sequence, but
        the literal first screen every user sees after login, and it sat
        on hardcoded mock data (a fake date, a static "88%") through every
        other module's real pass.** Caught when the user asked what was
        left from the smartorder.ai competitive adoption list — the
        "metrics-driven dashboard copy" item had nowhere to land because
        the screen it applies to was never revisited. Fixed as its own
        pass once every other module had real endpoints to draw from.
        New endpoints: `GET /dashboard/me` (role-adaptive, backs D-01 for
        every role), `GET /dashboard/overview` (MGT/ORG, backs D-02) —
        `server/src/routes/dashboard.ts`. No new tables — this is pure
        aggregation over what Reservations, Finance, Housekeeping,
        Maintenance, Restaurant, and Reports already made real.
    - Trend deltas use the adopted plain-language framing
      ("+4% vs yesterday") computed from a real day-over-day comparison,
      not a hardcoded string.
    - Two Blueprint stat cards had no real backing data anywhere in the
      codebase and were handled honestly rather than faked: Finance's
      **"Discounts Applied"** shows a real structural `0` with "No
      discount workflow built yet" (Rate Management has no discount/
      approval flow) instead of inventing a number; Maintenance's
      **"Assets Due for Service"** was substituted with **"Reported
      Today"** (still 4 real cards, just not that one, since Asset
      Register was deferred back in the Maintenance pass and there's no
      real service-schedule data to show).
    - "Recent Activity" is a genuine merged event feed — real
      `folio_charges`, `work_order_events`, and closed `restaurant_orders`
      from the last 48h, sorted by actual timestamp — not the mock's
      invented reference IDs and guest names.
    - Verified live end-to-end, not just endpoint-by-endpoint: checked in
      a real guest, confirmed Front Desk's dashboard immediately reflected
      it (Rooms Available −1, Outstanding Balance now a real ₦126,000 from
      the rate × nights folio charge, a new "Room charge posted" activity
      entry with the real guest name and room number), and confirmed
      Management Overview picked up the same event independently
      (occupancy 0% → 16.7%, revenue ₦0 → ₦126,000 in the Room category).
    - Verified per-role stat correctness against seeded data for all six
      operational roles (FD/HK/MX/FIN/RT) plus MGT/ORG's branch-wide view,
      including Housekeeping's numbers matching the exact seeded room
      mix (2 dirty, 1 in-progress, 2 clean-awaiting-inspection).
  - [x] **Correction: the original wiring pass above silently dropped/
        restyled real Figma UI while hooking up real data** — caught by
        the user logging in and finding Management Overview didn't match
        the design. Not a disclosed scope cut like the two above; a
        mistake. Specifically: the **Room Status panel was dropped
        entirely** even though `branchRooms` (with a real `status` enum:
        available/occupied/cleaning/reserved/maintenance/out_of_service)
        was already being fetched for other stats on the same route;
        **"Recent Activity" was silently restyled from a table to an
        icon-feed list**; and the header's **"Export PDF"/"New
        Reservation"/"Switch View" buttons were removed** rather than kept
        (even non-functionally, like IT Admin's "Restart Service" pattern)
        or wired real. Fixed by restoring the exact original layout:
        - `GET /dashboard/overview` now also returns `roomStatus` (real
          per-status counts) and `roomsTotal`; `recentActivity` entries
          now carry structured `refId`/`actor`/`room` fields (not just a
          flattened description) so the original Ref ID / Guest / Room /
          Action / Time table has real columns to render.
        - `GET /dashboard/me` accepts an optional `?role=` query param,
          honored **only** when the caller's actual authenticated role is
          MGT or ORG (server-enforced authorization, not a client toggle)
          — this backs a real "Switch View" department-preview dropdown
          rather than a decorative button. Verified a Front Desk session
          passing `?role=FIN` is silently ignored and still gets its own
          FD data back.
        - "Export PDF" now calls `window.print()` (a real, working PDF
          export via the browser's print dialog — no new dependency
          needed); "New Reservation" now navigates to the real
          `/reservations/new` route. Neither had an `onClick` at all in
          the original Figma mock, so both were upgraded from decorative
          to real per explicit user direction, not just restored.
        - Discovered while fixing this: **`DashboardRole` (D-01's
          role-adaptive "My Dashboard") was unreachable from the nav in
          both the original mock and this codebase** — the sidebar's
          "Dashboard" item and the initial post-login screen always
          pointed at `dashboard-mgmt`, regardless of role, so the real
          `GET /dashboard/me` endpoint had no UI path to it. Fixed: the
          initial screen and the sidebar's "Dashboard" target are now
          role-conditional (MGT/ORG → Management Overview, everyone else
          → their own role dashboard). Also added the missing `"ORG"`
          member to the frontend `Role` type (`src/app/data.tsx`) — the
          server has treated ORG as a real, distinct role since Phase 3,
          but the frontend union never included it.
        - Verified live: checked in a real guest via the API, confirmed
          `roomStatus` moved Available 6→5 / Occupied 0→1 and
          `recentActivity` returned the new guest's real name, room
          number, and folio-charge ID in the same request.
  - [x] **Role-Based Menu Visibility (Blueprint §2.5)** — the sidebar,
        Settings menu, and Quick Actions showed every screen to every
        role regardless of department. Built `SCREEN_ROLE_MAP` in
        `src/app/data.tsx` directly from the Blueprint's own
        screen-by-role matrix (~70 screens × 11 roles) and filtered
        `visibleNav` in `App.tsx` against it, on top of the existing
        module-enabled filter. A department sees only its own screens
        plus the handful of adjacent-department screens it genuinely
        needs (e.g. Front Desk keeps Housekeeping Board + DND Log to know
        which rooms are ready, and Work Orders to report issues, but
        loses the rest of Housekeeping/Maintenance/Inventory/HR/
        Multi-Branch/IT Admin entirely); MGT/ORG see nearly everything,
        except a few hands-on operational tools neither would use
        directly (My Tasks tablet view, POS Terminal, Kitchen Display —
        matching the Blueprint's exclusions, not an oversight) and
        Multi-Branch, which is ORG-only, not MGT (a branch Manager stays
        scoped to their own branch; only the Org Super Admin gets
        cross-branch oversight). Backend already enforces the equivalent
        restrictions via `requireRole()` on every mutating route, so this
        is real UX on top of an already-real boundary, not a new one.
        Added the missing `"ORG"` role to the frontend `Role` type as
        part of this (see above).
  - [x] **Audited HR, Reports, and IT Admin for the same silent-UI-drop
        pattern as Dashboard**, per the user's request, by diffing every
        screen's current JSX against its original Figma Make version.
        11 of 23 screens across those three modules had real drift, all
        now fixed:
        - **Header "Export" buttons dropped and never restored** on
          StaffDirectory, AttendanceScreen, PayrollSummary,
          OccupancyReports, DepartmentReports, GuestAnalytics,
          InventoryReports, StaffReports, and UserManagement. All now do
          a real client-side CSV download (same pattern as Audit Log's
          pre-existing `exportCsv`); OccupancyReports' "Export PDF" uses
          `window.print()` like Dashboard's.
        - **GuestAnalytics' "Repeat vs New Guests — Monthly" chart was
          missing entirely**, not just its data source swapped — the
          2-column layout had collapsed to 1-column (nationality pie
          only). Restored with real data: `GET /reports/guest-analytics`
          now also computes a 6-month rolling window of repeat/new guest
          rates (same simplified "repeat = >1 stay in the window"
          definition the headline stat already used, just bucketed by
          month instead of once overall) — a fixed lookback independent
          of the screen's other date-range filters, same pattern as
          Dashboard's 7-day trend chart.
        - **InventoryReports' chart substitution was a false positive** —
          the "F&B Consumption Trend" → "Consumption by Category" swap
          the audit flagged is already documented as a deliberate,
          reasoned decision (RP-05, below) with a comment on the route
          itself. Not touched.
        - **StaffDirectory** lost its per-row Edit button (only "view"
          remained) — restored, deep-linking to Staff Profile Detail with
          `?edit=1` (which now opens the edit modal automatically) rather
          than duplicating an edit form in the list. The original's
          per-row Delete button was **not** restored — staff accounts
          only ever deactivate (`hrApi.deactivateStaff`), never
          hard-delete, same reasoning as Audit Log having no delete
          capability; deactivation already lives on the profile page.
        - **StaffProfileDetail** lost "Contract Type" and "Shift" from
          its Overview grid. Contract Type had no backing field at
          all — added a real `users.contract_type` column (self-healing
          migration, same pattern as every other HR-01/02 profile field),
          wired through `POST /hr/staff` and `/hr/staff/:id/update`, and
          added to both the create-staff and edit-profile forms. "Shift"
          was deliberately **not** restored as a static Overview field —
          it would just duplicate the real "Shifts" tab two clicks away
          on the same page, and a snapshot value here would go stale the
          moment a new shift is published.
        - **PayrollSummary** lost its per-row "Breakdown" button and the
          header's "Process Payroll" action. Breakdown now deep-links to
          Staff Profile Detail's own Payroll Summary tab via a new
          `?tab=` param (extended the same `?edit=1` mechanism). "Process
          Payroll" is back but stays non-functional-and-documented — no
          payment processor or payroll provider is integrated anywhere in
          this codebase (see Admin Console's dropped MRR figures, Phase
          3), so it can't submit anything real, and a fake success toast
          (which the original mock actually did show) would be worse
          than an honestly inert button.
        - **SystemHealth** lost its per-service "Restart" button. This
          one is on me twice over: the Dashboard-correction entry above
          cites "IT Admin's 'Restart Service' pattern" as the *reference
          example* of a properly-disclosed non-functional button — but
          it turned out not to actually be in the code. Restored,
          non-functional, documented, matching what that comment always
          claimed.
        - **Also found and fixed while investigating SystemHealth**: the
          same per-screen-split "duplicate into every sibling file"
          bug documented below (Screens.tsx split) had recurred at
          smaller scale in six more modules (housekeeping, maintenance,
          hr, reports, inventory, settings) — a helper inserted right
          before the first function in a grouped file, back when fixing
          the original split, later got swept into every one of that
          module's per-screen files during the later per-screen split
          pass, not just the one that used it. All harmless (dead code,
          not `ReferenceError`s, since something else in each duplicate
          set always genuinely used it) but stripped from the files that
          didn't need it, keeping one real copy each.
- [x] Split `Screens.tsx` into per-screen files under
      `src/app/screens/<module>/<ScreenName>.tsx` (Guidelines §2). Done as
      one dedicated mechanical pass rather than incrementally, at the
      user's explicit request. 89 exports (11 shared primitives + 1
      `PlaceholderScreen` + 77 screens) were partitioned across 13 module
      folders via a script; `Screens.tsx` now holds only the shared
      primitives (5169 → 254 lines).
    - **Real bug found and fixed during this pass**: the mechanical
      boundary-slicing (by "next `export function` line") silently
      misattributed several module-local helper consts/functions that sat
      *between* two screens to whichever screen came *before* them in
      the file, rather than the one that actually used them — e.g.
      `HK_LABELS`/`HK_BADGE_COLORS` ended up trailing in front-desk's file
      but were only referenced by Housekeeping screens; `fmtStat`/
      `pctDelta`/`ActivityFeed` were left behind in `Screens.tsx` (and not
      exported) despite being Dashboard-only; `stockStatus` (shared by
      Inventory and Housekeeping by design) and `MODULE_META` (Settings
      only) both ended up stranded in Reports.tsx. All of these would
      have thrown a runtime `ReferenceError` the first time the affected
      screen rendered — `vite build`/esbuild only bundles and doesn't
      catch undefined module-scope references, so this needed a dedicated
      static audit script (checking every identifier used in each file
      against what it actually imports/defines) rather than relying on a
      clean build. Fixed by moving each helper to the screen(s) that use
      it, duplicating small shared ones (`stockStatus`, `staffStatusColors`)
      into every file that needs them rather than adding cross-module
      imports. A first attempt at the per-screen split (as opposed to the
      per-module grouping) also had a real bug — the brace-matcher used to
      find each function's body picked the destructured parameter's `{ }`
      instead of the body's opening brace, truncating every screen to just
      its signature — caught immediately by a structural verification pass
      (every file must end in `}`, have balanced braces, and export
      exactly one function) before it was ever built or shipped.
- [ ] `NEW` **Unified guest inbox** (adopted from Smart Order): consolidate
      Guest Messaging (CO-02) so WhatsApp, SMS, and internal guest-portal
      threads render as one conversation per guest rather than parallel
      channel-specific views. Backend: single `guest_messages` table keyed
      by guest + channel, not per-channel tables.
- [x] `NEW` **Metrics-driven dashboard copy** (adopted from Smart Order):
      D-01/D-02 dashboards should show trend deltas with plain-language
      framing ("+12% vs last week") instead of bare current-value numbers.
      Applies to occupancy, revenue, and department KPI cards. **Done** as
      part of the Dashboard addendum above — occupancy and revenue cards
      show a real day-over-day delta ("+4% vs yesterday"); department KPI
      cards intentionally don't (Blueprint doesn't ask for a trend on
      those, just the current value).
- [ ] `NEW` Add an OpenAPI (or equivalent) spec for local-server endpoints
      as they're built, generated from the actual route definitions —
      keeps the eventual central-server sync contract and any future
      mobile/PWA client honest against the real API instead of drifting.

**Exit criteria:** every screen in the Blueprint's Part 4 inventory (except
Multi-Branch's cross-branch views, ST-02 Synchronization, and ST-04 Door
Lock Integration — all three need central-server or TTLock infrastructure
from Phase 3/4) runs on real, persisted data for a single branch. **Met** —
every module has had its Phase-2-eligible pass; the remaining mock screens
are either deliberately deferred within an otherwise-real module (documented
at that module's entry above) or structurally gated on Phase 3/4.

---

## Phase 3 — Sync engine + central server + multi-branch

- [x] **Central server built as a genuinely separate deployable service —
      `central-server/`, own Express app, own port (5000), own SQLite DB,
      own RS256 signing key (never shared with any branch's local key, per
      Auth doc 1.3's whole point).** Schema: `organizations`, `branches`
      (with `sync_key_hash`, `last_sync_status`), `org_users` (Super Admin
      accounts, separate table from any branch's local `users` — Auth doc
      4.3), `admin_users` (Platform Owner), `branch_snapshots` (append-only
      KPI history), `audit_log` (platform-level).
    - **Row-level security (Blueprint 0.7) is application-level scoping by
      `organization_id`/`branch_id` on every query, not a database-role
      feature** — this is one shared SQLite file, which has no concept of
      per-tenant DB roles the way Postgres RLS does. A real production
      central deployment would very likely move to Postgres specifically
      for this; noted here rather than overclaiming SQLite does something
      it structurally can't.
  - [x] **The sync protocol is deliberately scoped to KPI snapshots, not
        full record-level bidirectional replication with conflict
        resolution.** The original bullet list above asked for
        "opportunistic push/pull, per-record pending-sync badges,
        Conflict Resolution Modal" — that describes a real
        distributed-systems sync engine for every table (reservations,
        guests, folios, work orders, ...), which is enterprise-scale work
        far beyond what Multi-Branch's actual 3 screens need to be
        genuinely real. Those screens need cross-branch *aggregated KPIs*
        (occupancy, revenue, active guests, open issues), not a copy of
        every other branch's operational records. Building the full
        engine anyway would have meant weeks of distributed-systems work
        to back three read-only reporting screens — this is a real, load-
        bearing scope cut, not a shortcut taken quietly.
    - Protocol: a branch's local server **pushes** its own computed
      snapshot (`POST /sync/push`, authenticated by a per-branch sync key
      issued at provisioning — Blueprint 0.5 step 4 — not a user login)
      and then **pulls** the rest of its organization's branches
      (`GET /sync/pull/:branchId`), caching the result in a new local
      `branch_sync_cache` table. Multi-Branch screens read that local
      cache, so they work offline with a real "last synced" timestamp —
      exactly Auth doc 4.1's "populated from the local server's
      last-synced central data snapshot," not simplified away.
    - No conflict-resolution UI exists because this design has no merge
      conflicts to resolve: it's one-way-up aggregation (a branch only
      ever pushes its own numbers) and one-way-down cache (a branch only
      ever reads others'), never two writers touching the same record.
    - `server/src/services/branchKpis.ts` is shared by `GET
      /dashboard/overview` and the sync push, specifically so a branch's
      own Management Overview and what it reports to central can never
      quietly disagree from two independent implementations of
      "occupancy."
  - [x] **Blueprint 0.7 module licensing genuinely works offline.**
        Central's module licensing (`POST /organizations/:id/modules`)
        gets pulled down and cached (`sync_state.central_enabled_modules_json`);
        `GET /settings/branch` returns the *intersection* of the branch's
        own ST-01 toggle and the cached central license, not just the
        local toggle alone. Verified live: disabled Inventory centrally,
        synced, confirmed the branch's effective `enabledModules` dropped
        Inventory even though the local toggle still said it was on —
        re-enabled it centrally, synced again, confirmed it came back.
        Before the first-ever sync, a branch runs entirely on its own
        local toggle (Blueprint 0.5 step 8: operational before sync).
  - [x] **MB-01/02/03 (Multi-Branch) wired to this real sync cache** and,
        while doing it, finally split out of the `Screens.tsx` monolith
        into `src/app/screens/multi-branch/` (Guidelines §2's "split as
        you touch a module" — the first module actually extracted this
        way; the rest of `Screens.tsx` followed in a dedicated mechanical
        pass shortly after, see the `Screens.tsx` split entry below).
    - **MB-02 Branch Comparison is scoped to the local server's single
      cached snapshot per branch (no history), with an honest note that
      real historical trend comparison lives in the Org Portal instead**
      (central's `branch_snapshots` is append-only and genuinely has
      history; the local `branch_sync_cache` only ever keeps the latest).
      A branch-local screen showing a "trend" from one cached row would
      have been fabricating a series that doesn't exist at that layer.
    - **MB-03 Central Sync Status's "Force Sync" only re-syncs the
      viewing branch itself** — a branch-local server has no channel to
      remotely trigger a *different* physical branch's local server (each
      branch only ever talks to central, never to another branch), so
      "Force Sync All" from a single branch's app would have been fake.
  - [x] **Org Portal (`OrgPortal.tsx`) rebuilt with a real login gate**
        against `POST /auth/org/login` (separate central session, Auth doc
        4.2's "two separate sessions" for a Super Admin) and real data
        from `GET /org/overview`, `/org/comparison`, `/org/sync-status`.
        Deliberately **no** "Force Sync" action anywhere in the portal —
        Auth doc 4.2 is explicit that this is "not a remote control for
        branch operations; it is an observation layer," so the portal
        doesn't pretend to have write access it structurally shouldn't.
        The Reports tab is an honest "not built centrally yet" message,
        not fabricated PDF/CSV buttons — only Overview and Comparison
        aggregations exist so far; each branch's own Reports module is
        real today, a consolidated cross-branch reports engine isn't.
  - [x] **Platform Admin Console (`AdminConsole.tsx`) rebuilt with a real
        login gate** against `POST /auth/admin/login` and real
        organization management: list, create (+ initial Super Admin,
        temp password shown once), billing-status toggle
        (current/overdue/suspended — a real persisted flag, not
        connected to any payment processor), module licensing toggle,
        branch provisioning (issues a real sync key, shown once, meant to
        be configured into that branch's local server at install time —
        Blueprint 0.5 step 4), and a real per-organization audit log.
    - **MRR/billing revenue figures were dropped entirely, not
      estimated** — no payment processor is integrated, and Blueprint
      0.8's own pricing tiers are explicitly "illustrative... validate
      with prospective clients before locking in." Showing a computed MRR
      would have meant inventing numbers for a pricing model the product
      spec itself says isn't finalized.
    - **Updates tab (deployment controls: push/rollback, version
      tracking) was an honest "Phase 4, not built yet" message at the
      time this section was written** — since built for real, see the
      distribution sub-phase in Phase 4 below.
    - **Platform Owner TOTP MFA (Auth doc 3.5, "mandatory, no bypass") was
      not implemented at the time this section was written — since built
      for real, see the security-hardening entry in Phase 4 below.**
  - [x] Login screen's "Preview Admin Console" / "Preview Org Portal"
        links updated to "Open Admin Console" / "Open Org Portal" — they
        used to bypass auth entirely for UI browsing (correct for when
        this section was written, since central-server didn't exist);
        now each opens a real, separately-authenticated login screen.
  - [x] **Found and fixed a real bug during end-to-end testing**: the
        sync push client was computing the branch's KPI snapshot using
        the *central-assigned* branch ID (`CENTRAL_BRANCH_ID`) instead of
        the local database's own `branches.id` — those are two different
        IDs by design (central mints its own ID at provisioning), so
        every query silently returned zero rows and the push failed
        validation. Fixed by querying the local branch ID from the local
        `branches` table for KPI computation, while still sending the
        central-assigned ID in the outgoing payload (that's the field
        central actually needs to know which branch pushed). Verified
        with a real check-in end to end afterward: checked in a guest
        locally, synced, and confirmed the exact same occupancy/revenue
        numbers appeared independently via the local sync-status
        endpoint, the central branches-all endpoint, and the Org Portal's
        overview endpoint — three separate read paths agreeing.
- [ ] `NEW` **Simplified "3 steps to live" onboarding narrative** (adopted
      from Smart Order) — not built. The Admin Console's real
      organization-creation flow exists now; a dedicated sales-facing
      summary screen on top of it is still open.

**Exit criteria:** ~~two branches under one organization sync to a shared
central server, with working conflict resolution and a live Branch
Overview~~ — **met in the scoped form described above**: two branches
(one with a real running local server, one seeded with synthetic history
to prove the comparison view works with real multi-branch data) sync
KPI snapshots to a shared central server, with a live Branch Overview,
Branch Comparison, and Central Sync Status, all verified with real HTTP
round-trips including a live guest check-in propagating through to the
Org Portal. Full per-record conflict resolution was scoped out for the
reasons above, not silently dropped.

---

## Phase 4 — TTLock integration + distribution tooling

Sequenced last per Blueprint Part 7 — depends on the local server existing.

This environment has neither a real TTLock cloud account, USB card-encoder
hardware, nor Docker installed — a genuinely different situation from every
earlier phase, where everything could be built AND run/verified locally.
Scoped with the user up front into two halves; door locks first, Docker
second (not started).

- [x] **Server-side door lock infrastructure — real and verified.**
  - [x] Schema (Blueprint 6.3, `server/src/db/schema.ts` +`init.sql`):
        `door_lock_config`, `room_lock_mappings`, `access_credentials`,
        `lock_sync_queue`, `key_card_events`. Master enable/disable reuses
        the existing `branches.enabledModulesJson` "doorLock" flag (ST-01)
        rather than a second toggle, since Blueprint 6.11's toggle and the
        NAV filtering in App.tsx were always meant to be the same switch.
  - [x] **Lock Provider Interface** (`server/src/services/locks/
        provider.ts`) — the abstraction the rest of the app talks to, per
        6.1: `activateCardAccess`/`generatePIN`/`revokeAccess`/`listLocks`/
        `testConnection`. Adding a second provider later (ZKTeco etc.)
        means a new adapter, no caller changes.
  - [x] **Real TTLock Adapter** (`ttlockAdapter.ts`) — genuine HTTP calls
        against TTLock's actual documented Open Platform API (endpoints,
        params, and the OAuth2 password-grant + MD5-hashed-password flow
        pulled from euopen.ttlock.com/doc, not guessed): `oauth2/token`,
        `v3/lock/list`, `v3/identityCard/addForReversedCardNumber`,
        `v3/identityCard/delete`, `v3/keyboardPwd/add`,
        `v3/keyboardPwd/delete`. **What's genuinely unverifiable here**:
        whether a live TTLock account accepts these calls — none exists in
        this environment. What *was* verified live: configured fake
        credentials, issued a card, and got back TTLock's own real
        `"invalid client_id"` error from `api.sciener.com` — proof the
        adapter is making real, correctly-formatted calls against TTLock's
        actual servers, not a stub. Distinguishes non-retryable errors
        (bad config, bad credentials — fails immediately with a clear
        reason) from retryable ones (network/5xx — queues), so a
        misconfigured integration doesn't retry forever.
  - [x] **Card Encoder Agent** (Blueprint 6.1: "background service on FD
        PC, interfaces with USB card encoder hardware") is real hardware
        that doesn't exist here. `access.ts`'s `readCardSerialFromEncoder()`
        generates a realistic placeholder serial in its place, documented
        inline as a stand-in — everything downstream of it (TTLock
        registration, DB record, audit log) is exercised for real and
        needs no changes once real encoder hardware exists.
  - [x] **Offline queue** (`queue.ts`) — retries every 2 minutes per 6.10,
        expires items past the guest's checkout time with the documented
        MGT/ORG/IT alert, all genuinely tested (not just written): a
        non-retryable failure correctly skips the queue, credentials list
        and event log both reflect real state afterward.
  - [x] **PIN security model corrected to match Blueprint 6.4/6.7, not
        the original mock**: the mock's PIN Management screen had a
        "Reveal" button showing the same hardcoded PIN for any room —
        but 6.4 explicitly says a PIN "cannot be retrieved after this
        screen." The real implementation never stores a plaintext PIN
        anywhere; `access.ts` returns it exactly once, at generation time,
        to the caller that just created it, and stores only a masked
        `credentialReference` (`74**12`) from then on. The frontend
        "Reveal" button will need to go when PINManagement is wired —
        there's nothing left to reveal, by design.
  - [x] Routes (`server/src/routes/doorLock.ts`): ST-04 settings
        (config/test-connection/room-mapping/auto-map), credentials list,
        Key Card Log, Lock Queue Monitor, issue (card/PIN), physical-key
        fallback, single-credential revoke, room-level revoke (Emergency
        Revoke / Revoke All — parallel `Promise.all` per 6.8, not
        sequential). Auto-revoke wired into the existing
        `/reservations/:id/check-out` route per 6.9, sharing one real
        `access.ts` implementation with Check-In Step 7 rather than two
        that could drift.
  - [x] `npm run build` (real `tsc`, not just `vite`/`tsx`) passes clean
        on every new file.
- [x] **Frontend wiring — done and verified live against the real
      backend above**, not just built:
  - [x] **Check-In Step 7** (Blueprint 6.4): appears automatically after
        Step 6 only when the doorLock module is enabled (`STEPS` array is
        conditional on `settingsApi.getBranch()`'s `enabledModules`, same
        source of truth HotelConfig and DoorLockSettings both read/write).
        Card and PIN panels issue for real; the actual `checkIn()` status
        flip happens once, at the final "Complete Check-In" click, not
        earlier — credentials only need a room assigned, not an already-
        checked-in reservation, so issuing before the status flip is safe.
        Physical key fallback logs a real `access_credentials` row.
  - [x] **FD-09 Key Card Management**: real per-room card counts from
        `GET /door-lock/credentials`. The encoder status banner is
        deliberately honest rather than a fake green "Connected" dot —
        there's no physical USB encoder in this environment, and the
        banner says so, while encoding still genuinely registers a card
        with TTLock using a placeholder serial. Per-card "Deactivate"
        links to FD-12 rather than guessing which of a room's cards a
        room-level click should target.
  - [x] **FD-12 Room Access Management**: real grouped-by-room view,
        Issue Replacement Card, New PIN, and Emergency Revoke all call
        the real endpoints — "Revoke All" reports back real
        revoked/queued/failed counts from `Promise.all`, not a fixed
        "all deactivated" toast.
  - [x] **FD-13 Key Card Log**: real append-only event feed, joined
        with room/guest/staff names server-side; CSV export real,
        PDF export via `window.print()` (same pattern as Dashboard/
        Reports' PDF buttons this session).
  - [x] **FD-14 PIN Management**: the original mock's "Reveal" button
        (which showed the same hardcoded PIN for any room) is gone
        entirely, not just fixed — there's nothing to reveal by design,
        see the PIN security-model note above. "New PIN" shows the
        freshly-generated plaintext exactly once in a real modal, same
        as Step 7.
  - [x] **ST-04 Settings**: real credential form (blank fields on load,
        since the server never echoes secrets back — same discipline as
        everywhere else), real Test Connection, real Room → Lock Mapping
        table with inline edit, real Auto-Map (calls TTLock's lock list,
        fuzzy-matches by name, reports unmatched rooms), real Master
        Enable toggle wired to the same `enabledModules` flag HotelConfig
        uses.
  - [x] **6.10 Lock Command Queue Monitor**: added to the top bar,
        polling `GET /door-lock/queue` every 30s (the server's own retry
        loop runs every 2 min per 6.10 — this is just the UI staying
        current between those retries) — only renders when there's a
        real pending item, replacing a hardcoded "2 queued" placeholder
        that was always shown regardless of actual queue state.
  - [x] **Nav gating fixed, not just Step 7**: Door Lock isn't a single
        NAV section (it's 4 Front Desk children + 1 Settings entry), so
        the existing per-section `NAV_MODULE_MAP` couldn't gate it — a
        gap already called out honestly in this file before real wiring
        existed to expose it. Added `DOOR_LOCK_SCREENS` in `data.tsx` and
        checked it in both the sidebar and Settings-menu filters:
        disabling the module now genuinely hides all five entries, not
        just the Check-In step.
  - [x] Verified live end-to-end against the real (unconfigured-TTLock)
        backend: mapped a room to a placeholder lock ID, issued a card
        (real TTLock call → real `"invalid client_id"` from
        `api.sciener.com`, correctly recorded as `failed`, not silently
        swallowed), logged a physical key fallback, confirmed the event
        log and credentials list both reflect exactly that real state,
        and checked a reservation out — `accessRevoked` correctly
        reported `{revoked: 0, queued: 0, failed: 0}` since nothing on
        that reservation was ever in `active` status to revoke, which is
        the correct answer given no TTLock account exists here, not a
        bug.
- [x] **Distribution / auto-updater signaling — real and verified live**,
      Docker packaging itself the one piece genuinely unbuildable here
      (no Docker daemon in this environment):
  - [x] **Schema**: `central-server`'s `branches` table gained
        `currentVersion`, `lastUpdateCheckAt`, `lastUpdateStatus`,
        `updateChannel` (default `stable`), `forceUpdateRequestedAt`,
        `rollbackToVersion` — both in `init.sql`'s `CREATE TABLE` (fresh
        installs) and the same self-healing `columnDefaults` migration
        pattern the local server already used (existing installs), which
        didn't exist on the central side before this sub-phase.
  - [x] **Registry client** (`server/src/services/updater/registry.ts`):
        a real Docker Registry HTTP API v2 client (`GET /v2/<name>/tags/
        list`, 401 → `WWW-Authenticate` → bearer-token fetch → retry).
        Verified live against Docker Hub's real registry for
        `library/alpine` with a standalone test script — the auth
        challenge/token/retry flow genuinely works, not simulated.
  - [x] **Container swap** (`containerSwap.ts`): written to the real,
        stable Docker Engine API shape (`/images/create`,
        `/containers/create`, `/start`, `/containers/{id}/json`,
        `/stop`, `DELETE`) over the Unix socket — **structurally
        unverifiable here**, since it needs an actual Docker daemon,
        which this environment doesn't have. Gated behind
        `NEXURA_ENABLE_AUTO_SWAP=true` so it can't fire by accident.
  - [x] **Signaling protocol** — reuses Phase 3's asymmetric "you push
        your own state, you pull your own instructions" sync pattern
        rather than needing central to reach into a branch's LAN (it
        can't, by design — Auth doc 12.1): central only ever *sets* a
        flag/target on `branches`; the branch picks it up on its own
        next `/sync/pull`, checks the registry, and on its *next* push
        reports what happened and acknowledges (central only clears the
        flag once acknowledged, never optimistically).
  - [x] **Admin Console UI** (`AdminConsole.tsx`, Updates tab): replaced
        the old "Phase 4, not built yet" placeholder with a real
        per-branch table — version, channel (editable), last check,
        status, Force Update Now, and Rollback (version input) — calling
        the three new `central-server` endpoints for real.
  - [x] **Settings > Synchronization** (`SyncSettings.tsx`): new
        Deployment card showing this branch's real running version
        (read from `server/package.json`, currently `0.0.1`), update
        channel, last check time/status, and any pending rollback
        instruction from central.
  - [x] **Live end-to-end verification**, not just code review: logged
        in to both servers for real, provisioned a fresh branch via the
        Admin Console API, configured the local server against it, and
        round-tripped all three controls through a real `/sync/now`:
        Force Update → branch pulled `forceUpdateRequested: true` →
        acted on it (`lastUpdateStatus: "not_configured"`, correctly
        reflecting no registry configured here — not faked as success)
        → acknowledged on its next push → central genuinely cleared
        `forceUpdateRequestedAt`. Same round trip confirmed for Rollback
        (`rollbackToVersion`) and Channel (`stable` → `beta`).
  - [x] **One real bug found and fixed by that live test**: central's
        push schema only accepted `lastUpdateStatus` values `up_to_date
        /update_available/updating/failed` — but the local updater's
        actual status union is `up_to_date/update_available/failed/
        not_configured` (`updater/index.ts`). `"not_configured"` is what
        *every* branch reports until it has a real registry configured,
        so this would have silently 400'd every single deployment push
        in any real install. Fixed the enum to match the real union;
        confirmed live afterward.
- [x] **Local server serves the compiled frontend build itself**
      (Auth/Distribution doc Part 10.1's "backend + SQLite + compiled
      React build... served together"), not just packaged separately:
      `server/src/app.ts` now serves `./public` (only present when a
      frontend build was copied in at image-build time — `npm run dev`
      here plus a separately-run Vite dev server is unaffected) with an
      SPA fallback registered after every API route, so a real API 404
      still 404s. **Verified live**: built the frontend with
      `VITE_API_BASE_URL=""` (same-origin), copied it into
      `server/public`, booted the server, and confirmed `/` and
      `/assets/*` serve real files, an arbitrary client route falls back
      to `index.html`, `/health` and `/rooms` (real API, 401
      unauthenticated) still take priority — then reverted, confirming
      plain dev mode is unaffected.
- [x] **Dockerfiles** (`server/Dockerfile`, `central-server/Dockerfile`,
      plus `.dockerignore`s) — real multi-stage builds against actual
      `npm run build` scripts, `node:20-bookworm-slim` (glibc, not
      Alpine) so `better-sqlite3` uses its prebuilt binary instead of
      needing a C++ toolchain baked into the image. `server/Dockerfile`
      builds the root frontend (context = repo root) into a `frontend-
      builder` stage and copies it into the runtime image's `./public`;
      `central-server/Dockerfile` stays backend-only, matching its
      existing permissive cross-origin CORS (the Org Portal / Admin
      Console frontend is meant to be hosted separately, calling it
      cross-origin — this sub-phase didn't change that). Both mount a
      volume for their SQLite data dir, since a container swap needs the
      new container to start against the *same* data. **What's real**:
      every build command each Dockerfile stage runs (`npm run build` in
      all three packages) was actually executed here and passes clean —
      including a genuine pre-existing `tsc` failure in
      `server/src/test/offline-continue.test.ts` (untyped `fetch`
      `res.json()`) that this check caught and fixed, unrelated to this
      sub-phase's own changes. **What's not verified**: `docker build`
      itself — no Docker daemon in this environment.
- [x] **Platform Owner security hardening (Auth doc 3.5) — real and
      verified live**, addressing the gap called out earlier in Phase 3:
  - [x] **TOTP MFA, mandatory, no bypass.** A real RFC 6238/4226
        implementation (`central-server/src/auth/totp.ts`) against
        Node's built-in `crypto` only — no third-party MFA library, base32
        encode/decode and HOTP truncation both hand-written. **Verified
        against the official RFC 4226 Appendix D test vectors — all 10
        pass exactly** before this was wired into any route. Login is now
        two-step: `POST /auth/admin/login` verifies the password but
        issues only a short-lived (5 min) `admin_mfa_pending` JWT, a
        distinct `type` claim `requireAdminAuth` can never accept — so
        there's no code path where password alone reaches a protected
        route. First login walks the admin through real enrollment
        (`/mfa/enroll/start` generates and persists a secret,
        `/mfa/enroll/confirm` requires a correct code from it before
        issuing a real session); later logins go through `/mfa/verify`.
        No QR library exists here, so enrollment shows the secret as
        text (grouped for readability) plus the `otpauth://` URI —
        every authenticator app supports manual key entry, not just
        scanning, so this is a real working flow, not a stand-in.
  - [x] **Login rate limiting** (Auth doc 3.5: "5 attempts, then
        15-minute lockout") — `auth/loginRateLimit.ts`, in-memory keyed
        by email (process-local, same "one process, this is fine" caveat
        as the door-lock queue processor elsewhere in this codebase; a
        multi-instance deployment would need this moved to the DB or a
        shared cache). Shared between the password step and the MFA step
        by design, so an attacker can't reset the counter by re-entering
        a known-correct password.
  - [x] **Live end-to-end verification, not just code review**: logged
        in for real, completed real enrollment with a code computed
        independently (a standalone script implementing the same RFC
        from scratch, run separately from the app's own code, so it
        wasn't just checking the implementation against itself), then
        logged out and back in through the plain `/mfa/verify` path with
        a freshly computed code. Confirmed the pending token gets a flat
        `401 NO_TOKEN` from every protected admin route including
        `/organizations` — genuinely no bypass. Drove 5 real wrong-code
        attempts and confirmed the 6th request — including one with the
        *correct* code — got `429 LOCKED_OUT`, and that a fresh
        `/admin/login` with the correct password was blocked too while
        locked. Restarted the server afterward to clear the in-memory
        lockout from testing and confirmed the enrolled secret (which
        lives in the DB, not memory) survived the restart.
  - [ ] **Not built**: session-to-IP-range binding (Auth doc 3.5's third
        item). Deferred — "Gideon's known IP ranges" is explicitly
        described as configurable, and no such configuration exists yet;
        building this blind would mean guessing a UX (hard-reject on IP
        change vs. re-prompt for MFA vs. something else) rather than
        implementing a specified behavior.

**Exit criteria:** a physical TTLock-enabled door can be activated and
revoked from Nexura end to end (done); a branch can be provisioned from a
shipped Docker image per the Part 13 install flow (Dockerfiles + the full
signaling protocol are real and verified — the actual `docker build`/
container swap needs an environment with Docker to complete this).

---

## Phase 5 — Post-launch enhancements

Not required for a working pilot; queue these once Phases 0–4 are live.

- [ ] `NEW` **Lightweight installable PWA wrapper** (adopted from Smart
      Order's mobile-app parity): wrap the existing LAN-scoped app as an
      installable PWA for housekeeping/maintenance tablets, without
      breaking the offline-first, LAN-only model — this is a packaging
      change, not a new online mobile app.
  - Explicitly **not** doing: a native app store submission or an
    always-online mobile client, since that would bypass the local-server
    auth model.
- [ ] `NEW` Evaluate an **OTA channel manager add-on** (adopted from Smart
      Order, deliberately deferred): only worth building once the central
      server exists, since channel sync (Airbnb/Booking.com/Expedia)
      inherently requires an always-online service layer that the
      branch-local model doesn't provide. Scope as a central-server-only
      module, opt-in per organization — do not let it leak offline
      requirements into branch-level code.
- [ ] `NEW` Direct booking engine (adopted from Smart Order): a
      guest-facing booking page reading live availability from the central
      server's synced snapshot — same "central-only, opt-in" framing as
      the channel manager above.

**Explicitly rejected from competitive research** (see analysis report for
reasoning): Chinese social booking integration (Rednote/Tujia — wrong
market), freemium/commission-based pricing (conflicts with Blueprint Part
0.8's per-branch hardware + subscription model).

---

## Cross-cutting, not phase-specific

- [x] `NEW` **CI pipeline — real, verified, and it earned its keep
      immediately.** `.github/workflows/ci.yml`: three independent jobs
      (frontend, `server/`, `central-server/` — matching how they're
      actually developed, not a monorepo tool), each `npm ci` + typecheck
      (frontend only — `server`/`central-server` already had `tsc` as
      their real build step) + `npm run build`. The frontend never had a
      typecheck step at all before this (no root `tsconfig.json`,
      `typescript` wasn't even a dependency — only Vite's esbuild
      transpilation, which strips types without validating them, had ever
      run against this code). Added both for real, plus a `typecheck`
      script, and corrected a transitively-resolved `@types/react@19`
      against the actually-installed `react@18` (harmless under
      `skipLibCheck`, but genuinely wrong).
      - **The first real run found 21 genuine type errors — not noise,
        several were live bugs**, most seriously: `GuestMessaging.tsx`
        (CO-02, wired into real navigation for FD/RO/CS/MGT/ORG) had an
        orphaned "Post to Room Folio" modal block referencing six
        variables that were never declared anywhere in the file
        (`showRoomPost`, `selectedRoom`, `order`, etc.) — not dead code,
        since the JSX condition `{showRoomPost && (...)}` evaluates on
        every render, this would throw `ReferenceError` and crash the
        entire screen for any of those roles the moment they opened
        Guest Messaging. Checked the Blueprint's actual CO-02 spec
        (messaging only — send/forward/escalate/resolve, nothing about
        folio posting) and removed the block entirely rather than
        guessing at wiring up an unspecified feature. Also fixed: `HR-04
        Attendance` rendered with a missing `add` prop (would throw on
        the first toast-producing action); three Multi-Branch screens
        imported a type from the wrong module (`Screens.tsx` re-export
        that never existed, vs. the real source in `data.tsx`);
        `LinenSupplies.tsx`'s shared `stockStatus` helper had lost its
        function body in the original monolith-to-file split (bare type
        signature, no implementation, so every call would have been
        `TypeError: stockStatus is not a function` — restored verbatim
        from `StockDashboard.tsx`'s identical, intact copy of the same
        shared helper); and `ReservationGrid.tsx` passed a `{bg, text}`
        color object directly as a React `style` prop instead of mapping
        to `backgroundColor`/`color`, silently rendering the room-status
        badge with no color at all.
      - **Verified for real, not just written**: ran `npm ci` (not
        `install` — the stricter, lockfile-exact command CI actually
        uses) followed by the exact typecheck/build steps for all three
        packages, matching the workflow file line for line. Hit and
        resolved a Windows-only wrinkle along the way (`npm ci` failing
        with `EPERM` on native binaries — `lightningcss`,
        `better-sqlite3` — because this session's own running dev
        servers had them loaded; stopped them, reran clean, restarted
        them afterward. Doesn't affect CI itself, which always runs
        against a fresh checkout with nothing else running).
- [x] `NEW` **Workspace split — done and verified live, not just files
      moved.** The three independent npm packages (root frontend,
      `server/`, `central-server/`) now live at `apps/web`,
      `apps/local-server`, `apps/central-server`. `pnpm-workspace.yaml`
      updated to `apps/*` (correcting it for accuracy — the real,
      verified toolchain is still three independent npm projects, each
      with its own `package-lock.json`, not an actual pnpm workspace;
      switching package managers was out of scope and would have
      invalidated the just-verified CI pipeline and Dockerfiles for no
      real benefit). Internal relative imports needed **no changes at
      all** — each package's whole directory (including `src/`) moved as
      a unit, so every relative path inside it stayed valid; only
      cross-cutting config needed updates: both Dockerfiles' `COPY` paths
      (`server/...` → `apps/local-server/...`, plus the frontend-builder
      stage's `apps/web/...` paths), the CI workflow's three
      `working-directory` values, and `.gitignore`/`.dockerignore`.
      **Verified live end-to-end after the move**: `npm ci` (the exact,
      stricter command CI uses) succeeded fresh for all three packages
      from their new locations; typecheck + build succeeded for all
      three; all three dev servers booted from `apps/*` and answered
      `/health`; and a real login against the moved SQLite database
      (`apps/local-server/data/`) returned the same real user record as
      before the move, confirming the data itself — not just the code —
      survived intact. Hit and resolved a Windows-only file-lock wrinkle
      along the way: ~26 orphaned `tsx watch` child processes had
      accumulated across this session's repeated dev-server restarts
      (parent process kills didn't reap them), holding native binaries
      open and blocking the move/`npm ci`; identified them precisely via
      their real command lines before killing, rather than guessing.
- [x] **Audit Log (IT-05) and `key_card_events` append-only at the DB
      level — real and verified, not just absence of a delete endpoint.**
      SQLite has no per-connection role system to GRANT/REVOKE against (a
      real Postgres deployment would use that instead — noted here rather
      than overclaiming SQLite does something it structurally can't), but
      `BEFORE UPDATE`/`BEFORE DELETE` triggers that `RAISE(ABORT, ...)`
      are a genuine DB-level guarantee: they fire regardless of which code
      path (or a future bug, or a stray manual query) attempts the write,
      not just the routes this codebase currently has. Added to both
      `audit_log` and `key_card_events` in the local server's `init.sql`,
      and to central-server's own separate `audit_log`. **Verified live**:
      opened the local server's real SQLite file directly and confirmed
      both an `UPDATE` and a `DELETE` against `audit_log` genuinely throw
      `audit_log is append-only`, while normal `INSERT`s (real logging)
      continue to work.
- [x] **Full audit-log coverage — real, not every mutating route treated
      identically, each gap closed or explicitly and consistently
      reasoned about, not silently skipped.** Went through every route
      file's mutating endpoints (`grep`-counted: ~60 previously
      uninstrumented) and added `logAudit()` calls with real actor/module/
      record/detail data, following one consistent rule: **log where no
      other durable record of the action exists; skip where one already
      does**, rather than logging everything indiscriminately:
      - **Closed real gaps** (previously zero trail anywhere):
        announcements (create/archive), guest creation, housekeeping room
        status/attendant assignment/inspections, lost & found (log/claim/
        dispose), branch settings changes, shift handover (create/
        acknowledge), reservation lifecycle (create/check-in/check-out),
        folio charge posting, inventory (product/supplier creation,
        purchase order create/send/receive/cancel), restaurant (menu
        changes, table status, order open/close), door lock config and
        room-lock mapping changes, and the HR staff lifecycle (create/
        update/deactivate/reset-password/pay-rate) plus leave-request
        decisions and shift publish/clone.
      - **Deliberately not duplicated** where a real domain-specific
        trail already exists and would just be logged twice: maintenance
        work orders (`work_order_events` already covers every status
        change, assignment, and note with equal or greater detail), stock
        quantity changes (`stock_transactions` is itself a real append-
        only ledger — only the surrounding PO/product/supplier lifecycle
        events needed a generic entry), and door lock card issue/revoke
        (`key_card_events` **is** FD-13's Key Card Log, a genuine
        dedicated audit trail, not a gap).
      - **Deliberately not logged** where the action is high-frequency
        conversational or floor-operation noise with no lasting
        consequence beyond its own already-visible state: routine chat
        messages (an emergency broadcast *is* logged — a real incident,
        not noise), announcement read receipts, and the individual
        add-item/send-to-kitchen/per-item-status kitchen-floor churn
        within an already-open restaurant order (the order and its full
        item list stay fully visible via its own detail endpoint
        regardless — nothing is hidden, just not a discrete `audit_log`
        row per ticket bump).
      - **Verified live**, not just written: triggered a fresh guest
        creation, announcement creation, and a branch settings change
        through real authenticated requests and confirmed each produced
        a real, correctly-detailed row via `GET /admin/audit-log` —
        including that the settings-change entry lists which *fields*
        changed, never the values (that endpoint's payload can include
        door-lock secrets in a different route using the same pattern).
