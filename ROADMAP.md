# Nexura Roadmap

See also `UI-ADOPTION-TRACKER.md` — the working checklist for adopting the
Figma Make export (commit `aa66a30`, 2026-08-16) into `apps/web`, screen by
screen. This file stays the authoritative build-status tracker; that one tracks
UI adoption only.

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
into the same order model), Communications is 4/4 real (CO-01 through
CO-04 — CO-01 is polling-based, not real-time push; CO-02 is a real staff
communication log, not a WhatsApp/SMS sending gateway, built later in a
dedicated pass), Inventory is 5/5 real (IV-01
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
against the official RFC 4226 test vectors) with no bypass path, real
login rate limiting verified live including a genuine 5-attempt lockout,
and real session-to-IP-range binding (flags rather than hard-blocks, a
deliberate call given this is a single unrecoverable account — see that
phase's Platform Owner security entry for why), all three states verified
against the live server. What's genuinely unverifiable in this environment — a live
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
  - [x] **Communications — CO-01 through CO-04 all real and verified**
        (CO-02 Guest Messaging was originally deferred here, later
        revisited and built for real — see below). New tables:
        `chat_channels`, `chat_messages`, `announcements`,
        `announcement_reads`, `shift_handovers`, `guest_message_threads`,
        `guest_messages`. New endpoints: `GET/POST /chat/...`,
        `GET/POST /announcements/...`, `GET/POST /shift-handovers/...`,
        `GET/POST /guest-messages/...`.
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
    - **CO-02 Guest Messaging — later revisited and built for real, honestly
      rescoped rather than waiting on external credentials.** The original
      deferral reasoning stands (WhatsApp/SMS need real third-party gateway
      accounts that don't exist here), but re-examined: this doesn't need
      to be an unbuildable feature until then, because there's a genuinely
      real, valuable version that doesn't require sending anything — this
      is a **shared staff-facing guest-communication log and coordination
      tool**, not a message-sending gateway. Staff record what was really
      communicated to (or heard from) a guest over whatever channel
      actually happened — their own WhatsApp, a phone call, in person —
      so the whole team has one threaded, shared record instead of none at
      all (the honest starting point: before this, there was *no* record
      of guest communications anywhere in the system). `channel` is
      recorded as metadata about how the real conversation happened, never
      a delivery promise.
      - One thread per guest (not per-reservation) so a repeat guest's
        history carries across stays — real front-desk value ("this guest
        has asked about late checkout before").
      - **"Forward to department" and "escalate to manager" plug into the
        real Internal Chat system (CO-01) instead of being a status flag
        nobody would see**: forwarding posts a real message into that
        department's actual chat channel (auto-created if a branch
        doesn't have one yet); escalating posts a real message into a real
        DM with every Manager/ORG at the branch, reusing
        `getOrCreateDmChannel` extracted from `routes/chat.ts` for this —
        a manager finds out through the same Internal Chat they already
        monitor, not a separate inbox nobody checks.
      - New permission key `guests:message` (Blueprint 1031: "Roles: FD,
        RO, CS, MGT, ORG"), added to those three roles' real grants.
      - **Verified live end-to-end**, not just written: checked a real
        guest into a real room, logged a real two-way message exchange,
        forwarded the thread and confirmed the exact message actually
        landed in the Housekeeping department's real chat channel,
        escalated and confirmed both the Manager and ORG accounts got a
        real DM ("notifiedManagers: 2") with the right summary, resolved
        the thread, and confirmed every action produced a real, correctly-
        detailed `audit_log` entry. Also confirmed the permission boundary
        for real — Housekeeping (not in Blueprint's CO-02 role list) gets
        a genuine `403` trying to access any of it.
      - **What's still honestly not built**: actual outbound WhatsApp/SMS
        delivery (needs real gateway credentials, same class of gap as
        TTLock/Docker) and any guest-facing portal for an "internal"
        message to be delivered to (no guest-facing surface exists
        anywhere in this system — building one is a materially bigger
        scope decision than this pass, not attempted here).
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
- [x] `NEW` **Unified guest inbox** (adopted from Smart Order) — done as
      part of building CO-02 for real (Phase 2 entry above): one
      `guest_messages` table keyed by thread + channel, exactly the shape
      this item asked for, and the frontend already renders one
      conversation per guest with WhatsApp/SMS/internal messages
      interleaved in a single thread rather than parallel per-channel
      views. What's not done: this unifies *recording*, not live
      *receiving* — there's still no real WhatsApp/SMS gateway account to
      actually pull inbound messages from automatically (staff log them),
      see the Phase 2 entry for the exact scope line.
- [x] `NEW` **Metrics-driven dashboard copy** (adopted from Smart Order):
      D-01/D-02 dashboards should show trend deltas with plain-language
      framing ("+12% vs last week") instead of bare current-value numbers.
      Applies to occupancy, revenue, and department KPI cards. **Done** as
      part of the Dashboard addendum above — occupancy and revenue cards
      show a real day-over-day delta ("+4% vs yesterday"); department KPI
      cards intentionally don't (Blueprint doesn't ask for a trend on
      those, just the current value).
- [x] `NEW` **OpenAPI spec for local-server endpoints — genuinely
      generated from the real route definitions, not hand-typed, and
      verified against a real linter.** `apps/local-server/scripts/
      generate-openapi.mjs` is a static extractor: it parses `src/app.ts`'s
      real `app.use(...)` mount table and every `routes/*.ts` file's real
      `router.get/post/put/delete/patch(...)` calls (path, and whether
      `requireAuth`/`requirePermission(...)` gate it) directly from source
      — deliberately static rather than booting the app and walking
      Express's runtime router stack, to avoid importing every route
      file's real DB/service side effects just to produce documentation.
      Hand-written detail (summaries, descriptions, real request-body
      JSON Schemas copied from each route's actual zod schema) lives
      separately in `scripts/openapi-enrichments.mjs`, keyed by path, so
      re-running the generator after a route changes never clobbers it.
      `npm run openapi:generate` regenerates `openapi.json`; this is a
      living artifact, not a one-time snapshot — matches the item's own
      "as they're built" framing.
      - **Verified for real, not just assumed correct**: cross-checked
        the extractor's output count against a plain `grep -c` of every
        route file's `router.*(` calls — 146 and 146, exact match. Then
        ran the real `@redocly/cli` linter (added as a genuine
        devDependency, `npm run openapi:lint`) against the output, which
        is where this stopped being a documentation exercise and started
        catching real mistakes: two places used JSON Schema 2020-12's
        numeric `exclusiveMinimum` (`exclusiveMinimum: 0`) instead of
        OpenAPI 3.0's boolean form (`minimum: 0, exclusiveMinimum: true`)
        — different specs, easy to conflate, genuinely wrong either way
        without a real validator catching it; one place used an
        OpenAPI-3.1-only array `type`; and every public endpoint
        (`/auth/login`, `/auth/continue-offline`) needed an explicit
        `security: []` rather than an omitted field, which the
        `security-defined` rule correctly flags as ambiguous. Fixed all
        three, added real per-tag descriptions and generated
        `operationId`s (146 total, confirmed unique) to clear the
        remaining style warnings, and the spec now lints with **zero
        errors** — the 2 remaining warnings are `localhost` in the dev
        server entry, which is genuinely correct for local dev, not a
        placeholder (documented inline in the spec itself, alongside a
        second server entry for the real `nexura.local` LAN deployment
        shape from the Auth doc).
      - **What this doesn't cover**: response body schemas are real but
        intentionally light (description text, not exhaustive per-field
        JSON Schema) for most endpoints — full response modeling for all
        146 endpoints was judged disproportionate effort versus request-
        schema + endpoint-coverage accuracy, which is where the real
        value is for a client generator or integration partner.

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
  - [x] **Session-to-IP-range binding (Auth doc 3.5's third item) — later
        revisited and built for real, deliberately scoped away from the
        hard-reject-vs-re-prompt UX ambiguity that justified the original
        deferral.** `central-server/src/auth/ipRanges.ts`: real IPv4 CIDR
        matching (`PLATFORM_OWNER_ALLOWED_IP_RANGES`, comma-separated,
        same "not configured = no-op" pattern as TTLock/registry config
        elsewhere in this codebase), checked at both real session-issuance
        points (`mfa/enroll/confirm`, `mfa/verify`) — not at `/admin/login`,
        which only ever grants a 5-minute MFA-pending token.
        - **Flags, doesn't block, and that's a deliberate decision, not a
          missing feature**: the Auth doc never actually specifies hard-
          reject vs. re-prompt, and this account is explicitly "one
          account" (Auth doc 3.1) with no other admin able to unlock it
          and no real email/SMS recovery channel built here — a hard
          block on a misconfigured or dynamic-IP mismatch would risk
          permanently locking out the only Platform Owner account. Flags
          instead: a real `admin_login_ip_flagged` audit log entry plus an
          `ipRangeWarning` field in the login response, which the Admin
          Console surfaces as a real toast ("⚠️ Signed in from an IP
          outside your configured allowed range") — the same "impossible
          travel" notification pattern real products use for a single
          high-value account, not a guessed UX.
        - **The CIDR matching itself was verified against 13 real test
          cases before it was ever wired into a route** (exact IPs,
          /24 and /16 and /30 boundaries, the `/0` wildcard, IPv4-mapped
          IPv6 normalization `::ffff:x.x.x.x`, and malformed input) — same
          "prove the algorithm before trusting it" bar as the TOTP
          implementation's RFC 4226 test vectors earlier in this phase.
        - **Verified live against the real running server, not just unit-
          tested in isolation**: confirmed the unconfigured baseline
          returns `ipRangeWarning: false` with no behavior change from
          before this existed; configured a real restrictive range
          (`10.0.0.0/8`) and confirmed a real login from `::1` came back
          `ipRangeWarning: true` with a real audit row recording the
          actual connecting IP; then configured a range that genuinely
          included the connection (`127.0.0.0/8`, connecting explicitly
          over IPv4) and confirmed the same login came back `false` —
          all three real states (unconfigured, flagged, allowed)
          exercised against the live server, not assumed from the code.
        - **IPv4 only** — IPv6 CIDR matching is meaningfully more
          involved and this account's real access pattern (a home/office
          IPv4 range) doesn't need it; documented in the source, not
          silently dropped.

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

---

## Backend Build Blueprint — batched hardening (`Nexura-Backend-Build-Blueprint.md`)

A separate, execution-oriented spec (B0–B35) that supersedes the ad-hoc
"what's next" ordering for backend work. It is organised around ten
non-negotiable invariants (offline-first, integer-kobo money, transactional
multi-writes, append-only ledgers, migrations-only schema changes, branch
scoping, declared permissions, audit coverage, business-date stamping,
gapless numbering). Batches B1–B5 are load-bearing and must not be
reordered.

**Blueprint-vs-reality discrepancies, resolved deliberately:**
- Blueprint says *pnpm workspace*; the real, verified toolchain is **npm
  with a separate `package-lock.json` per app** (`pnpm-workspace.yaml`
  exists but nothing uses it). Scripts are `npm run ...`, and Dependabot is
  configured per-package for the same reason.
- Blueprint says central-server is *Postgres*; it is really
  **better-sqlite3**, same as local-server. Not changed — nothing yet needs
  Postgres, and switching would be a migration project, not a batch.
- Blueprint says tests are *vitest in `tests/`*; they were **node:test in
  `src/test/`**. Migrated to vitest (see B0.7) but kept in `src/test/`.

### B0 — Hygiene, CI & security quick wins ✅

- [x] **B0.1 — `npm audit` in CI + Dependabot.** `.github/dependabot.yml`
      covers all three packages plus github-actions, grouping minor/patch
      into one PR so majors stay individually reviewable. **All three
      packages now gate on `npm audit --audit-level=high` and pass at
      exit 0.**
      - The React 18 → 19 upgrade below closed the last blocking advisory,
        so web's audit was promoted from report-only to a real gate.
      - `drizzle-kit` was upgraded `0.18.1 → 0.31.10`, which cleared the 4
        high `brace-expansion` advisories. 4 **moderate** dev-only esbuild
        advisories remain, reached through `drizzle-kit → @esbuild-kit/
        esm-loader` (a deprecated package the *current* drizzle-kit still
        ships) — there is no upstream version to move to, and at moderate
        they don't trip the gate. Noted rather than force-fixed.

- [x] **React 18 → 19 upgrade** (the open item B0.1 previously blocked on).
      `react@19.2.8`, `react-dom@19.2.8`, `react-router@8.3.0`,
      `@types/react@19`, `@types/react-dom@19`, `vite@6.4.3`. Result:
      **`apps/web` audits at 0 vulnerabilities**, dev and runtime.
      - **Why it was safe:** the app's own source had *zero* React 19
        breaking patterns — no `ReactDOM.render`/`hydrate`, no
        `findDOMNode`, no string refs, no `defaultProps`/`propTypes` on
        function components, no legacy context, no bare `useRef()`. Of ~30
        React ecosystem dependencies, only two excluded React 19, and
        **both turned out to be dead weight from the Figma Make export**:
        `react-popper` + `@popperjs/core` were imported nowhere (MUI 7 uses
        floating-ui) and were removed; `react-day-picker` was used by
        exactly one component, `ui/calendar.tsx`, which nothing renders.
      - `react-day-picker` was upgraded `8 → 10` rather than deleted with
        its one consumer, because a date picker is very likely wanted by the
        incoming redesign. `calendar.tsx` was rewritten for the v9+ API
        (snake_case `classNames` keys → camelCase semantic names, `<table>`
        → grid so `row`/`cell` became `week`/`day`, and the
        `IconLeft`/`IconRight` slots collapsed into one `Chevron` slot
        taking an `orientation`). Verified by typecheck, since
        `React.ComponentProps<typeof DayPicker>` makes API drift a
        compile error.
      - The stale `pnpm.overrides.vite: "6.3.5"` pin was also corrected —
        left alone it would have silently dragged Vite back to the
        vulnerable version under pnpm.
      - **Verified:** 0 type errors, production build succeeds, dev server
        serves and transforms `main.tsx` through `createRoot`, exactly one
        React copy in the tree (no duplicate-React hazard), and `19.2.8`
        is what's actually baked into the built bundle.
- [x] **B0.2 — timing-safe sync-key comparison.** `central-server`'s
      `authenticateBranch` compared SHA-256 digests with `!==`, which
      short-circuits at the first differing character and leaks, via
      response time, how many leading characters of a guessed key were
      correct. Now `crypto.timingSafeEqual` over equal-length buffers.
- [x] **B0.3 — door-lock credentials encrypted at rest.** New
      `src/lib/secrets.ts`: AES-256-GCM, key derived via **HKDF-SHA256 from
      the branch's existing RSA signing key** (`data/keys/local_private.pem`
      — already per-branch, already never leaves the property, so no new
      secret to manage or back up), with a distinct `info` string so the
      derived key is cryptographically independent of the signing key.
      Random IV per call, so two branches sharing a password don't produce
      identical ciphertext. Versioned `enc.v1.` prefix.
      - **Transparent upgrade**: `readDoorLockConfigWithSecrets()` decrypts
        on read and lazily re-writes any surviving plaintext row as
        ciphertext. Best-effort — a failed re-write logs but does not block
        the lock command, since refusing would take doors offline over a
        storage nicety.
      - Extracted into `services/locks/config.ts` rather than `access.ts` to
        avoid a genuine import cycle (`access.ts` already imports the
        adapter; the adapter now needs the decrypting reader).
      - **Threat model documented in the file**: this defends against a
        stolen `.db`/backup/offsite replica, *not* full host compromise — an
        attacker who can read the PEM can derive the key. B17.5 (encrypt the
        signing key itself) is what closes that.
      - 8 real tests in `src/test/secrets.test.ts` covering round-trip
        (incl. unicode/4KB/single-char), non-appearance of plaintext,
        IV-randomness, legacy-plaintext pass-through, and that a **tampered
        or malformed blob throws rather than returning corrupted plaintext**
        (silently-corrupted output would be sent to TTLock as a real login
        attempt).
- [x] **B0.4 — request IDs.** `src/lib/requestId.ts`; ID attached to `req`,
      echoed in the `x-request-id` response header, included in every log
      line, and **returned in the 500 error body** so a user reporting a
      failure can quote it. Honours an inbound header so a call chain keeps
      one ID end-to-end — validated against `/^[A-Za-z0-9_-]{1,64}$/`, since
      an unbounded client-supplied string that lands in logs is a
      log-injection vector.
- [x] **B0.5 — structured JSON logging (pino).** `src/lib/logger.ts` +
      `pino-http`. Every request line carries request ID, actor (resolved
      lazily, since `requireAuth` populates `req.auth` after this middleware
      runs), branch, route, status and duration. 5xx logs at `error`, 4xx at
      `warn`, so client mistakes don't page anyone. Redaction list covers
      cookies, auth headers, the sync key, and `password`/`clientSecret`/
      `accessToken`/`refreshToken`/`pin`/`totpSecret` at any depth —
      **verified live**: real runs show `"cookie":"[redacted]"` and
      `"set-cookie":"[redacted]"`. All `console.*` in app/service code
      replaced; `seed.ts` deliberately keeps `console` (it is a human-facing
      CLI that prints credentials). Rotation: container stdout via the host
      log driver, plus an optional `NEXURA_LOG_FILE` transport for
      bare-metal installs.
- [x] **B0.6 — explicit body size limit.**
      `express.json({ limit: "256kb" })` on both servers.
      - **Two real bugs surfaced while verifying this** — the limit worked,
        but what happened *after* it fired was wrong:
        1. A rejected body came back as **500 `INTERNAL_ERROR`**, because
           body-parser throws and the generic error handler caught it. That
           blames the server for a client mistake, files a bogus IT-02
           error-log entry, and logs at `error` level — so routine junk
           traffic would drown real failures. Both servers now map
           body-parser's `err.type` to the right status: **413
           `PAYLOAD_TOO_LARGE`**, **400 `INVALID_REQUEST_BODY`**.
        2. Those responses carried **no request ID**, because
           `requestIdMiddleware` had been registered *below* the body
           parser — silently exempting exactly the requests most worth
           tracing. Request ID and the HTTP logger now sit above it.
      - Locked in by `src/test/request-hygiene.test.ts` (6 tests), since
        both regressions are invisible on any normal request. The
        header-injection case is driven over a **raw socket**, not `fetch` —
        `fetch` validates header values itself and refuses to send control
        characters, so testing it through `fetch` would only prove `fetch`
        works.
- [x] **B0.7 — vitest + coverage, replacing node:test.** This also **fixed a
      real, long-standing blocker**: `tsx --test <glob>` reliably hung dead
      after the first test file completed on Windows, which had forced a
      hand-rolled sequential per-file runner (`scripts/run-tests.mjs`, now
      deleted). Vitest runs each file in its own worker and the hang is
      gone. Config pins `pool: "forks"` + `singleFork` + no file
      parallelism, because every test file sets `NEXURA_DB_PATH` at module
      scope and binds its own HTTP server, so files must not share a
      process. Coverage via v8 with **no threshold gate** — B0 establishes
      the baseline, per the blueprint.
      - **44 tests across 7 files pass in local-server; 6 in
        central-server.**
- [x] **B0.8 — `lint:invariants`.** `scripts/lint-invariants.mjs` guards
      invariant 3. Rather than the blueprint's suggested per-*file* `.run(`
      count (which would flag a file of ten single-write handlers), it
      brace-matches each `router.<method>(...)` body, strips any
      `db.transaction(...)`/`immediateTransaction(...)` block, and counts
      the surviving `.run(` calls — with a string/comment-aware scanner so a
      brace inside a literal doesn't derail it.
      - **It found 20 violating handlers, independently matching the
        blueprint's own "known offenders" list**: `reservations.ts` check-in
        (3 writes) and check-out (3), `inventory.ts` PO receipt,
        `restaurant.ts` order→folio (4 writes). **There are currently zero
        `db.transaction()` calls anywhere in local-server** — invariant 3 is
        entirely unimplemented, which is exactly what B3 exists to fix.
      - Runs as a **ratchet, not a gate**: the 20 are recorded in
        `scripts/lint-invariants-baseline.json` and only *new or worsened*
        violations fail CI. A permanently-red build for a known 20 would
        just be ignored. `--strict` (no baseline) is what B3's DoD turns on
        once the baseline is empty.
      - **Verified in all three directions**: a new 2-write handler fails, a
        new 1-write handler passes, and a new 2-write handler correctly
        wrapped in `db.transaction()` passes.

**B0 DoD status:** CI green with audit + coverage ✅ · no plaintext lock
credentials ✅ · every log line carries a request ID ✅. The react-router
item that was carried forward is now **closed** by the React 19 upgrade
above — all three packages audit clean and gate on it.

### B1 — Migration system ✅ 🔴

Replaced `init.sql` + the `columnDefaults` self-healer with versioned
migrations in `src/db/migrations/NNNN_name.sql`, applied by
`src/db/migrate.ts` before drizzle opens over the connection.

- **`0001_baseline.sql` is init.sql frozen verbatim**, deliberately *not*
  regenerated from `schema.ts` via `drizzle-kit generate`. init.sql is the
  schema that has actually been running in production shape — including
  hand-written indexes and constraint details a regeneration could quietly
  differ on. A fresh database therefore gets exactly the schema known to
  work. Verified byte-identical from the first `CREATE` onward.
- **Custom runner, not drizzle's migrator.** Drizzle's applies pending SQL
  and records a journal; it does none of the three things shipping to
  unattended offline properties actually requires:
  1. **Future-schema guard** — a DB migrated past what the binary knows
     refuses to start. This is the rollback case: a container reverted to an
     older build must not run against a newer schema and silently corrupt
     it.
  2. **Pre-migration snapshot** via `VACUUM INTO` (WAL-safe, unlike copying
     the file), recorded in `backup_snapshots` so it appears in IT-04. On
     failure the existing restore-marker mechanism is staged so the next
     boot rolls the data back.
  3. **Baselining** an existing database that predates migrations.
  `drizzle-kit` is still configured (`drizzle.config.ts`, `npm run
  db:generate`) for *authoring* new migrations — it just doesn't apply them.
- **Immutability enforced by checksum.** Editing an already-applied
  migration refuses to start, because otherwise properties in the field
  silently disagree about their schema. Checksums normalise line endings so
  a git `autocrlf` difference doesn't read as tampering.
- **Each migration runs in its own transaction**, with its
  `schema_migrations` row committed atomically alongside its DDL — SQLite
  makes DDL transactional, so a mid-migration failure leaves no partial
  schema.
- **The self-healer is gone from the boot path**, but its column map
  survives inside `migrate.ts` for exactly one purpose: a pre-migration
  database may be missing columns that later init.sql edits introduced
  (`CREATE TABLE IF NOT EXISTS` never adds columns to an existing table).
  Baselining asserts the DB matches 0001, so the reconciliation runs **once**
  during that adoption to make the assertion true. A database that silently
  repairs its own shape on every boot can never be reasoned about — that is
  why it doesn't stay.
- Failure to migrate is **fatal**. Starting anyway means serving a hotel
  from a database whose shape the code disagrees with, which produces
  silently wrong folio balances rather than an outage someone notices.
- **Schema version is reported** on `/health` (B1 DoD) and in the sync push
  payload. Central declares the field explicitly rather than relying on
  zod's strip-unknown-keys, since that file already carries the scar of a
  payload/schema mismatch that silently 400'd every push; it persists in B20.

**Verified — 13 tests in `src/test/migrations.test.ts`, covering all five the
blueprint requires plus four more:**
- Fresh DB applies all migrations and populates `schema_migrations`.
- Existing DB is baselined **without re-executing 0001** — proven by making
  0001 a bare `CREATE TABLE` that would error if re-run — then applies only
  what's pending, with pre-existing rows intact.
- A migration that creates a table, inserts, *then* fails leaves the DB at
  the prior version with **no partial DDL surviving** and data untouched.
- A DB at version N+1 against a binary knowing N **exits non-zero** — driven
  through a real subprocess, because asserting on the thrown error would
  miss a regression where the catch block logs and continues.
- The snapshot is created before the migration, names its target version,
  and is a **readable database holding the pre-migration state** (not just a
  non-empty file); a failed migration stages it for restore.
- Plus: checksum tampering rejected, malformed filenames rejected, duplicate
  versions rejected, and the real migrations directory loads in order.

**Also verified against a simulated real property**: a legacy DB with real
org/branch/user/guest rows, no `schema_migrations`, and a deliberately
dropped `guests.nationality` column booted the *actual* `db/client.ts` —
baselined at 0001 (`duration_ms: 0`, i.e. not re-executed), reconciled the
missing column, and kept its data. That adoption path was the single biggest
risk in this batch.

**B1 DoD:** `init.sql` no longer executes at runtime ✅ (kept as historical
provenance, with a header saying so) · self-healer deleted from boot ✅ ·
all five required tests pass ✅ · migration version on a health endpoint ✅.

### B2 — Money → integer kobo ✅ 🔴

Float money is gone. Every money value in the database, in an API request or
response, and in any intermediate calculation is now an integer count of
kobo, behind `src/lib/money.ts`.

- **The line this batch existed to delete** was in `services/folio.ts`:
  `Math.round((totalCharges - totalPaid) * 100) / 100`. It was there purely
  to paper over float drift when summing naira as doubles. In integer kobo
  the subtraction is exact, so it is deleted rather than reimplemented.
- **`0002_money_kobo`** converts 15 columns: add `_kobo` INTEGER, backfill
  `CAST(ROUND(x * 100) AS INTEGER)`, drop the float. Verified safe first —
  no index, view, or constraint referenced any of them, and SQLite 3.49
  supports `DROP COLUMN`. The whole file runs in one transaction.
  - `branches.tax_rate` became **`tax_rate_bp`** (basis points, 7.5% → 750),
    because it is a rate, not an amount.
  - **Six `real()` columns deliberately survive** and the DoD's "zero
    `real()` columns" is read as "zero *money* columns": stock quantities
    are genuinely fractional (2.5 kg of flour), and `occupancy_rate` is a
    percentage. Invariant 2 is about money, not about banning `real()`.
- **`money.ts`**: `toKobo`/`fromKobo`, `addKobo`/`subKobo`/`mulKobo`,
  `mulRate`, `valueKobo`, `splitKobo`, `parseNairaInput`, `formatNaira`,
  basis-point helpers. Non-integer inputs **throw** rather than round —
  a fractional kobo means a float leaked in upstream, and absorbing it
  would hide the actual bug.
  - **Rounds half away from zero, not `Math.round`.** `Math.round(-7.5)` is
    `-7`, so tax on a −₦100 reversal would not be the exact negative of tax
    on the +₦100 charge and a fully-voided folio would fail to return to
    zero. B4 posts corrections as negative rows, so this matters. Proven
    over 2,000 random amount/rate pairs.
  - **`valueKobo` is a second, admitted rounding site** alongside `mulRate`.
    The blueprint says `mulRate` should be the only one, but stock
    quantities are fractional, so unit price × quantity does not always land
    on a whole kobo. It is documented rather than contorted around, and
    integer quantities go through `mulKobo`, which throws instead of
    rounding.
- **Boundary conversions are confined to two places**, both commented:
  central still stores naira floats until B20, so `services/sync.ts`
  converts on push (`fromKobo`) and on ingest (`toKobo`). Nothing else in
  the server sees a float.
- **`lint:invariants` extended for invariant 2**, banning `* 100`, `/ 100`
  and `.toFixed(2)` outside `money.ts`.
  - **Narrowed after a real false-positive rate**: the first version flagged
    six legitimate sites — CPU load, free-memory %, occupancy rate, and two
    guest-mix ratios. All percentage maths, no money. A linter that cries
    wolf on correct code gets switched off, so the operators now only fire
    when the line also mentions something money-shaped (`rate` and `total`
    are deliberately *not* markers — they were the false positives).
    Verified it still catches `amountKobo / 100`, `priceNaira * 100` and
    `.toFixed(2)` while ignoring `Math.round((a / b) * 100)`.
  - **The invariant-3 baseline was re-keyed** from `file:line:method` to a
    per-file multiset of write counts. Line keys looked precise but were
    useless: adding one import shifted every handler and made all 20 known
    violations read as new.
- **Frontend converted in lockstep** — 21 screens plus `api.ts`. New
  `apps/web/src/app/lib/money.ts` mirrors the server's formatting (a
  deliberate duplicate, not a shared package: these are independently
  deployed npm packages, and the server's copy is the authority with the
  tests). Form state still holds naira strings; conversion happens only at
  the send boundary via `toKobo`.

**Verified:**
- **The property test the blueprint asks for**: 10,000 random
  charge/payment sequences reconcile with zero drift, checked against an
  independent **BigInt oracle** rather than the implementation compared to
  itself. A companion test proves the float approach it replaces *does*
  drift on the same data, so the property test cannot be vacuously passing.
- `splitKobo(10001, 3)` → `[3334, 3334, 3333]`, plus 5,000 random splits
  that always sum back to the input, negatives included.
- Migration backfill against a seeded DB with known values: `7.5 → 750bp`,
  `₦5,000.50 → 500050`, `19.99 → 1999` (the canonical float trap), a NULL
  pay rate that **stays NULL rather than becoming 0**, and the old float
  columns confirmed dropped.
- A schema assertion that no `real()` money column can reappear.
- **End to end on a real seeded database**: migrations 1 and 2 applied,
  `/health` reports `schemaVersion: 2`, the API returns `rateKobo: 4200000`
  and `tax_rate_bp: 750`, and a real folio — 3 nights × ₦38,000 — reconciles
  to **exactly 0**.
- 84 local-server tests, 6 central-server, all three typechecks, all three
  audits, web build.

**B2 DoD:** zero `real()` *money* columns ✅ · no money arithmetic outside
`money.ts` (linted) ✅ · property test green ✅.

### B3 — Transactions & race elimination ✅ 🔴

All 20 multi-write handlers are now atomic, and double-booking is prevented
by the database rather than by application logic. **`lint:invariants` is
clean at `--strict`** and the baseline file is empty, so the npm script and
CI now enforce it permanently — a new un-atomic handler fails the build.

- **`0003_room_night_inventory`** — one row per room per night, `UNIQUE
  (room_id, stay_date)`. That index is the actual guarantee; the overlap
  query that remains in the route is only there to produce a friendlier
  error a moment earlier. Check-out and room-change release the nights so
  the room is immediately rebookable.
  - Checkout day is **not** a night, which is what keeps same-day turnovers
    legal — covered by its own test.
  - The backfill walks each existing reservation's nights with a recursive
    CTE, excluding cancelled/no-show (they don't occupy a room), and uses
    `INSERT OR IGNORE` because historical data predates the constraint and
    may contain genuine overlaps — the migration must not fail on a mess it
    inherited. Verified against real seeded data: nights held exactly equal
    checkout − checkin for every live stay, and zero for cancelled/no-show.
- **`src/db/tx.ts`** — `transaction()` and `immediateTransaction()`.
  IMMEDIATE is used for every check-then-write: a deferred transaction
  starts in read mode and only takes the write lock at the first write,
  leaving a window where two callers both read "available".
  - **Verified drizzle's semantics before relying on them**, rather than
    assuming: a helper that writes via the shared `db` handle (`logAudit`,
    `folioSummary`, the lock queue) *does* join the transaction and roll
    back with it. That is why the callbacks use `db` and not the `tx`
    handle — threading `tx` through would create two names for one
    connection and tempt someone to "fix" the helpers, while the current
    shape means an audit row for an operation that then failed cannot
    survive.
  - The blueprint writes `db.transaction(() => {...})()`; that is
    better-sqlite3's raw API. Drizzle's wrapper runs the callback directly,
    so there is no trailing `()`.
- **`HandlerError`** (`src/lib/handlerError.ts`) — inside a transaction there
  is no way to `return res.status(409)`, because returning commits the very
  work being rejected. Validation discovered mid-transaction throws with its
  HTTP status attached and is mapped to a response outside. Without this the
  tempting shape is to check everything *before* `BEGIN` and only write
  inside, which is precisely the race this batch removes.
- **Every check-then-write now re-reads inside the transaction** — check-in
  re-reads room *and* reservation status, PO receipt re-reads the PO status,
  order close re-reads whether it is already closed, leave-decide re-reads
  "still pending". Taking the lock does not make a read from before the lock
  true.
- **Check-out keeps a short payment while refusing to release the room.**
  The guest genuinely handed over that cash, so rolling it back would lose a
  real payment. The transaction therefore *returns* an outcome rather than
  throwing — returning commits, banking the payment either way, and only
  the release-the-room half is conditional.
- **Found and fixed while verifying**: `seed.ts` writes reservations
  directly rather than through the routes, so a freshly seeded database had
  6 reservations holding rooms but **zero** room-night claims — the guard
  would have let the API rebook demo-occupied rooms. The seed now claims
  nights, applying the same cancelled/no-show exclusion as the migration.

**Verified — `src/test/concurrency.test.ts`, 6 tests:**
- **50 concurrent bookings of the same room and dates: exactly one succeeds,
  49 get 409**, and the database agrees — 3 nights held, all by one
  reservation.
- **20 concurrent check-ins on one reservation: exactly one succeeds**, and
  the guest is billed for the room **exactly once** (the real damage from a
  double check-in is a duplicated charge, so the assertion is on the ledger,
  not the status code).
- A test that bypasses the route entirely and inserts a duplicate room-night
  straight into the table, asserting `SQLITE_CONSTRAINT_UNIQUE` — so this
  fails if anyone ever "optimises away" the constraint and leaves only the
  overlap query.
- Same-day turnover still allowed.
- Injected failure after check-in's first two writes leaves reservation,
  room and folio **all** unchanged; the same for a PO receipt mid-way.

> **Honest note, stated in the test file itself:** better-sqlite3 is
> synchronous and Node is single-threaded, so 50 in-flight requests do not
> execute *simultaneously* the way they would against Postgres — they
> interleave only where a handler yields. The tests are still meaningful:
> the unique index genuinely rejects the second insert, several handlers on
> this path really are async, and the atomicity halves hold regardless of
> threading. Where a test proves something weaker than its name suggests,
> the file says so rather than implying stronger coverage than exists.

**B3 DoD:** `lint:invariants` clean ✅ (now `--strict`, baseline empty) ·
concurrency tests green ✅ · every write handler transactional ✅.

### B4 — Append-only ledger, voids & reversals ✅ 🔴

`folio_charges` and `payments` are now immutable. A correction is a **new
negative row** pointing back at the original, so a folio shows both what was
charged and that it was unwound — the difference between an auditable ledger
and one where mistakes quietly disappear.

- **`0004_ledger_append_only`** adds `reversal_of_id`, `is_reversal`,
  `reversed_amount_kobo`, `voided_at/by`, `void_reason_code/note` and
  `business_date` to both tables, plus four triggers.
- **The triggers are the actual guarantee.** Application discipline can be
  undone by the next person who writes an `UPDATE`; the point of an
  append-only ledger is that the database refuses regardless. They allow
  exactly one mutation — stamping void metadata onto a line that is not yet
  voided — and forbid changing `amount_kobo`, deleting, or touching an
  already-voided row. That last clause is what prevents **un-voiding**: once
  a line is struck, the only way to move the balance again is another
  visible row.
- **Partial voids drove a real design constraint.** `voided_at` is set only
  on a *full* void, because the trigger locks a row the moment it is set —
  stamping it on a partial void would make the remaining 60% impossible to
  void later. `reversed_amount_kobo` accumulates instead, and a partially
  voided line stays live.
- **`folioSummary` needed no change at all.** Reversals are negative rows, so
  they net out of `sum(charges) − sum(payments)` naturally. Nothing is
  filtered anywhere — a folio that hides its reversals is precisely what this
  batch exists to prevent.
- **Permissions**: new `folio:void` and `finance:reports`. `folio:void` is
  deliberately **not** in the Front Desk set (it is the most abusable action
  in the app) — it goes to FIN, RO, and the three wildcard roles. The
  blueprint writes these `folio.void` / `finance.reports`; this codebase has
  used `module:action` since HR-03, so they keep that shape.
- **`business_date`** is stamped on every financial row (invariant 9) behind
  `lib/businessDate.ts`. B5 replaces the derivation with the branch's real
  rolling business date; putting it behind a function from day one means
  that change happens in one place rather than hunting `new Date()` calls.
- **`GET /reports/reversals`** groups by operator, which is what makes it a
  fraud-detection view rather than a curiosity: one person voiding far more
  than their colleagues is the signal, and it is invisible in a flat
  chronological list. Void reasons are a controlled list for the same
  reason — you cannot group by a free-text sentence.

**Verified — `src/test/ledger.test.ts`, 15 tests:**
- Direct `UPDATE` of a posted amount, and direct `DELETE`, are both rejected
  by the database — tested by **bypassing every route and service** and going
  straight at the table, so this fails if the triggers are ever dropped.
- A fully voided line cannot be edited again (no un-voiding).
- Full void → reversal row with the opposite sign, balance to zero, and the
  original still carrying its **original amount**.
- **Partial void of 40% leaves 60% outstanding**, does not set `voided_at`,
  and the remainder can still be voided afterwards.
- Over-voiding, double-voiding, `other` without a note, and an unknown reason
  code are all refused.
- Voiding a payment puts the debt back.
- Front Desk gets 403 **and writes no rows** (asserted by row count, not just
  the status code).
- The reversal report groups by operator with a per-reason breakdown, and
  requires `finance:reports`.

**Also found and fixed while verifying:** the OpenAPI generator had silently
skipped the whole new route file, because its import regex did not match
`import x, { y } from ...`. Fixing that exposed a second problem — the
generator maps one router per file, so mounting two routers from
`folios.ts` emitted every folio path a second time under `/reports`. The
reversal report moved into `reports.ts` where every other report lives, and
the generator now **warns on an unresolved mount and hard-fails on a
duplicate one**, so the silent-skip cannot recur. Spec back to valid: 150
endpoints, 0 errors, the same 2 accepted warnings.

**B4 DoD:** triggers active ✅ · no code path updates or deletes a posted
financial row ✅ (enforced by the database, not convention) · reversal report
available ✅.

### B5 — Business date & night audit ✅ 🔴

The last load-bearing batch. The system now has a real trading day: a
per-branch `current_business_date` that only advances when the night audit
rolls it, a day-close routine, and frozen `daily_revenue` rows every report
reads from.

- **The business date is stored, not derived.** A hotel's day ends when the
  audit runs (~03:00), not at midnight — a drink sold at 01:30 belongs to the
  previous trading day. Deriving it from the clock would mean the day
  silently advances at midnight while the audit hasn't run, and the two
  disagree. `expectedBusinessDate()` compares the two to work out how many
  days are due.
- **A REAL BEHAVIOUR CHANGE, and the most consequential thing in this
  batch:** check-in used to post the **whole stay** as one folio line the
  moment the guest arrived — always flagged in the code as a stand-in for
  "real PMS behavior (nightly auto-posting)". This is that refinement.
  Posting the whole stay up front put a 5-night stay entirely into the
  arrival day's revenue, so occupancy said 1 room-night while revenue said 5
  and **nothing reconciled**. Now one night posts per night, stamped with
  that night's business date. Leaving both would have double-billed every
  guest, so check-in no longer posts room charges at all.
  - **The gap that opened, and how it's closed:** a guest who checks in and
    leaves before any audit runs would have been billed nothing for the
    room. Check-out now settles any un-posted nights
    (`postOutstandingRoomNights`), so the total owed is identical to before —
    just posted at the right time and attributed to the right nights.
- **Six steps, idempotent and resumable.** Each records its own completion in
  `steps_json`, and every write is keyed so a repeat is a no-op — a night
  audit that double-posts when someone clicks twice is worse than one that
  doesn't run. Room-charge idempotency key: (reservation, business_date,
  category "Room").
- **One transaction per date, never one across several.** If the server was
  off three days, three days are audited in sequence and each commits on its
  own. Batching them means a failure on day three silently discards days one
  and two with no way to tell how far it got.
- **`daily_revenue` is frozen** by the same trigger discipline as B4's
  ledger. Reopening a day **supersedes** the row (`superseded_by_run_id`)
  rather than editing or deleting it, and the reopen is itself a run record
  with an operator, timestamp and reason.
- **Sync KPIs now source from `daily_revenue`** (B5 DoD): a *closed* day is
  read back verbatim so a late void can't make central's number drift from
  what the property reported; the still-open day is computed live using the
  same function the audit will use to freeze it, so there is one definition
  of "a day's revenue" rather than two.
- **Scheduler**: a 15-minute tick, not `node-cron` — the requirement is
  "check whether the day is due", which needs no new dependency, and the
  audit's idempotency makes an extra check free. Disableable via
  `NEXURA_DISABLE_NIGHT_AUDIT_SCHEDULER=1` for tests.
- **`lint:invariants` gained invariant 9**: every insert into
  `folio_charges`/`payments` must set `businessDate`. A row without one drops
  out of `daily_revenue` and the day stops reconciling — the exact failure
  the 30-day test catches, now caught at edit time instead.

**Honest gaps, recorded as real step statuses rather than omitted:**
`close_pos_day` reports **`not_applicable`** (cash drawers are B15); no-show
penalties are **not posted** (`penalty_charge_id` stays null — the amount
comes from B9's cancellation-policy engine, and inventing one would be worse
than posting none); tax and discounts/comps report **0** rather than an
estimate, because B6's engine posts tax as its own ledger rows and a guessed
figure would tie to no line. A run's step list is therefore an accurate
account of what this build actually does.

**Verified — `src/test/night-audit.test.ts`, 10 tests:**
- **The 30-day reconciliation**: a simulated month of 10 overlapping stays
  across 5 rooms — arrivals, multi-night stayovers, departures and a no-show
  — closed day by day. `sum(daily_revenue.room_revenue)` equals the ledger's
  room charges **exactly**, and each frozen day ties to its own night's
  charges with ADR derivable from the same row.
- ADR/RevPAR/occupancy against hand-computed values (3 rooms, 2 sold at
  ₦50,000 and ₦30,000).
- Running the audit twice for one date posts **no duplicate charges**.
- Server off 3 days → the next run posts all 4 nights, in order, and creates
  **one run row per date** (proving each committed independently).
- Business date only moves when the audit rolls it; before the roll hour the
  trading day is still yesterday's.
- `daily_revenue` cannot be edited or deleted.
- A confirmed arrival that never checked in becomes a no-show and is
  recorded.

**Two of my own test fixtures were wrong, not the code** — both caught by
this suite: passing `now` as *midnight* meant the fixture was before the 3am
roll hour, so one fewer day was due than the test assumed. The roll-hour
logic was behaving exactly as its own dedicated test asserts.

**B5 DoD:** business date on every financial row ✅ (lint-enforced) ·
ADR/RevPAR derived from `daily_revenue` ✅ · 30-day reconciliation green ✅ ·
sync KPI payload sources from `daily_revenue` ✅.

---

### Backend Blueprint B6 — Tax engine 🔴 (migration 0006)

**The setting was decorative.** `branches` has carried `tax_name` /
`tax_rate_bp` / `tax_inclusive` since Phase 1, Settings → Hotel Configuration
edits them, and **nothing ever read them**. A property could set "VAT 7.5%,
Exclusive", watch it save, and no guest was ever charged a kobo of VAT. Worse,
the rate did not even persist: the screen sends `taxRate` as a percentage
while the column is `tax_rate_bp`, so the spread in `POST /settings/branch`
wrote a key no column matches and drizzle dropped it silently. A Nigerian
hotel that doesn't charge VAT isn't leaving money on the table, it is
non-compliant with FIRS.

Both halves are fixed, and migration 0006 carries each branch's existing
configuration forward into a real `tax_codes` row — a straight port, not a
new policy: whatever the property configured is what it now charges.

- **`computeTax` is the only tax calculation in the system**
  (`services/tax/engine.ts`), and `postChargeWithTax`
  (`services/tax/posting.ts`) is the only thing that writes a folio charge.
  Every posting path routes through it — night-audit room charges, manual
  folio charges, restaurant orders.
- **Tax posts as separate rows, never folded into the base.** A taxed charge
  is a `base` row plus one `tax`/`service_charge` child per code, each
  carrying `parent_charge_id` and `tax_code_id`. A blended number can't be
  reported per jurisdiction, can't be exempted, and can't be reversed
  independently — and the guest needs the breakdown on the folio.
- **Ordering and compounding are explicit.** Codes apply by
  `computation_order`; a code that compounds on others includes their amounts
  in its base. Nigeria's service charge is applied first and is itself
  VAT-able — that's this mechanism, not a special case. A code may only
  compound on one computed *earlier*; the API refuses the reverse, because
  the engine is a single forward pass and a backward reference would silently
  contribute zero.
- **Inclusive pricing is exact by construction.** `solveInclusiveBase`
  estimates the base from money.ts's closed form, then confirms it with the
  same exact forward pass used for posting, and any residual kobo lands on
  the last inclusive line. Base + tax equals the price the operator typed for
  **every** amount — verified exhaustively for all 10,000 amounts from ₦0.01
  to ₦100.00, and for a compounding inclusive pair where the closed form
  alone is not exact.
- **Rates are effective-dated.** A rate change is a **new row**, not an edit
  (`PATCH` closes the old one and opens a new one), so reprinting last
  month's invoice produces the number the guest actually paid. Back-dating a
  change is refused. Rates resolve against the **business date**, not the
  wall clock.
- **Voids cascade.** Reversing a ₦50,000 room night now also reverses its
  VAT — proportionally on a partial void, sweeping the remainder on the void
  that closes the charge, so repeated partial voids still land on exactly
  zero. A tax line cannot be voided on its own (409): that would leave the
  base charge standing untaxed, which is a different bill.
- **Revenue is net of tax.** `daily_revenue.room_revenue` excludes tax lines
  and `tax_collected` sums them, so ADR and RevPAR stop being overstated by
  7.5%. A service charge stays in revenue — it is the property's own charge,
  remitted to nobody.
- **`lint:invariants` gained a fourth rule**, and it is what makes the DoD
  ("no posting path bypasses the engine") enforceable rather than
  aspirational: any `db.insert(folioCharges)` outside `services/tax/posting.ts`
  fails the build. Three documented exceptions — the helper itself,
  `services/ledger.ts` (reversals mirror already-taxed rows), and `seed.ts`
  (dev fixtures). Verified by injecting a bypass and confirming exit 1.
- **`settings:tax` is a new permission**, separate from `settings:branch`: a
  tax rate is a financial control, not an IT one. The tax fields on the Hotel
  Configuration screen now require it too, so the ability to edit check-out
  times no longer carries the ability to change the VAT rate.

**Not seeded, deliberately:** state consumption tax and service charge. The
blueprint lists both in its Nigerian default set, but consumption tax varies
by state and a service charge is a property's own commercial policy — adding
either on the operator's behalf would start billing guests for something
nobody configured. Both are added through `POST /settings/tax-codes`.

**Two real bugs found by live verification, not by tests:**
1. **A tax code added today didn't apply to today's charges.** `effective_from`
   defaulted to the wall clock, but charges are effective-dated against the
   business date — midnight of the trading day — so a code created at 11:32
   was stamped later than every charge posted that same day. Adding a service
   charge and immediately posting produced no service charge, with nothing on
   screen to explain it. Now defaults to the start of the current trading day
   (and a rate *change* to the start of the next). Locked in by a test.
2. **Permissions added after a database exists never reach it — and this was
   not only B6's problem.** `SYSTEM_ROLE_SEED` is applied only when the roles
   table is empty; afterwards the rows are the live, operator-editable source
   of truth and boot never overwrites them (correct — a manager's edit must
   not be reverted on restart). Checking the dev database against the seed
   showed **B4's `folio:void` never reached Finance or the Resident Officer,
   and B5's `finance:reports` / `finance:reopen_day` never reached Finance**.
   On any upgraded property, voiding a charge and reopening a day — both
   shipped as "complete" — were reachable only by the two roles holding `*`.
   Migration 0006 repairs all of them additively (nothing is ever removed,
   `*` roles untouched, custom roles untouched), and the rule is now recorded
   at the top of `SYSTEM_ROLE_SEED`: **a new permission key needs a matching
   additive UPDATE in that batch's migration.** There is no automated guard
   for this yet — catching it would need a historical seed snapshot to diff
   against, which does not exist.

**Verified — `src/test/tax.test.ts`, 25 tests:**
- **The worked example, line by line**: ₦50,000 room + 10% service + 5%
  consumption + 7.5% VAT → ₦61,875.00, with each line's taxable base
  asserted, matching the hand calculation in the file header.
- Inclusive round-trip (₦50,000 incl. 7.5% → ₦46,511.63 + ₦3,488.37), plus
  the exhaustive 10,000-amount sum-back check.
- Compounding order change alters the total by exactly 7.5% of the service
  charge; category applicability; effective dating across a rate change.
- Exemptions suppress only the exempted code; a long-stay exemption applies
  from the reservation itself without anyone claiming it.
- Void cascade: full (folio returns to exactly zero), proportional partial,
  three uneven partials still landing on zero, and a direct tax-line void
  refused.
- Night audit with tax: revenue net, `tax_collected` populated, and the
  frozen day tying to the ledger with every posted kobo classified as either
  revenue or tax.
- Endpoints: the worked-example endpoint over HTTP, the property-settings
  write-through, rate versioning, back-dating refused, compound-order
  refused, and both permission boundaries.

**A test of mine was measuring its own random number generator.** The
1,000-amount rounding test used a textbook LCG and read its low bits; the
sample never once hit an amount whose tax lands on an exact half kobo (0 of
1,000, against ~25 expected) and reported 73 kobo of drift — eight standard
deviations out, from the generator rather than the engine. Switched to
mulberry32. The blueprint asks for per-line and aggregate tax to agree
"within one kobo"; **they cannot**, and the test now says why instead of
asserting a threshold that happens to pass: 1,000 independent roundings give
an arithmetic bound of 500 kobo, non-tie roundings cancel (σ ≈ 9), and the
~25 exact-half cases round away from zero by policy for +12 expected. What
matters for a folio is the per-line assertion — every guest is charged the
correctly rounded tax on their own charge; nobody is ever billed the
aggregate.

**B6 DoD:** no posting path bypasses the engine ✅ (lint-enforced) · tax lines
are separate rows ✅ · worked-example endpoint matches the hand calculation ✅
(asserted in-process and over HTTP, and run live).

---

### Backend Blueprint B7 — Document numbering & invoicing (migration 0007)

**What gaplessness is actually for.** An invoice number is what an auditor
reconciles against. "Where is ABU-INV-2026-00047?" has exactly two acceptable
answers: *here it is*, or *it was voided, here is the void record and the
reason*. "A transaction rolled back so the number was never used" is not one
of them — it is indistinguishable from a deleted invoice.

- **The number is allocated inside the same transaction as the document.**
  `allocateNumber` deliberately does *not* open its own transaction: doing so
  would commit the bump independently and reintroduce exactly the gap it
  exists to prevent. Every caller wraps it in `immediateTransaction`, and the
  UNIQUE index on `(branch_id, invoice_number)` is the backstop.
- **A voided number is never reused.** The row keeps its number forever, with
  the void reason attached. The obvious alternative — `MAX(number) + 1` at
  insert time — fails both ways: it races into duplicates, and it silently
  reuses the number of a voided top-most document.
- **The prefix carries the branch code** (`ABU-INV-2026-`), so numbers are
  unique estate-wide with no central coordination — which matters because a
  branch issues documents while offline and cannot ask anyone what comes next.
- **An invoice is a snapshot, not a report.** Lines copy the folio charges as
  they stood at issuance and never change. Rendering them live from the folio
  is less code and is wrong: a reversal posted next week would silently change
  a document the guest already holds and possibly paid. Corrections produce a
  **credit note** — its own numbered document referencing the invoice it
  reduces. There is a test that voids a folio charge after issuance and
  asserts the invoice total does not move.
- **Void vs credit note is enforced, not advisory.** An invoice with payments
  recorded against it *cannot* be voided (409 `INVOICE_HAS_PAYMENTS`) — that
  would leave a receipt pointing at a document claiming it was never valid.
- **An invoice payment reaches the folio, not just the invoice.** The folio is
  the ledger; a payment recorded only against the invoice would leave the
  guest's balance overstated and the day's takings understated.
- **One receipt per payment**, enforced by a UNIQUE index as well as a check —
  two receipts for one payment is how a payment gets counted twice in a cash
  reconciliation.
- **`next_number` is not editable.** Forward leaves a permanent gap, backward
  guarantees a duplicate. The prefix is editable only while the series is
  unused (409 `SEQUENCE_IN_USE` once anything is issued), because two
  different-looking numbers sharing one sequence position read as two
  documents when only one exists.
- **The FIRS e-invoicing seam B6 promised exists** (`firs_einvoice_status`,
  `firs_submission_ref`). **Nothing submits yet** — that needs a live FIRS
  integration and credentials, which is not something to fake. The columns are
  there so issuance does not have to be altered later, and their null state is
  honest: "never submitted".

**A gap found while testing, not by design:** `PATCH /settings/document-sequences`
first 404'd for a type with no row yet. Two of the six types (complaint, trip)
are created on first use, so that made their prefix permanently unsettable —
and configuring an unused series is the *only* moment a prefix can safely be
set. It now creates the row, and `GET` lists all six with a `configured` flag
so the screen can offer them.

**Verified — `src/test/documents.test.ts`, 21 tests.** The concurrency
requirement is tested **twice**, because the two versions prove different
things and neither is enough alone:

1. **Real OS-level concurrency**: 8 worker threads, each with its own SQLite
   connection to the same file, allocating 200 numbers. They genuinely
   contend. Result: exactly 1..200, no gaps, no duplicates, and the sequence
   ends exactly where the allocations did. This is the test that would catch a
   missing `BEGIN IMMEDIATE`. What it *cannot* do is load the TypeScript
   service, so it executes the same SQL sequence `allocateNumber` performs.
2. **Through the real service over HTTP**: 100 invoices issued from 100
   folios, asserted sequential with no gaps or duplicates. These interleave
   rather than truly run at once (better-sqlite3 is synchronous, Node is one
   thread) — the honest scope note is in the test. What it proves is that the
   actual code path allocates from the sequence and commits the number with
   the document.

Plus: a failed transaction consumes no number; void preserves the number,
blocks payment, and releases the charges for a corrected invoice; a credit
note reduces the balance while leaving the invoice total untouched;
over-crediting and over-paying are refused; front desk can issue but not void
or credit; housekeeping can do neither.

**B7 DoD:** gapless sequences under concurrency ✅ (proven with real threads) ·
invoices reconcile to folio charges ✅ · credit-note path complete ✅.

---

### Backend Blueprint B8 — Room types, rate plans & availability (migration 0008)

**Two things that were improvised became real: what a room costs, and whether
one is free.**

*Rates were hand-typed.* `POST /reservations` took `rateKobo` from the client
and stored whatever arrived, so the price of a room was whatever the last
person to touch the form said it was. No rate card, no seasonal pricing, no
way to answer "what does a Deluxe cost on the 14th?" without asking someone,
and nothing to tell ₦4,500 from a mistyped ₦45,000.

*Availability was a reservation scan.* That answers "is THIS room free?" but
not "how many Deluxe can I still sell on the 14th?" — the question a booking
engine actually asks — and it gets slower every month the property operates.

- **Availability is a counter, incremented in the booking transaction.**
  `inventory_calendar` holds one row per (type, night); `claimInventory` runs
  inside the same `immediateTransaction` as the reservation insert, so the
  count and the bookings cannot disagree. That is what a nightly recount job
  would otherwise be papering over.
- **The two inventory tables are not redundant.** `room_night_inventory` (B3)
  is per ROOM per night with a UNIQUE index — a *guarantee*.
  `inventory_calendar` is per TYPE per night as a count — an *answer*. The
  first makes double-booking impossible; the second makes "how many left?"
  cheap. Both are needed.
- **Rate resolution order: explicit calendar row → derived → type base rate.**
  Each step exists because the one before can be legitimately absent. A
  derived plan (`Corporate = BAR less 15%`) stores **no rates** and computes
  at read time — storing them means a base-rate change silently leaves every
  derived plan on yesterday's price, which nobody notices until a corporate
  client queries an invoice.
- **A missing rate resolves to `null`, never `0`.** Zero is a real price (a
  comp), so using it for "unknown" would sell rooms free. An unpriced night is
  a quote blocker and a booking is refused with `NO_RATE_FOR_DATE`.
- **Quotes run the same code as postings.** `quoteStay` calls `resolveRate`
  and `computeTax` — the B6 engine every posting path already uses. A quote
  computed a second, independent way is one that eventually disagrees with the
  bill by a kobo, and the guest is the one who notices.
- **Oversell is permitted but never silent.** Selling past `total_rooms` needs
  an explicit `overbooking_limit`; the response carries `warning: "OVERSOLD"`
  and the dates. `sold` is not editable through the API at all — a settings
  screen that could set it by hand would be a way to make the counter disagree
  with the reservations it counts.
- **Stop-sell is distinct from sold-out.** A stop-sell night still reports its
  real availability; it is a commercial decision, not a capacity fact, and
  conflating them hides which one is happening. A stop-sell on a base plan
  closes the night for every plan derived from it.
- **The horizon extends nightly** as night-audit step 4b, and refreshes
  `total_rooms`/`out_of_order` on **future** nights only — a past night's
  total is a historical fact, and rewriting it would change occupancy already
  frozen into `daily_revenue`.

**Backfill (an operating property, not a clean slate):** one room type per
distinct `rooms.type`, base rates seeded from what that type was *actually
last sold at*, every room assigned, a `BAR` base plan per branch,
`rate_calendar` seeded from the rates real reservations were charged, 400 days
of `inventory_calendar` from live room counts, and `sold` reconciled against
existing bookings so availability is right from the first request.

**A real bug found while wiring the counter:** the night audit's no-show
handler only set `status = "no_show"`. The guest's room stayed claimed in
`room_night_inventory` for the entire original date range, so **a room nobody
turned up for could not be resold** for the rest of what would have been their
stay. Both inventories are now released.

**An API contract I broke and then fixed properly.** Replacing the
reservation-scan conflict check changed `ROOM_CONFLICT` (with
`conflictingReservationId`) into `ROOM_UNAVAILABLE` — caught by an existing
test, which is what that test is for. The fix reads the conflicting
reservation id out of `room_night_inventory` itself, so the contract is
preserved *and* improved (it now carries the exact conflicting nights too),
with still no reservation scan.

**Verified — `src/test/availability.test.ts`, 23 tests:** availability
reflects a booking immediately across the whole range and no further (checkout
day is not a night); availability is proven to come from the calendar alone by
inserting a reservation whose nights are *not* in the counter and asserting it
changes nothing; a sold-out night blocks the whole stay naming the dates;
stop-sell blocks while rooms remain physically free; the overbooking limit
permits a controlled oversell, warns, and is itself a hard limit; inventory
cannot be blocked below what is already sold; the derived plan follows a base
rate change (₦50,000→₦60,000 less 15% = ₦51,000); a derivation cycle is
refused; the quote matches `computeTax` line for line **and** matches what the
night audit actually posts to the folio; an unpriced night blocks rather than
sells free; the bulk editor applies to a weekday subset in one transaction;
the horizon extends forward without rewriting history.

**Two of my own test fixtures were wrong again, not the code** — June 2026
starts on a Monday so it has 8 Friday/Saturday nights, not 9; and several
tests used Finance to book rooms, which the role deliberately cannot do.

**B8 DoD:** no code path derives availability by scanning reservations ✅ ·
quotes match posted charges ✅ (asserted end-to-end through a real night
audit).

---

### Backend Blueprint B10 — Reservation lifecycle endpoints (no migration)

**The batch that unblocks the largest block of unwired UI.** Eleven endpoints,
no schema change — B8 already built the tables these operate on.

- **One service owns the risky part.** A date change, a type change, a room
  move and an extension are the same operation underneath — give back what
  the stay holds, then take what it now needs — and every one touches **two**
  inventories (`room_night_inventory`, the per-room guarantee, and
  `inventory_calendar`, the per-type count). So they all go through
  `rebookReservation`, inside the caller's IMMEDIATE transaction. If the two
  ever came apart the symptom would not be an error; it would be a room that
  looks free and is not, found by a guest at the desk.
- **Release-then-claim, and the order is load-bearing.** Extending a stay in
  the same room would otherwise conflict with itself, because the nights it
  already holds are the nights it is asking for. A failed re-claim rolls the
  release back with it, so a refused extension leaves the stay holding exactly
  what it had.
- **Arrivals, departures and the assignment board default to the BUSINESS
  date**, not the wall clock (invariant 9). At 01:30 with a 3am roll hour the
  trading day is still yesterday's, and the night porter working that list
  needs yesterday's arrivals — switching at midnight would lose the guests
  still due in.
- **Cursor pagination, not `?page=`.** Offset paging re-runs the query and
  skips N rows, so a reservation created while a clerk is on page 1 pushes one
  row off the bottom onto page 2 — a guest seen twice, or worse, one never
  seen. Every cursor is `(sortValue, id)`: timestamps and names collide, ids
  do not, so the pair is a total order even when the visible column is not.
- **`walk-in` is a single transaction**: guest → reservation → room assignment
  → check-in → first night posted with tax → deposit. The same sequence as
  five API calls from a browser fails halfway about as often as the network
  does, and the desk is then left repairing records by hand with a guest
  waiting.
- **`assign-room` refuses a different room type unless `allowTypeChange` is
  passed**, and when an upgrade does happen the booked type moves with the
  room so inventory stays truthful. The rate implication is **reported, not
  applied** (`indicativeRateKobo`) — what a guest pays after an upgrade is a
  commercial decision, not an arithmetic one.
- **`extend` does not bill the added nights.** The night audit posts one night
  per night against the reservation's rate (B5), so charging them here would
  double-bill — the same trap B5 fixed at check-in.
- **`no-show` releases both inventories** and reports `penaltyPosted: false`
  with `penaltyPending: "B9 cancellation-policy engine"`. The blueprint says
  this endpoint "posts penalty"; the amount comes from a policy that does not
  exist yet, and charging a real guest an invented figure would be worse than
  charging nothing.
- **`GET /:id` resolves what FD-01 actually renders** — guest, room, type,
  plan, folio, credentials, invoices, history — with `access_credentials`
  selected by **named columns**, because that table carries the raw TTLock API
  response for debugging and a reservation detail view is no place to hand
  that to a browser.

**Verified — `src/test/front-desk.test.ts`, 21 tests**, including the
blueprint's five: an extension refused for an unavailable night leaves
availability *byte-identical* to before; a date change frees the old nights and
takes the new ones in both inventories atomically; a walk-in that fails
part-way leaves no guest, no reservation, no charge and no deposit; a room move
updates both inventories, flips the vacated room to `cleaning`/`dirty`, and
writes an audit row carrying the reason; and the arrivals list follows the
branch's business date, moving when the trading day rolls rather than when the
system clock does.

**Two of my own test fixtures were wrong again** — one asserted room-night
claims on a booking made without a room (a type-only booking holds none), and
one counted other tests' rows as leaked records because the test database is
shared across a file. Both were the test misreading the system, not the system
misbehaving.

**Honest note in the walk-in rollback test:** the deposit insert has no failure
mode that can be triggered without mocking, so the test forces the failure at
the inventory-claim step instead — which still runs *after* the guest, the
reservation and the room-night claim have all been written. The test says so
rather than implying it proved something stronger.

**B10 DoD:** every listed endpoint exists ✅ · all list endpoints paginated ✅
(one shared cursor helper) · race/atomicity tests green ✅.

---

### Execution Plan Phase 0 — the leftovers (no migration)

Cleared after reading all five planning documents together for the first time.
`Nexura-Execution-Plan.md` is the master; the Backend blueprint I had been
executing is one of **two** build tracks, and Phase 0 belongs to neither.

- **0.5 — deleted five unused dependencies**: `@mui/material`,
  `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `react-slick`,
  `react-responsive-masonry`. 55 → 49 direct dependencies. Verified zero
  imports across `src/`, `index.html` and `vite.config.ts` before removing.
  **A correction to the plan, measured rather than assumed:** Doc 5 calls this
  "the single largest first-load win available". It is not — the bundle is
  **byte-identical** before and after (1,211.15 kB, 2,365 modules, same
  content hash), because Vite was already tree-shaking packages nothing
  imported. The real wins are install/CI time and a smaller supply-chain
  surface. The actual first-load problem is elsewhere: **every one of the 80
  screens is eagerly imported — zero `React.lazy` in the app** — which is a
  Phase 3 code-splitting item, not a dependency one.
- **0.4 — merge protocol recorded** in `guidelines/Guidelines.md` §7:
  direction of authority (code is canonical for tokens, Figma for new
  composition only), the four-step export protocol, and the four deliberate
  deletions from the original Figma export that must stay deleted.
- **0.6 — already done**: `npm audit --audit-level=high` gates all three CI
  jobs and Dependabot covers all three packages plus GitHub Actions.
- **0.7 / 0.8 — already done** in B0 (timing-safe sync-key comparison;
  encrypted door-lock credentials).
- **0.1 — downgraded 17 no-op success toasts** across the 22 unwired screens.
  Each claimed an operation that did not happen: *"Refund processed —
  ₦40,000"*, *"Payment recorded"*, *"Walk-in registered · BK-2860 created ·
  Room 102"* (a fabricated booking reference), *"Check-in started"*. All now
  read *"Not available yet — …"* as neutral notices. **The one Doc 5 flagged
  as liability-relevant — the DND wellness check — was already correct**,
  logging at `info`/`warning` rather than `success`.

**Phase 0 items NOT done, and why:** 0.2 (archive the `Nexura-UI` repo) and
0.3 (sync Figma variables to code tokens) are actions on GitHub and in Figma,
outside this repository.

---

### Backend Blueprint B9 — Cancellation, refunds & deposits (migration 0009)

**This is the batch that closes the Execution Plan's Phase 2 exit gate**, and
finding that out was the point of reading all five documents. Doc 5 puts B9
inside Phase 2 and marks Phase 2 🔴 BLOCKING, with an exit gate requiring a
month that reconciles across "arrivals, extensions, no-shows, voids **and
refunds**". The Backend blueprint's own §D order defers B9 to the
"parallel-safe" group — so I had been reporting against the looser of two
conflicting orderings without noticing the stricter one existed.

**It also closes a loop two earlier batches left open, and that loop had a
real cost.** B5's night audit and B10's no-show endpoint both recorded a
no-show with `penalty_charge_id = NULL` and a note saying the amount "awaits
the cancellation-policy engine". Honest at the time — charging a guest an
invented figure is worse than charging nothing — but it meant **a property
running this software absorbed every no-show for free**. Both paths now post
through the engine.

- **The penalty is a TYPE plus a value, never a frozen amount.** Storing
  "₦45,000 penalty" at booking time would freeze a figure the policy says
  should move: a first-night penalty on a stay whose rate was later
  renegotiated has to follow the rate. Five types — `none`, `first_night`,
  `percentage`, `fixed`, `full_stay` — computed at the moment of charging.
- **A percentage is of the STAY total, not one night.** 30% of a single night
  on a week-long booking is a rounding error, not a policy.
- **The free window covers cancellation, never a no-show.** A guest who
  simply never arrives has not cancelled, and letting the window excuse that
  would make it the cheapest way to hold a room for nothing.
- **The preview is mandatory and computed by the same code that charges.**
  A test asserts preview == charge exactly. A preview that differs is how a
  desk ends up arguing about money it has already taken.
- **Cancelling releases both inventories in the same transaction.** A
  cancelled stay still holding its rooms is the most expensive bug in this
  domain — the property cannot sell a room nobody is in. The test does not
  just check availability; it **rebooks the room**.
- **Penalties go through the tax engine** like every other posting path
  (B6 DoD), as their own charge with its own tax line.
- **Cancelling and WAIVING are separate grants.** Without the split, every
  cancellation is free the moment a guest complains loudly enough at the desk.
  A waiver with no stated reason is refused outright.
- **Refunds are request-then-approve, by different people.** Refunding is the
  easiest way to steal from a hotel — it turns a recorded payment into cash
  out of the drawer — so self-approval is a 403, the ledger moves exactly once
  (at completion, as a B4 reversal so the original payment keeps its amount),
  deductions are **itemised** rather than netted, refunding by a different
  method than it was paid needs a stated reason, and anything at or above
  ₦100,000 needs a grant Finance does not hold.
- **A deposit is a LIABILITY, not revenue.** Holding one deliberately does
  *not* touch the folio: until the guest stays, the hotel is holding someone
  else's money. The three outcomes are three different journal entries —
  APPLIED creates a folio payment, REFUNDED discharges it, **FORFEITED posts
  a taxed revenue charge** so kept money lands in the day's income instead of
  vanishing into a status change.

**Verified — `src/test/cancellation.test.ts`, 25 tests**, including the
blueprint's five: the penalty matrix hand-computed against a 4-night ₦200,000
stay; cancellation freeing inventory such that the room is *actually*
rebookable; waiver without permission → 403; a deposit applied then partially
refunded reaching a liability of **exactly zero**; and a refund above the
threshold requiring the elevated grant.

**Four of my own test fixtures were wrong, not the code** — and one was
instructive. Every penalty came back as zero at first: the fixture pinned
stays to fixed calendar dates weeks in the future, so the free-cancellation
window (measured against the real clock) legitimately made them all free. The
dates are now relative to `new Date()`, with the reasoning recorded in the
file. The others: a room type with no rooms has no inventory (so every booking
correctly 409'd), Finance has no `reservations:create` grant (so booking as
Finance correctly 403'd), and I passed a reservation object where an id was
expected.

**One honest wart:** a deposit fully released as part-applied/part-refunded
reports `partially_refunded`, which reads oddly for something with nothing
outstanding. The blueprint's status enum has no term for a mixed full
release; `released_at` is what marks it closed. Left as specified rather than
inventing a sixth status.

**B9 DoD:** no cancellation without financial resolution ✅ · deposits tracked
as liability ✅ · refunds fully audited ✅.

---

---

### Backend Blueprint B17 — Security hardening 🔴 PILOT BLOCKING (no migration)

**Execution Plan Phase 5.** Seven tasks; the one that mattered most was the
one I ran first.

**B17.7 — the permission audit, and it found real holes.** "Every route
declares a permission" is a claim about code that does not exist yet as much
as code that does, so it is a test that enumerates all 215 routes and forces
each into one of three explicit buckets: permission-gated, authenticated-only
(with a written reason), or public (with a written reason). Anything else
fails the build. **A forgotten route looks identical to a deliberately open
one, and that ambiguity is the whole problem.**

It flagged 21 undeclared routes. Nineteen were legitimately
authenticated-only — several are authorised *in-handler* by rules a permission
key cannot express (`isSelfOrManager` on a staff profile, channel membership
on chat, per-department row scoping on the department report) — and each now
carries a stated reason. **Two were genuine defects:**

- **`GET /dashboard/overview` had `requireAuth` and nothing else.** The screen
  is called *Management* Overview and returns the property's 7-day revenue
  trend, occupancy and ADR. Every authenticated member of staff — a
  housekeeper, a waiter — could read it. Now gated on the same grants the
  revenue reports use.
- **`GET /users/` returned every colleague's email address** to anyone with a
  login: a staff-directory dump and the raw material for a phishing run. The
  endpoint stays open because it is the picker behind every "assign to…"
  dropdown, which needs names and ids — it never needed emails. Contact
  details are now returned only to roles that manage people or accounts.

**B17.4 — hard lockout removed, and that is a security *improvement*.** Five
wrong passwords used to lock an account for 15 minutes. That looked like a
protection and was a denial-of-service: anyone who knew a colleague's email
could lock them out of their own shift in five requests, and there is no IT
desk at 2am. Replaced with exponential backoff keyed on **IP + account** — two
free attempts, then a growing delay capped at five minutes, and **no permanent
lockout ever**. Plus `express-rate-limit` (strict on `/auth`, generous
globally — a front desk legitimately makes hundreds of calls a minute during
check-in rush) and an IT unlock that clears an account across every address.

**B17.5 — the signing key is encrypted at rest.** It signs every token for the
property: anyone holding it can mint a token for any role without touching the
database or leaving a login record, and it sat on disk as plaintext PEM. Mode
0600 protects it from other accounts on a running system; it does nothing
about a stolen PC, a disk pulled from a dead machine, or a backup on a USB
stick. Now AES-256-GCM under a key derived from a hardware identifier **plus**
an operator passphrase — the machine binding stops a copied file, the
passphrase stops a stolen machine. Production **refuses to boot** without the
passphrase. Rotation keeps the previous public key for an overlap window,
because rotating without one signs the entire shift out at the same instant.

**Honest limits, stated in the code rather than implied:** a hardware
identifier is not a TPM, and full-disk encryption remains a runbook
requirement underneath.

**B17.1/2/3/6** — production refuses to bind all interfaces (fatal, not a
warning: the thing being warned about is "the API is reachable from guest
wifi"); CORS moved from `origin: true` (which with `credentials: true` let
*any* site a logged-in staff member visited read this API) to an explicit
allowlist, empty by default in production because the packaged image is
same-origin; helmet with a CSP that has no `unsafe-inline` for scripts; and
failed logins now record the attempted address as a **salted hash** rather
than verbatim — people type passwords into the email field, and an audit log
readable by `admin:operations` should not accumulate them.

**Verified — 18 new tests** across `route-permissions.test.ts` (5) and
`security.test.ts` (13), plus 3 rewritten in `auth-login.test.ts`. The
blueprint's list is covered: the key file is not valid PEM on disk while
tokens still verify; rotation keeps old tokens working during the overlap and
fails them after; a cross-origin write is rejected; production refuses to bind
all-interfaces; and repeated logins throttle without locking anyone out.

**My own enumeration test caught a bug in my own implementation.** The
unknown-account branch recorded the failure but still answered 401 while a
real account answered 429 — making the status difference a free
account-enumeration oracle, which is precisely what that code was meant to
prevent. Both paths now respond identically.

**A test-hygiene defect found in live verification:** the security suite calls
`rotateSigningKey()`, which was operating on the **real dev key directory** —
running the tests signed out every live session, and on a machine also serving
a property that would be an outage caused by CI. The key directory is now
overridable (`NEXURA_KEYS_DIR`) and the suite uses a temp path.

**Live-verified:** fresh provisioning wrote an encrypted key with no plaintext
copy; the boot log reports its posture (mode, bind, overlay, CORS, cookie
flags); CSP/nosniff/frame/referrer headers present; a cross-origin write got
403; front desk got 403 on the management overview while Finance got 200; and
staff emails were absent for both non-HR roles.

**B17 DoD:** no plaintext signing key ✅ · every route permission-declared ✅
(enforced by test) · rate limiting active ✅ · no plaintext HTTP in production
— **partially**: the bind guard, secure cookies and HSTS are in place, but TLS
itself is delivered by the mesh overlay, which is a deployment step. The server
detects and reports whether it is on one; it cannot install it.

---

### Backend Blueprint B18 — Update channel signing & rollback 🔴 PILOT BLOCKING (migration 0010)

**The Production blueprint calls the unsigned auto-update channel "the highest
severity in the repo", and it was right.** The updater resolved a *mutable*
Docker tag and swapped the running container: anyone who could push to that
tag — a compromised registry account, a typo-squatted repository, anyone on
the network path — executed arbitrary code as root on every property
simultaneously, with no human in the loop and no record of what changed.

- **Signature verification is the core, and it fails CLOSED everywhere.**
  Every failure mode returns a non-verified status; there is no path that
  returns success on error, no "could not check, assume fine", and no flag
  that skips it. An empty trust set refuses *everything* — and a malformed
  `NEXURA_UPDATE_TRUSTED_KEYS` is treated as no trust rather than skip, so a
  typo in a deploy variable cannot open the gate.
- **The signature covers the DIGEST, not the tag.** Signing a mutable pointer
  would mean nothing. The tag resolves to `sha256:…` once, the signature is
  verified over that, and the pull is by digest — so what was verified is
  necessarily what runs. Verifying a tag and then pulling it leaves a window
  in which the tag moved, which is the attack, not a theoretical race.
- **Trust is pinned in the build, never fetched with the image.** A signature
  checked against a key supplied by whoever supplied the image proves only
  that they can sign their own work.
- **Automatic rollback.** A property takes an update at 04:00, the container
  never comes up healthy, nobody is awake. The swap now polls health for a
  bounded window and, on failure, restores the previous digest unattended and
  records that it did. A swap that fails *outright* is reported as `failed`,
  not `rolled_back` — the old container is still running, and claiming a
  rollback that never happened would be a false record.
- **Ringed rollout** (`canary` → `early` → `general`), defaulting to the
  **safest** ring: a branch whose ring failed to sync receives fewer updates,
  not more.
- **Schema-downgrade refusal**, pairing with B1's future-schema guard from the
  other side: B1 stops an old binary opening a new database, this stops us
  installing that binary at all.

**My own test caught an inverted comparison in the ring logic** — as written,
a canary-only release would have been accepted by *every property in the
estate*, which is precisely the blast radius rings exist to avoid. The
direction is now asserted in both directions with a comment explaining why.

**A second real fix from a failing test:** the rollback path updated the
health fields but never re-asserted `current_image_digest`, so a property that
had rolled back could still report the *failed* digest as current — the one
question that record exists to answer.

**Verified — `src/test/updater.test.ts`, 23 tests, with real ECDSA key pairs
generated at test time.** Covers the blueprint's six: unsigned → refused with
no swap attempted; wrong key → refused; a signature lifted from another
release → refused; general-ring branch ignores a canary release; schema
downgrade refused; and a health-check failure rolling back to the prior digest
with the property still serving.

**WHAT IS NOT VERIFIED, stated plainly rather than implied.** There is no
Docker daemon and no registry in this environment, so:
- the **container swap itself** is not exercised — `swap` and `probeHealth`
  are injected, which is *why* the orchestration around them (the part that
  decides to roll back) is fully tested while the shell-out stays honestly
  unverified;
- **tag → digest resolution against a live registry** is implemented to the
  Registry V2 spec but only exercised against its own logic;
- **CI-side `cosign sign`** is a pipeline change, not application code, and
  has not been written;
- `fetchReleaseSignature` **returns null (= unsigned) as a deliberate stub** —
  so the unfinished half fails closed and refuses every update, rather than
  looking like it works. When CI starts publishing signatures, that one
  function is what changes.

**Live-verified:** schema version 10, ring defaults to `general`,
`trustedKeyCount: 0` / `updatesPossible: false` — this build refuses every
update, correctly, because no release-signing key exists yet. The posture
endpoint surfaces that explicitly, because "updates are silently not
happening" and "updates are being correctly refused" otherwise look identical
from outside.

**B18 DoD:** unsigned images cannot be deployed ✅ (enforced in code and
tested) · a broken update self-heals ✅ (orchestration tested; the Docker call
is not) · digest and signature status visible ✅ locally at `/updates/status`
— **centrally is pending B20's sync payload work.**

---

### Backend Blueprint B19 — Backups & observability 🔴 PILOT BLOCKING (migration 0011)

**Two failures, both of which end with a hotel losing data and nobody having
noticed in time.**

**1. An untested backup is not a backup.** What existed was
`sqlite.backup(dest)` — a file, with its size recorded next to it. Nothing
verified it was readable, nothing detected a truncation from a full disk,
nothing was encrypted, and no snapshot had ever been restored. A property
finds out which of those mattered on the one morning it needs a backup.

Four things now make it real: **VACUUM INTO** rather than a file copy (SQLite
runs in WAL mode; copying the `.db` alone captures a database missing
everything still in the `-wal`); a **checksum over the plaintext**, so it
verifies the database rather than the envelope; **AES-256-GCM encryption**,
because a backup is a full copy of every guest's personal data and the copy
most likely to end up on a USB stick; and **an automated restore test** that
decrypts into a scratch file, opens it as a real database, runs
`integrity_check` and a validation query set. A snapshot that fails is marked
`unrestorable` so it can never be offered as a recovery point.

The restore test runs **on every scheduled backup**, not monthly as the
blueprint suggests — it takes seconds on a property-sized database, and a
monthly cadence means up to a month of snapshots nobody has proven
restorable. The thing that makes a backup real should not be the thing that is
easiest to skip.

**Retention never deletes the last verified snapshot**, whatever the policy
says. A retention rule that can leave a property with zero recovery points is
a data-loss mechanism wearing a housekeeping costume.

**2. A dead property is silent.** A branch whose server died at 02:00 sends no
error and looks exactly like one that is quiet, so the alert has to be
**expected-and-missing**: a heartbeat every 60s carrying disk, WAL size, error
count, queue depth, schema version and clock offset. Kept **locally as well as
pushed** — the moment central most wants this data is when the uplink is down,
and unpushed samples are deliberately exempt from ring-buffer pruning because
they are the record of the outage itself.

**The health endpoint could not previously fail.** It was
`res.json({ ok: true })` — a hardcoded literal that reported healthy while the
disk was full, while the database was read-only, and while migrations had
failed, because it never asked anything. **B18's automatic rollback watches
this endpoint**, so a health check that cannot fail would have told it a broken
build was fine. It now runs five probes that can each genuinely fail, and
returns **503** when the property cannot operate.

The database probe **actually writes** — inside a transaction that is always
rolled back. A read-only filesystem or a stale lock presents as a database that
opens perfectly and refuses the first INSERT, which a clerk experiences as a
check-in that will not save, next to a green indicator.

**The disk guard refuses work that only ADDS data** while leaving check-out,
payment, day-close, login and backup working. A property at 400 MiB free must
still be able to settle a bill and release a room; blocking everything would
strand guests in rooms the system refuses to free.

**Verified — `src/test/backup-health.test.ts`, 19 tests**, all against real
databases and real encryption. Covers the blueprint's six: a backup taken
*during* active writes restores; a corrupted snapshot fails its checksum and is
marked unrestorable; the restore test detects a truncated file; the health
endpoint reports unhealthy and returns 503; and the disk guard's essential-path
split is asserted route by route.

**Two real defects found while testing.** `backup_snapshots.created_by` was
`NOT NULL` — a *scheduled* backup has no operator behind it, and inventing a
fake user id to satisfy the constraint would have put a fiction in the audit
trail; the migration rebuilds the table to make it nullable, copying rows
rather than discarding them. And B1's **checksum guard correctly refused to
start** when I edited an already-applied migration, which is precisely what it
exists for — the dev database was restored from the runner's own pre-migration
snapshot.

**Live-verified on the real dev database:** a snapshot was taken, encrypted
(`enc.v1.…` on disk, not `SQLite format 3`), and then genuinely restored and
validated — schema v11, 7 users, 9 reservations, 32 folio charges. The health
endpoint reports `degraded` with two honest warnings rather than a fabricated
all-clear.

**Honest gaps:** offsite replication (B19.3) has its schema and status
tracking but **no transport** — there is no configured remote to replicate to,
and a stub would look like protection that does not exist. Central fleet
dashboard endpoints (B19.8) are central-server work pending B20's sync
payload. Clock-offset detection catches a clock that *jumped while running*,
not one that was wrong from boot — that needs central's timestamp.

**B19 DoD:** encrypted checksummed backups with verified restores ✅ ·
heartbeat recorded and queued ✅ (central-side alerting pending B20) · health
endpoint meaningful ✅.

---

### Backend Blueprint B23 — Payments gateway & POS terminal (migration 0012)

**Until now a payment was a row someone typed.** An amount, a method, a name.
Nothing connected it to a card actually being charged, nothing detected the
same charge being taken twice, and nothing reconciled what the bank paid out
against what the property recorded.

**The property that matters most: a retry never double-charges.** A card
payment that times out is the NORMAL case on a Nigerian hotel's uplink, not an
edge case — the clerk sees a spinner, the guest's phone shows a debit alert,
and the clerk presses again because from where they stand nothing happened.
Without an idempotency key that second press takes a second ₦85,000 off a real
person's card. The key is UNIQUE per branch at the database level and a repeat
returns the ORIGINAL transaction; a **missing** key is refused rather than
generated, because generating one would make every call unique and silently
remove the protection the caller believes it has.

**A checkout is never blocked on gateway reachability.** An unreachable
gateway is *not* a declined card — conflating them has a clerk tell a guest
their card was refused when it was never presented. Cash and a standalone POS
terminal keep working and record as `pending_verification` for a later sweep;
card is refused with instructions to use a channel that works. Verification
failing later does **not** mark a real payment failed: marking it so because
we could not *ask* would delete a payment that happened.

**Webhooks are signature-verified and replay-safe.** An unsigned webhook is an
unauthenticated instruction to mark money as received — the most valuable
forgery available against a hotel. Signatures use `timingSafeEqual`, the raw
body is preserved (re-serialising parsed JSON produces different bytes that
never match), and the gateway's event id makes a redelivery a no-op. Duplicates
and unknown events both answer **200**, because a gateway retries anything
non-2xx forever.

**Settlement variance is surfaced, never absorbed.** It would be easy to make
the numbers agree by adjusting the recorded side to match the bank; that turns
a detectable loss into a silent one. A payout is checked in *both* directions —
references it claims that we have no record of, and successful transactions it
omits — and a transaction the payout skipped stays `unsettled` so it appears in
the next reconciliation rather than ageing out. Signing off **acknowledges** a
variance; it never erases it.

**Verified — `src/test/payments.test.ts`, 22 tests** covering the blueprint's
five, plus the converse cases that matter: different keys are *not*
deduplicated, a retried decline still reads as declined, and a channel a
provider cannot take is refused up front from its declared capabilities rather
than attempted.

**Four real defects found while testing, three in my own code:**
1. The `FakePaymentProvider` kept its ledger **per instance**, but
   `providerFor()` builds a fresh provider per call — so `verify()` never
   recognised a reference `initiate()` had just created. A stand-in that
   cannot model "the gateway knows about this charge" is not a useful
   stand-in.
2. `postPaymentToFolio` fell back to the **branch id in a user column** when a
   webhook had no actor — caught by a foreign-key violation. Folio rows from a
   webhook are now attributed to the clerk who *initiated* the transaction,
   rather than to an invented system user that would put a fiction in the cash
   reconciliation.
3. The **route audit** (B17.7) caught that B23's permission keys existed in
   the migration but never in the vocabulary, and that the webhook was
   unauthenticated without being declared.
4. `lint:invariants` caught an open-coded `/ 100` in the terminal instruction
   string — invariant 2, in code I had just written.

**And one from the OpenAPI lint:** `/payments/webhook/{provider}` is genuinely
ambiguous with `/payments/{id}/verify` — a POST to `/payments/webhook/verify`
could match either, and which wins depends on registration order. The webhook
moved to its own `/payment-webhooks/{provider}` mount.

**WHAT IS NOT VERIFIED.** There are no gateway credentials in this
environment, so the **Paystack adapter's HTTP calls are unexercised** — request
shapes, field names and the signature scheme come from the published
documentation and are correct as far as reading can make them, which is not the
same as correct. Everything above runs against `FakePaymentProvider`, which
implements the same interface: the seam exists precisely so the money logic can
be verified without a live card being charged in CI, and pointing this at a
Paystack test account is a configuration change rather than a rewrite.
Flutterwave and Moniepoint adapters are **not written**; `manual` (cash) is,
and declares honestly that it has no gateway and no webhook.

**Live-verified:** schema 12, gateway configured, and the same idempotency key
posted twice produced **one** transaction (`replay: true` on the second) — one
row in the database for two button presses. An unsigned webhook was refused
with 401 before anything in it was read.

**B23 DoD:** no double-charge under retry ✅ · webhooks verified and idempotent
✅ · checkout works offline ✅.

## Backend Blueprint status

**Every 🔴 PILOT BLOCKING batch is complete, plus B23** (B0 → B1 → B2 → B3 →
B4 → B5 → B6 → B7 → B8 → B9 → B10 → B17 → B18 → B19 → B23). 314 local-server
tests + 6 central-server, three clean typechecks, `lint:invariants --strict` enforcing
invariants 2, 3, 9 and the B6 no-bypass rule, a route audit forcing every
endpoint to declare its access, and a valid 229-endpoint OpenAPI spec.

**Execution Plan Phase 5 (Security & deployment) is complete on the backend
side.** Its exit gate — "unsigned image rejected; deliberately broken update
auto-rolls-back; encrypted restore succeeds unattended" — is met in code and
in tests, with the Docker-dependent halves flagged as unverified rather than
claimed.

**Against the Execution Plan (`Nexura-Execution-Plan.md`, the master document):
Phase 0 is clear, Phase 1 is complete, and Phase 2 now genuinely meets its
exit gate** — B9 was the missing 2.4, and without refunds the "arrivals,
extensions, no-shows, voids and refunds" reconciliation could not have been
run at all.

**Still open in Phase 2, and both are UI, not backend:** 2.6 the Night Audit
screen (Doc 3 calls it "the single most important missing screen") and 2.7 the
Tax Config / Refund / Void screens. Every endpoint they need now exists.

**The backend is four batches ahead of the frontend.** 60 of 80 screens are
wired; the 20 that are not include `ReservationDetail`, `ReservationSearch`,
`RateManagement`, `InvoiceReceipts`, `WalkInReg`, `RoomAssignmentBoard` and
`CancellationRefund` — precisely the screens B7, B8, B9 and B10 were built to
serve. Phase 3 (UI foundation) is now **complete** (12/12, see
`UI-ADOPTION-TRACKER.md` §3); wiring has started, with `ArrivalsScreen` and
`DeparturesScreen` live.

### B10.1 — Arrival & departure times 🟡 UI-BLOCKING, NOT STARTED

**Found 2026-08-16 while wiring Arrivals and Departures.** Three columns the
Figma design calls for have no backing field, so they render "—":

| Screen | Column | Missing |
|---|---|---|
| Arrivals | ETA | `reservations.expected_arrival_time` |
| Departures | Checkout Time | branch default + per-stay override |
| Departures | Late Checkout | `late_check_out_until` + approver |

`reservations` stores whole business dates only. The mock filled these with
`14:00` / `11:00` / a "Late Checkout" badge that nothing produced. The columns
were kept and left empty rather than deleted or filled with invented values.

**This is not cosmetic.** Late checkout decides whether housekeeping can turn
a room for the next arrival and whether a fee is due; an ETA is what lets a
front desk sequence twelve simultaneous arrivals. Full spec is B10.1 in
`Nexura-Backend-Build-Blueprint.md` — three nullable columns and two branch
settings. **It should ride along with whichever backend batch comes next**
rather than waiting for a slot of its own.

When it lands, the `—` placeholders and their explanatory comments in
`ArrivalsScreen.tsx` and `DeparturesScreen.tsx` come out in the same change.

B9 live check: migration 0009 applied to schema version 9, the STANDARD 24h
policy seeded per branch, a cancellation preview correctly reported ₦0 inside
the free window and cancelled cleanly, and a ₦50,000 deposit held → ₦30,000
applied → ₦20,000 refunded reached an outstanding balance of exactly 0, with
only the applied ₦30,000 ever reaching the folio.

**Next in the blueprint's pilot-critical order:** **B24** (printing — folio,
receipt, registration card, kitchen ticket), the last item in the
pilot-critical chain.

**But the larger question is sequencing, not the next batch.** The backend is
now six batches ahead of the frontend: 58 of 80 screens are wired, and the 22
that are not are exactly the ones B7–B10 were built to serve. Doc 5's Phase 3
(UI foundation) was specified to run parallel to Phase 2 and has not started,
and Doc 3 calls the Night Audit screen "the single most important missing
screen" — its endpoints have existed since B5.
