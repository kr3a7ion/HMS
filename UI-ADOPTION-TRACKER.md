# Nexura — Figma UI Adoption Tracker

Working checklist for adopting the Figma Make export into `apps/web`.
One line per item, checked off as it lands, so nothing is left behind.

**Companion to `ROADMAP.md`** (authoritative build status) and
`guidelines/Guidelines.md` §7 (the merge protocol this follows).

---

## 0. Provenance

| | |
|---|---|
| Source | `https://github.com/kr3a7ion/Nexura-UI.git` |
| Adopting commit | `aa66a30` — "Update files from Figma Make", **2026-08-16** |
| Previously analysed | `f78f8ad` (2026-07-24) — the commit Doc 3 §1.1 assessed |
| Working copy | scratchpad clone, read-only. **Never cloned onto a branch.** |

### What changed since Doc 3 assessed this repo

Doc 3's headline finding was *"`Nexura-UI` is the original Figma export and main
is a strict superset; merging would cause significant regression."*
**That is no longer the situation.** The August commit is +17,151 / −4,079: it
replaced `ScreensA/B/C` with domain files, added a 3,759-line `UIKit.tsx`, and —
decisively — **carries the correct rebrand tokens.**

| Check | Aug 16 export | main | Verdict |
|---|---|---|---|
| Nav navy `#0F2044` | ✅ | ✅ | aligned |
| Primary `#123A73` | ✅ | ✅ | aligned |
| Teal `#1BA39C` | ✅ | ✅ | aligned |
| Plus Jakarta Sans / JetBrains Mono | ✅ | ✅ | aligned |
| Old zinc `#18181B` / sky `#0EA5E9` | **absent** | absent | drift resolved |

Phase 0.3 (sync Figma variables to code tokens) was evidently done in Figma.
That removes the single thing that made every previous export toxic.

### What has NOT changed

A wholesale merge would still destroy:

| Asset | Export | main |
|---|---|---|
| File structure | 8 monoliths, ~18k lines | 80 module files |
| API wiring | 1 file references `lib/api` | **84 files** |
| Router / `useParams` | **0 files** | 76–78 files |
| Auth | `DEMO_ACCOUNTS` lookup | real auth |

**The protocol is unchanged and non-negotiable:** port screen by screen, never
run the export over the repo, delete the working copy when done.

---

## 1. Verified inventory

| | Count |
|---|---|
| Export components, total | **116** |
| — screens in the 8 domain files | 85 |
| — inside `UIKit.tsx` | 31 (**17 full screens** + 14 UI components) |
| main screens | 80 |
| **Genuinely new — to adopt** | **21** |
| **Main screens absent from the export** | **0** |

> **A correction worth recording.** The first pass reported "0 lost" by
> comparing all 116 names at once — which let UIKit's generic component names
> absorb matches. Recomputed screens-only it showed **17 apparently missing**;
> those 17 then turned out to all live inside `UIKit.tsx`. The conclusion held,
> but was not established until the third check. Any future count must exclude
> UIKit before comparing.

---

## 2. Cross-cutting prerequisites

- [ ] **P1 — Route params.** Export has `useParams` in 0 files; every ported
      detail screen needs its route params reconnected by hand.
- [ ] **P2 — `SCREEN_ROLE_MAP` entries** for all 21 new screens, matching the
      server permission keys that gate their endpoints.
- [ ] **P3 — Extraction convention** — monolith → `screens/<module>/<Name>.tsx`,
      one screen per file (Guidelines §2).
- [ ] **P4 — Decide UIKit's fate** (see §8).
- [ ] **P5 — `theme.css` delta review** — the export changed it by 195 lines.
- [ ] **P6 — `constants.ts`** (was `data.tsx`) — types/helpers only; mock arrays
      deleted as each screen is wired.

---

## 3. UI foundation — Execution Plan Phase 3 (NONE of this exists)

Doc 3 §2–3. **Verified absent from `apps/web`.** Doc 5 specifies this should
have run *parallel to Phase 2*; it never started. Every adopted screen depends
on it, and retrofitting after 100+ screens exist is the single most expensive
mistake available here (Doc 3 §2.3).

- [x] **F1 — Adaptive tiers (T1–T4).** `lib/tier.ts`. **T1 is declared by the
      shell, never inferred** — T1 (360–420px) and T2 (390–430px) overlap by
      width, because T1 is a *device class* (gloved, arm-strapped) not a
      viewport. No media query can separate them. Exposes `touchTarget`,
      `prefersTable`, `hasHover`, `sheetSide`, `prefersScan` so components read
      a rule rather than re-deriving `tier === "T4"`.
- [x] **F2 — `<OfflineBanner>`** — `components/OfflineBanner.tsx`, driven by
      `lib/connection.ts`. **Replaced a demo prop**: the old banner was fed by
      a manually-toggled boolean (*"Click to simulate offline"*) and claimed
      *"Changes will sync automatically when reconnected"* — untrue, there is
      no client write queue. See the log.
- [x] **F3 — `<DataView>`** — table at T4, cards at T1–T3, from ONE column
      array so the two shapes cannot drift.
- [x] **F4 — `<AsyncBoundary>`** — distinguishes unreachable / forbidden /
      other, and suppresses retry on a 403 where retrying cannot help.
- [x] **F5 — `<MoneyText>` / `<MoneyInput>`** — kobo in, kobo out.
      `MoneyInput` holds raw typed text and formats only on blur, so `1250.5`
      stays typeable.
- [x] **F6 — `<ConfirmDestructive>`** — reason required (most destructive
      endpoints reject an empty one server-side); typed phrase is opt-in, for
      irreversible actions only.
- [x] **F7 — `<AuditTrail>`** — **Doc 3 was wrong that the sources "already
      have the shape"**: `WorkOrderEvent`/`KeyCardEvent`/`AuditLogEntry` use
      three names for the verb, two for the timestamp, two for the note. One
      normalised event plus an adapter per source, all in one file.
- [x] **F8 — `<ScanInput>`** — camera and NFC are **capability-gated**:
      `BarcodeDetector` is Chromium-only, Web NFC is Android-Chrome-only. Where
      absent the button is not shown, never shown-and-broken. Manual entry is
      always present and styled first-class.
- [x] **F9 — `<RoleGate>`** — **required a backend change**: `/auth/me`
      returned no permissions, so the client could only gate by role name.
      Now returns `permissionsForRole()`. Fails OPEN on unknown (see the file
      for why) — it is an affordance, never the control.
- [x] **F10 — TanStack Query** — installed and mounted with LAN-tuned
      defaults. **Mutations never auto-retry** — retrying a write risks
      double-posting a charge.
- [x] **F11 — Navigation rebuild.** `routes.tsx` is now the only source of
      truth: 83 routes (80 screens + 3 dual-path variants), each carrying its
      path, label, roles and module. The `Screen` union, `SCREEN_ROLE_MAP`,
      `DOOR_LOCK_SCREENS`, the `NAV` tree and the 90-branch `Router` switch are
      all deleted — **−445 lines from `App.tsx` and `data.tsx`**. The sidebar,
      `<Routes>`, role filtering, module gating and the header title all derive
      from it, and a dev-time assertion fails the build if a sidebar entry
      points at a route that does not exist. Screen and title are read from the
      URL rather than held in state, so reload, bookmark and back all work.
- [x] **F12 — `tokens.ts`** — authoritative; `theme.css` and `data.tsx` become
      mirrors, and the `data.tsx` re-exports die as screens are ported.

---

## 4. New screens — backend READY (adopt first)

Backend exists and is tested. Highest-value, lowest-risk ports.

| # | Screen | Backend | Endpoints it needs | Status |
|---|---|---|---|---|
| A1 | **NightAudit** | B5 ✅ | `/night-audit/status`, `/preflight`, `/run`, `/runs`, `/daily-revenue` | ☐ |
| A2 | **TaxConfiguration** | B6 ✅ | `/settings/tax-codes`, `/tax-exemptions`, `/tax-codes/preview` | ☐ |
| A3 | **FolioVoidReversal** | B4 ✅ | `/folios/:id/charges/:cid/void`, `/payments/:pid/void` | ☐ |
| A4 | **RoomTypeManagement** | B8 ✅ | `/room-types` (GET/POST/PATCH/DELETE) | ☐ |
| A5 | **RateCalendar** | B8 ✅ | `/rate-calendar`, `/rate-calendar/bulk`, `/rate-plans` | ☐ |
| A6 | **AvailabilityBoard** | B8 ✅ | `/availability`, `/inventory-calendar` | ☐ |
| A7 | **RefundProcessing** | B9 ✅ | `/refunds`, `/refunds/:id/approve`, `/reject` | ☐ |
| A8 | **CreditNotes** | B7 ✅ | `/invoices/:id/credit-note`, `/invoices` | ☐ |
| A9 | **SchemaUpdateStatus** | B18 ✅ | `/updates/status` | ☐ |
| A10 | **ErrorLog** | IT-02 ✅ | `GET /admin/error-log` (`admin:manage`) | ☐ |
| A11 | **LeaveManagement** | HR ⚠️ | `POST /hr/leave-requests`, `/:id/decide` — **no LIST endpoint** | ☐ |

- **A10 verified ready** — `GET /admin/error-log`, gated on `admin:manage`.
- **A11 PARTIAL, and a real gap.** The backend can *create* a leave request and
  *decide* one, but **nothing lists them** — only a `pendingLeave` count folded
  into the HR dashboard. A management screen needs a list. Either a small
  `GET /hr/leave-requests` is added first, or the screen ships with its list
  reading "Not available yet" and the gap is recorded here. **Do not adopt A11
  until that is decided.**

---

## 5. New screens — backend MISSING (blocked)

Adopting these now would produce screens with no data behind them — exactly the
no-op-control problem Phase 0.1 just fixed. **Do not wire these until the batch
lands.** If adopted early for layout, every control must read "Not available
yet", never a success toast.

| # | Screen | Needs batch | Status |
|---|---|---|---|
| B1 | CashDrawerReconciliation | **B15** (restaurant / cash drawer) | ☐ blocked |
| B2 | PrintSettings | **B24** (printing service) | ☐ blocked |
| B3 | AccountingExport | **B33** (accounting export) | ☐ blocked |
| B4 | ComplaintDashboard | **B28** (complaints & SLA) | ☐ blocked |
| B5 | ComplaintManagement | **B28** | ☐ blocked |
| B6 | DispatchBoard | **B25** (fleet: schema & trips) | ☐ blocked |
| B7 | NewTripRequest | **B25** | ☐ blocked |
| B8 | TripDetail | **B25** | ☐ blocked |
| B9 | DriverRoster | **B25** + B22 (`DRV` role) | ☐ blocked |
| B10 | FleetCosting | **B26/B27** (fuel, generator) | ☐ blocked |

**Ten blocked screens map onto five backend batches** — a strong argument for
finishing B24 (already next in the pilot-critical chain) and then B15.

---

## 6. Main's OWN unwired screens — Execution Plan Phase 4

**A separate workstream from the export, and easy to forget.** 22 of main's 80
screens were never wired to the API. Doc 3 calls WP-1 *"demo-fatal"*. They need
wiring whether or not we take the export's composition — the export's versions
are unwired too.

**11 can be wired TODAY** against backends already built and tested:

| ☐ | Screen | Backend | Endpoints |
|---|---|---|---|
| ☐ | `ReservationDetail` | B10 ✅ | `GET /reservations/:id` (enriched) |
| ☑ | `ReservationSearch` | B10 ✅ | `GET /reservations/search` — **done**. Status dropdown and both date inputs were decorative (no state, reached nothing); search filtered a mock in the browser. **Filters now live in the URL** (`useSearchParams`) so a search survives reload and can be shared. Debounced 250ms. |
| ☑ | `ArrivalsScreen` | B10 ✅ | `GET /reservations/arrivals` — **done**. Fixed a no-op toolbar (search + 4 tabs filtered an array the table ignored) and a dead "Print List". **ETA column has no backing field** — kept, reads “—”. |
| ☑ | `DeparturesScreen` | B10 ✅ | `GET /reservations/departures` — **done**. Balance Due needed a server change (endpoint now returns folio balance per row, computed after pagination). **Checkout Time and Late Checkout have no backing fields** — kept, read “—”. |
| ☑ | `InHouseGuests` | B10 ✅ | `GET /reservations/in-house` — **done**. Endpoint now returns folio totals (shared `withFolioTotals` helper, applied after pagination). **Four inert controls fixed**: the search box had no state at all, and Filter / Export / Post Charge had no handlers. |
| ☑ | `RoomAssignmentBoard` | B10 ✅ | `GET /rooms/assignment-board`, `POST /:id/assign-room` — **done**. Assignment proven end-to-end against a real reservation. Surfaces the server's `indicativeRateKobo` on a type change. Auto-Assign stays honestly unwired — allocation policy belongs on the server. |
| ☐ | `WalkInReg` | B10 ✅ | `POST /reservations/walk-in` |
| ☐ | `CancellationRefund` | B9 ✅ | `/cancellation-preview`, `/cancel`, `/refunds` |
| ☐ | `InvoiceReceipts` | B7 ✅ | `/invoices`, `/receipts` |
| ☐ | `RateManagement` | B8 ✅ | `/rate-plans`, `/rate-calendar` |
| ☐ | `GuestProfiles` / `GuestProfileDetail` | guests ⚠→✅ | **This row was WRONG: `GET /guests/:id` did not exist.** Added it (guest + stay history + totals), and `GET /guests` had a hardcoded `limit 20` that silently truncated the directory — now a parameter, default 20, cap 200. |

**11 are blocked** on the same batches as §5:

| ☐ | Screen | Needs |
|---|---|---|
| ☐ | `AccountsPayable` | B16 |
| ☐ | `DNDLog`, `HousekeepingSchedule` | B13 |
| ☐ | `AssetRegister`, `PreventiveSchedule`, `VendorContacts` | B14 |
| ☐ | `GroupBookings`, `Waitlist` | B12 |
| ☐ | `DiningReservations`, `RoomServiceOrders` | B15 |

> **Consolidation to decide:** `RateManagement` (main, unwired) overlaps the
> export's new `RateCalendar` + `RoomTypeManagement`, which serve the same B8
> backend. Decide which supersedes the other before wiring either.

---

## 7. Figma batches NOT YET DESIGNED

The export is not the complete design either. Checked against the Figma UI Build
Blueprint's 26 batches — three are absent from `aa66a30`:

| Batch | Scope | Screens | Blocked by |
|---|---|---|---|
| **21 — Guest portal** | T2/T3 | ~11 | B29 (guest auth realm), gated on B17 ✅ |
| **22 — Staff field app** | T1 | ~8 | B31, and F1 (tiers) |
| **26 — Print templates** | print | ~6 | B24 |

**~25 screens still to be produced in Figma.** Worth knowing before treating
this export as "the UI".

---

## 8. Non-screen assets

| # | Item | Decision | Status |
|---|---|---|---|
| C1 | `UIKit.tsx` — 14 genuine UI components | adopt as shared layer, or cherry-pick | ☐ |
| C2 | `UIKit.tsx` — 17 screens duplicating main's | **do not adopt** unless §9 shows a real improvement | ☐ |
| C3 | `theme.css` (+195 lines) | delta review, additive tokens only | ☐ |
| C4 | `constants.ts` (was `data.tsx`) | types / helpers only | ☐ |
| C5 | `fonts.css` | review | ☐ |
| C6 | `components/ui/*` (shadcn, 40+ files) | compare against main's | ☐ |

---

## 9. Overlapping screens — delta review **(COMPLETE)**

All 80 of main's screens exist in the export. **They were reviewed, and the
answer is not "zero".**

| Verdict | Count |
|---|---|
| **Materially redesigned** | **73** |
| Cosmetic | 5 |
| Unchanged | 2 |

**The export is NOT a strict improvement.** In **62 of 80 screens** main has
visible UI the export does not — 289 labels in total. A blind port would delete
them. This is exactly the failure the standing rule exists to prevent: *never
silently drop or restyle existing UI; restore it exactly or record the gap.*

| Screen | Export adds | Main has, export lacks |
|---|---|---|
| `CheckOut` | *Apply Discount*, *Void* | *Total charges*, *Paid so far*, *Room released to Housekeeping on settlement* |
| `HotelConfig` | *"Room types are configured in Reservations → Room Types"* (it knows B8 landed) | *Property Profile*, *Enabled Modules*, *Pricing Rules* |
| `LostFound` | *Claimant Name*, *ID / NIN*, *Phone* | *Log New Item*, *Location Found* |

### How these numbers were produced — and what they are not

Compared **JSX text nodes** (`>Label<`) between each screen's body in the export
and in `apps/web/src/app/screens/`. `overlap` is the share of visible copy the
two versions have in common.

**This is a triage aid, not a verdict.** The export hardcodes mock values
(`Deluxe Room 202`) where main renders `{data.name}`, so some divergence is
wiring, not design. Every screen still needs a human look before its row is
decided. Two earlier measurements were **wrong and discarded**: one matched the
destructuring braces in the parameter list and reported 71 screens identical
having compared nothing; the next scraped all quoted strings and counted
classNames and object fragments as "labels". Neither was ever written here.

### Per-screen worklist

`main → export` is body line count. `new` / `lost` are visible labels present on
one side only. **`lost` > 0 means a careless port deletes UI.**

| ☐ | Screen | Module | main → export | overlap | new | lost | Verdict |
|---|---|---|---|---|---|---|---|
| ☐ | `ShiftHandover` | communications | 107 → 137 | 0% | 11 | **7** | **REDESIGNED** |
| ☐ | `DashboardRole` | dashboard | 38 → 435 | 0% | 24 | **2** | **REDESIGNED** |
| ☐ | `AccountsPayable` | finance | 15 → 165 | 0% | 10 | **2** | **REDESIGNED** |
| ☐ | `FinanceFolioManagement` | finance | 73 → 84 | 0% | 6 | 0 | **REDESIGNED** |
| ☐ | `InvoiceReceipts` | finance | 18 → 203 | 0% | 12 | **2** | **REDESIGNED** |
| ☐ | `RevenueReports` | finance | 51 → 150 | 0% | 5 | **5** | **REDESIGNED** |
| ☐ | `KeyCardLog` | front-desk | 44 → 85 | 0% | 1 | 0 | **REDESIGNED** |
| ☐ | `KeyCardMgmt` | front-desk | 62 → 193 | 0% | 30 | **5** | **REDESIGNED** |
| ☐ | `RoomAssignmentBoard` | front-desk | 25 → 123 | 0% | 5 | **2** | **REDESIGNED** |
| ☐ | `InspectionLog` | housekeeping | 81 → 82 | 0% | 2 | **5** | **REDESIGNED** |
| ☐ | `LinenSupplies` | housekeeping | 23 → 89 | 0% | 9 | 0 | **REDESIGNED** |
| ☐ | `RolesPermissions` | hr | 146 → 175 | 0% | 6 | **6** | **REDESIGNED** |
| ☐ | `StaffDirectory` | hr | 91 → 121 | 0% | 5 | **10** | **REDESIGNED** |
| ☐ | `StaffProfileDetail` | hr | 140 → 217 | 0% | 13 | **14** | **REDESIGNED** |
| ☐ | `StockDashboard` | inventory | 33 → 142 | 0% | 10 | **1** | **REDESIGNED** |
| ☐ | `StockTransactions` | inventory | 28 → 183 | 0% | 10 | 0 | **REDESIGNED** |
| ☐ | `AuditLog` | it-admin | 38 → 58 | 0% | 3 | 0 | **REDESIGNED** |
| ☐ | `DeviceManagement` | it-admin | 30 → 139 | 0% | 12 | **1** | **REDESIGNED** |
| ☐ | `SystemHealth` | it-admin | 60 → 95 | 0% | 5 | **2** | **REDESIGNED** |
| ☐ | `AssetRegister` | maintenance | 13 → 92 | 0% | 2 | **2** | **REDESIGNED** |
| ☐ | `VendorContacts` | maintenance | 24 → 127 | 0% | 12 | **1** | **REDESIGNED** |
| ☐ | `BranchComparison` | multi-branch | 60 → 96 | 0% | 3 | **3** | **REDESIGNED** |
| ☐ | `BranchOverview` | multi-branch | 72 → 89 | 0% | 0 | **1** | **REDESIGNED** |
| ☐ | `CentralSyncStatus` | multi-branch | 55 → 88 | 0% | 3 | **1** | **REDESIGNED** |
| ☐ | `DepartmentReports` | reports | 43 → 87 | 0% | 2 | **1** | **REDESIGNED** |
| ☐ | `InventoryReports` | reports | 50 → 124 | 0% | 5 | **2** | **REDESIGNED** |
| ☐ | `OccupancyReports` | reports | 43 → 130 | 0% | 6 | **3** | **REDESIGNED** |
| ☐ | `StaffReports` | reports | 47 → 132 | 0% | 5 | **2** | **REDESIGNED** |
| ☐ | `ReservationGrid` | reservations | 57 → 136 | 0% | 8 | **3** | **REDESIGNED** |
| ☐ | `GuestRoomCharges` | restaurant | 33 → 176 | 0% | 28 | 0 | **REDESIGNED** |
| ☐ | `RoomServiceOrders` | restaurant | 14 → 154 | 0% | 8 | **1** | **REDESIGNED** |
| ☐ | `TableManagement` | restaurant | 70 → 160 | 0% | 8 | **2** | **REDESIGNED** |
| ☐ | `MyPreferences` | settings | 77 → 121 | 0% | 3 | **10** | **REDESIGNED** |
| ☐ | `SyncSettings` | settings | 73 → 103 | 0% | 2 | **11** | **REDESIGNED** |
| ☐ | `PINManagement` | front-desk | 71 → 139 | 7% | 20 | **5** | **REDESIGNED** |
| ☐ | `ProductsScreen` | inventory | 110 → 173 | 8% | 8 | **14** | **REDESIGNED** |
| ☐ | `CheckOut` | front-desk | 108 → 192 | 9% | 29 | **11** | **REDESIGNED** |
| ☐ | `NewReservation` | reservations | 129 → 247 | 10% | 24 | **13** | **REDESIGNED** |
| ☐ | `PurchaseOrders` | inventory | 90 → 201 | 11% | 9 | **7** | **REDESIGNED** |
| ☐ | `CheckInWizard` | front-desk | 183 → 328 | 12% | 36 | **22** | **REDESIGNED** |
| ☐ | `AttendanceScreen` | hr | 99 → 164 | 13% | 7 | **7** | **REDESIGNED** |
| ☐ | `PreventiveSchedule` | maintenance | 22 → 169 | 13% | 12 | **1** | **REDESIGNED** |
| ☐ | `WorkOrderDetail` | maintenance | 99 → 181 | 13% | 24 | **3** | **REDESIGNED** |
| ☐ | `POSTerminal` | restaurant | 179 → 248 | 14% | 17 | **7** | **REDESIGNED** |
| ☐ | `DoorLockSettings` | settings | 146 → 113 | 14% | 1 | **11** | **REDESIGNED** |
| ☐ | `BackupRestore` | it-admin | 60 → 102 | 15% | 7 | **4** | **REDESIGNED** |
| ☐ | `GroupBookings` | reservations | 42 → 141 | 15% | 11 | 0 | **REDESIGNED** |
| ☐ | `DailySummary` | finance | 49 → 191 | 16% | 16 | **5** | **REDESIGNED** |
| ☐ | `GuestProfileDetail` | front-desk | 40 → 206 | 16% | 28 | **4** | **REDESIGNED** |
| ☐ | `DashboardMgmt` | dashboard | 106 → 262 | 18% | 20 | **7** | **REDESIGNED** |
| ☐ | `MenuManagement` | restaurant | 77 → 148 | 18% | 7 | **2** | **REDESIGNED** |
| ☐ | `RoomAccessMgmt` | front-desk | 113 → 111 | 19% | 9 | **8** | **REDESIGNED** |
| ☐ | `DiningReservations` | restaurant | 15 → 163 | 19% | 17 | 0 | **REDESIGNED** |
| ☐ | `Announcements` | communications | 67 → 157 | 20% | 14 | **2** | **REDESIGNED** |
| ☐ | `SuppliersScreen` | inventory | 52 → 111 | 20% | 6 | **2** | **REDESIGNED** |
| ☐ | `KitchenDisplay` | restaurant | 60 → 154 | 20% | 7 | **1** | **REDESIGNED** |
| ☐ | `HotelConfig` | settings | 78 → 100 | 20% | 5 | **3** | **REDESIGNED** |
| ☐ | `GuestMessaging` | communications | 182 → 182 | 21% | 8 | **7** | **REDESIGNED** |
| ☐ | `WalkInReg` | front-desk | 53 → 132 | 21% | 9 | **6** | **REDESIGNED** |
| ☐ | `FolioScreen` | front-desk | 127 → 167 | 24% | 15 | **4** | **REDESIGNED** |
| ☐ | `HKBoard` | housekeeping | 116 → 149 | 25% | 10 | **2** | **REDESIGNED** |
| ☐ | `ShiftScheduler` | hr | 62 → 201 | 25% | 6 | 0 | **REDESIGNED** |
| ☐ | `LostFound` | housekeeping | 101 → 90 | 27% | 7 | **4** | **REDESIGNED** |
| ☐ | `ReservationDetail` | reservations | 57 → 230 | 27% | 13 | **3** | **REDESIGNED** |
| ☐ | `HousekeepingSchedule` | housekeeping | 18 → 83 | 29% | 4 | **1** | **REDESIGNED** |
| ☐ | `GuestAnalytics` | reports | 54 → 115 | 29% | 4 | **1** | **REDESIGNED** |
| ☐ | `UserManagement` | it-admin | 119 → 160 | 30% | 7 | **7** | **REDESIGNED** |
| ☐ | `ReservationSearch` | reservations | 31 → 96 | 36% | 7 | 0 | **REDESIGNED** |
| ☐ | `DNDLog` | housekeeping | 15 → 117 | 40% | 5 | **1** | **REDESIGNED** |
| ☐ | `HKMyTasks` | housekeeping | 56 → 105 | 43% | 8 | 0 | **REDESIGNED** |
| ☐ | `CancellationRefund` | reservations | 51 → 152 | 47% | 13 | **5** | **REDESIGNED** |
| ☐ | `ArrivalsScreen` | front-desk | 45 → 80 | 50% | 3 | **1** | **REDESIGNED** |
| ☐ | `Waitlist` | reservations | 23 → 71 | 55% | 5 | 0 | **REDESIGNED** |
| ☐ | `InHouseGuests` | front-desk | 13 → 94 | 67% | 2 | 0 | cosmetic |
| ☐ | `RateManagement` | reservations | 96 → 162 | 70% | 6 | **1** | cosmetic |
| ☐ | `GuestProfiles` | front-desk | 73 → 91 | 73% | 3 | 0 | cosmetic |
| ☐ | `InternalChat` | communications | 116 → 154 | 75% | 2 | 0 | cosmetic |
| ☐ | `WorkOrders` | maintenance | 129 → 165 | 80% | 3 | 0 | cosmetic |
| ☐ | `DeparturesScreen` | front-desk | 22 → 67 | 86% | 1 | 0 | unchanged |
| ☐ | `PayrollSummary` | hr | 40 → 14 | 100% | 0 | 0 | unchanged |

### Decision required per screen

For each of the 80, one of:

- **Port the export's composition** — re-wire it to the API main already has,
  *and* re-add anything in the `lost` column.
- **Keep main's** — the export adds nothing worth the re-wiring.
- **Merge** — take specific additions into main's wired screen.

Nothing is ported until its row is decided.

---

## 10. Definition of done — per screen

Doc 3 §5 (quality gates). A screen is not checked off until:

1. Extracted to `screens/<module>/<Name>.tsx`, one screen per file.
2. **Composition preserved.** No control silently dropped or restyled. If
   something cannot be wired, it stays visible and says so — recorded here as a
   gap, never removed quietly.
3. No import from a mock array; the array is deleted.
4. Every interactive control performs a real operation **or** is absent.
   **No success toast for a no-op.**
5. Loading / empty / error states present.
6. Route params via `useParams`; filters in `useSearchParams`.
7. Permission-gated at the action level, matching the server's keys.
8. Money renders through the shared formatter — never a local `/ 100`.
9. Typecheck + build clean.

---

## 11. Progress

| Section | Done | Total |
|---|---|---|
| Prerequisites (§2) | 0 | 6 |
| UI foundation — Phase 3 (§3) | **12** | **12 ✅** |
| New screens, backend ready (§4) | 0 | 11 |
| New screens, blocked (§5) | 0 | 10 |
| Main's unwired screens (§6) | **5** | 22 (11 ready, 11 blocked) |
| Figma batches undesigned (§7) | 0 | 3 batches / ~25 screens |
| Non-screen assets (§8) | 0 | 6 |
| Overlap decisions (§9) | 0 | 80 |
| **Total** | **17 done** | **67 items + 80 screen decisions** |

---

## 12. Log

| Date | Item | Note |
|---|---|---|
| 2026-08-16 | **RoomAssignmentBoard wired** | Caught my own bad filter by checking real data: I required rooms to be clean, which showed **zero assignable rooms** because both free rooms were mid-clean. Backwards — a front desk assigns in the morning, precisely when rooms are dirty. Now every free room is offered with its housekeeping state shown rather than used to hide it. Also found the server returns `typeChanged` and `indicativeRateKobo` on assignment, which I was discarding; an upgrade's rate implication now reaches the clerk instead of surfacing at checkout. |
| 2026-08-16 | **Regression I introduced, caught by running the app** | Replacing the fake sync pill was right; returning `null` when it could not read sync was not. `/sync/status` needs `admin:operations` — FD/HK/RT get a 403 — and even MGT gets `configured: false` on this install, so **the header pill had disappeared for every role**. Exactly the silent-UI-removal the standing rule forbids, committed by me two commits after writing that rule down. The pill now always shows connection state (needs no permission) and adds sync detail only where readable. |
| 2026-08-16 | **ReservationSearch wired** | Filters moved into the URL, the first screen to use the `useSearchParams` gate from §10. Client param corrected: the server reads `roomNumber`, my type said `room` — it would have been silently ignored. Status values verified live against the server's snake_case (`status=checked_in` → exactly the 2 checked-in rows). |
| 2026-08-16 | **InHouseGuests wired** | Folio totals added to the in-house endpoint via a shared helper (same reasoning as Departures: this is where a bill running away gets noticed). Client type renamed `DepartureRow` → `ReservationWithBalance` now that two lists use it. Export writes a real CSV of the filtered rows, in **kobo** — a spreadsheet column that has been through a float conversion is exactly how money goes wrong. |
| 2026-08-16 | **The route audit caught my new endpoint** | `route-permissions.test.ts` (B17.7) failed: it enumerates every endpoint and refuses to pass until each is explicitly classified, and `GET /guests/:id` was in no bucket. Classified as authenticated-only with a written reason. **It caught what live verification did not** — I had confirmed the endpoint returned correct data and 404'd properly, but never asked who may call it. Rule for the remaining screens: a new endpoint and its route-permission entry go in the same change. 314/314 green after the fix. |
| 2026-08-16 | **Wiring started — Arrivals + Departures live** | Client API extended with the B7–B10 surface and **verified against the running server**, not just typechecked: response shapes confirmed field-by-field, balance arithmetic checked (₦206,335.00 − ₦130,000.00 = ₦76,335.00). |
| 2026-08-16 | **Tracker error corrected** | §6 claimed `GET /guests/:id` existed. It did not. Added it, plus a `limit` parameter on `GET /guests` (was a hardcoded 20 that silently truncated the guest directory). OpenAPI now 229 endpoints. |
| 2026-08-16 | **Three columns have no data behind them — now scheduled as B10.1** | Arrivals "ETA", Departures "Checkout Time" and "Late Checkout" were mock values with no schema field. All three columns kept and read “—” rather than being deleted or invented. Written up as **B10.1 — Arrival & departure times** in the backend blueprint and `ROADMAP.md`, slotted to ride along with the next backend batch. The `—` placeholders come out in that same change. |
| 2026-08-16 | **F11 — navigation rebuilt; §3 foundation COMPLETE** | One route table replaces the `Screen` union, `SCREEN_ROLE_MAP`, `DOOR_LOCK_SCREENS`, the `NAV` tree and the 90-branch switch. −445 lines. Verified: 83 routes, no duplicate paths, every sidebar reference resolves, 80 screens all still reachable. Typecheck + build clean; dev server transforms clean. **Found and fixed a live bug**: the Management dashboard's Housekeeping KPI tile navigated to `/` because its screen id had no entry in the second lookup table. |
| 2026-08-16 | §3 foundation — first 11 | `lib/tokens.ts`, `lib/tier.ts`, `lib/connection.ts` + 8 components. Web typecheck + build clean; server typecheck clean, 314 tests passing. Bundle 1,211 → 1,242 kB (TanStack Query + 8 components). **F11 (nav rebuild) not started.** |
| 2026-08-16 | **Removed a demo prop from the shell** | The header sync pill toggled a local boolean and toasted *"5 pending items pushed"* when nothing had synced; the offline banner it drove promised queued changes that do not exist. Both replaced with real signals (`GET /sync/status`, and a request actually failing to reach the server). Same defect class as Phase 0.1's no-op controls, still live in `App.tsx`. |
| 2026-08-16 | Backend: `/auth/me` now returns permissions | Two lines, reusing the existing `permissionsForRole()`. Without it `<RoleGate>` could only gate by role name, which drifts as soon as a manager edits a role via HR-03. |
| 2026-08-16 | **Tracker rebuilt after I destroyed it** | A section-renumbering script's split regex failed and truncated the file to its header. It was untracked, so there was no git copy. Rebuilt from the scratchpad source data. **Committing this file is the fix**, and no more regex surgery on it. |
| 2026-08-16 | Audited against all five planning docs | Added §3 (12 Phase-3 foundation items, none exist), §6 (main's 22 unwired screens — 11 wireable today), §7 (3 Figma batches undesigned) |
| 2026-08-16 | §9 delta review COMPLETE | 73 redesigned / 5 cosmetic / 2 unchanged. **62 screens have UI in main the export lacks (289 labels)** |
| 2026-08-16 | A11 flagged partial | `GET /hr/leave-requests` does not exist |
| 2026-08-16 | A10 verified ready | `GET /admin/error-log`, `admin:manage` |
| 2026-08-16 | Tracker created | Recon: rebrand aligned, 21 new screens, 0 losses, 10 blocked |
