# Nexura
## Complete Master Blueprint — v1.0

**Document type:** Single authoritative reference for platform architecture, organizational hierarchy, monetization, and complete UI/UX specification. All subsequent design, database, API, and development work is governed by this document.
**Platform:** Web application only (browser-based). Primary environment: Desktop Windows PCs. Secondary: Android/Windows tablets for Housekeeping and Maintenance field tasks.
**Network model:** Offline-first. Each property runs a dedicated local server on the hotel LAN. Devices talk to the local server only. The local server syncs to a shared central cloud server opportunistically whenever internet is available. The app must be fully operational with zero internet connection.
**Scope:** Full feature set — no staged, deferred, or MVP framing. Every module in this document is in scope for the initial build.

---

# TABLE OF CONTENTS

- **PART 0** — Platform Foundation: Architecture, Hierarchy & Monetization
- **PART 1** — Design System
- **PART 2** — Global Shell & Navigation
- **PART 3** — Global UI Behaviors
- **PART 4** — Complete Screen Inventory (all modules)
- **PART 5** — End-to-End User Flows
- **PART 6** — Door Lock & Access Control (TTLock Integration)
- **PART 7** — Design Build Order

---

# PART 0 — PLATFORM FOUNDATION

## 0.1 Infrastructure Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  CENTRAL SERVER  (one, cloud-hosted, multi-tenant)              │
│  Operated by the Platform Owner (Gideon) for all clients.       │
│  Every branch from every client organization syncs into here.   │
│  Row-level security keeps every client's data fully isolated.   │
└────────────────────────┬─────────────────────────────────────────┘
                         │  Sync over HTTPS (opportunistic)
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌──────────────────┐         ┌──────────────────┐
│  LOCAL SERVER    │         │  LOCAL SERVER    │
│  Client A        │         │  Client B        │
│  Branch 1        │         │  Branch 1        │
│  (on hotel LAN)  │         │  (on hotel LAN)  │
└────────┬─────────┘         └────────┬─────────┘
         │ LAN only                   │ LAN only
    ┌────┴────┐                  ┌────┴────┐
    │ Devices │                  │ Devices │
    │ (PCs,   │                  │ (PCs,   │
    │ tablets)│                  │ tablets)│
    └─────────┘                  └─────────┘
```

**Local server (per branch):** A backend instance physically deployed at each property — reception PC, on-site mini-PC, or similar. Every device at that branch talks only to this local server over the LAN. The branch runs fully — check-ins, bookings, billing — with zero internet.

**Central server (one, shared):** A single cloud-hosted, multi-tenant backend that every client's every branch syncs into. Each record carries its Organization ID and Branch ID; row-level security policies ensure Client A can never see Client B's data even though they share the same database.

**Sync direction:** Local → central (push pending changes) and central → local (pull updates, e.g. price changes or module licensing flags pushed from head office). Sync happens opportunistically whenever the branch has connectivity; nothing on-site blocks on it.

**What this means operationally:** You provision and maintain one local server per branch (real, recurring deployment work per branch), but operate only one central system, ever, for your entire client base.

---

## 0.2 Organizational Hierarchy

```
Platform Owner (Gideon — the vendor. Separate admin console only.
│               Not visible inside any client-facing app.)
│
├── Organization: Client A  (e.g. a 2-property guesthouse group)
│   │
│   └── Organization Super Admin  (Client A's owner/GM)
│       │  Manages all branches under Client A.
│       │
│       ├── Branch: Location 1  (own local server)
│       │   └── Branch Manager
│       │       ├── Front Desk / Receptionist(s)
│       │       ├── Reservations Staff
│       │       ├── Housekeeping
│       │       ├── Maintenance
│       │       ├── Restaurant Staff
│       │       ├── Resident Officer
│       │       ├── Customer Service
│       │       ├── Finance / Accountant
│       │       └── IT Department
│       │
│       └── Branch: Location 2  (own local server)
│           └── Branch Manager
│               └── (same staff structure)
│
└── Organization: Client B  (single-property guesthouse)
    └── Organization Super Admin
        (can optionally also hold Branch Manager permissions
         directly — no redundant second login needed for
         small single-branch properties)
        ├── Front Desk / Receptionist(s)
        ├── Housekeeping
        └── Finance / Accountant
```

---

## 0.3 Account Levels Explained

**Platform Owner** — Gideon. Operates above every client. Has visibility across all organizations: who is paying, who is overdue, which branches have local servers deployed and when they last synced. Can set or change which modules an organization's subscription unlocks. This role does not exist inside the client-facing app at all — it has its own separate Platform Admin Console.

**Organization** — one record per client business, whether a single guesthouse or a multi-property chain. Holds the subscription tier, billing details, and the list of branches under it.

**Organization Super Admin** — the client's own top-level account, typically the owner or GM. Created by the Platform Owner during onboarding, credentials handed to the client. Sees and manages every branch under their organization. Creates Branch Managers. Edits org-wide settings within what their subscription plan allows.

**Branch** — one physical property location with its own local server. Always belongs to exactly one organization.

**Branch Manager** — scoped to a single branch. Approves discounts, manages branch staff, views branch-level reports. Cannot see other branches.

**Branch Staff** — Front Desk, Reservations, Housekeeping, Maintenance, Restaurant, Resident Officer, Customer Service, Finance, IT. Created by the Branch Manager or Super Admin. Scoped to their branch and their role's permissions only.

---

## 0.4 Who Creates Whom

| Creator | Can create |
|---|---|
| Platform Owner | Organizations; first Organization Super Admin per org; branch records; can override/reset any account if a client locks themselves out |
| Organization Super Admin | Additional branches (pending local-server provisioning), Branch Managers, and optionally branch staff directly for small single-branch properties |
| Branch Manager | All branch staff roles within their own branch |
| Branch Staff | Nothing — cannot create accounts |

---

## 0.5 Client Onboarding Flow

1. Sales agreement signed; plan tier (Starter / Growth / Business) agreed.
2. Platform Owner creates the **Organization** record in the central system.
3. Platform Owner creates the client's **Organization Super Admin** account; hands credentials securely to the client.
4. **Local server provisioned for branch 1** — either a pre-configured device shipped and installed on-site, or a remote-guided install onto hardware the client already has. Local server is paired to the Organization + Branch ID and issued a sync key.
5. Super Admin logs in, completes property profile and branding, confirms enabled modules (auto-matched to their paid tier).
6. Super Admin (or Platform Owner during white-glove onboarding) creates the **Branch Manager** account for branch 1.
7. Branch Manager creates branch staff accounts.
8. Branch is fully operational immediately — staff can check guests in the same day, even before the first sync.
9. Local server syncs to central server; org-level dashboard and Multi-Branch screens update on first sync.
10. **For every additional branch:** repeat steps 4, 6, and 7. New local server, new Branch Manager, new staff accounts. Billing system adds that branch's subscription line automatically.

---

## 0.6 Platform Admin Console (separate from the client-facing app)

A lightweight tool operated by the Platform Owner only, not connected to the hotel-facing product:

- List of all organizations: plan tier, billing status (current / overdue / suspended), branch count.
- Create new organization + initial Super Admin.
- Branch provisioning tracker: which branches have a local server deployed, last sync time — useful for proactive support before a client notices a problem.
- Module licensing control per organization: toggling which modules a plan unlocks, reflected automatically inside that org's Settings → Enabled Modules.
- Usage and billing reporting across the full client base.

---

## 0.7 Multi-Tenancy & Feature Gating

- Every record (booking, guest, invoice, etc.) carries its Organization ID and Branch ID. The central database uses row-level security to keep client data isolated even in a shared system.
- The organization's plan tier is stored centrally and synced down to every branch's local server. A Starter-tier branch simply does not show Inventory or POS in the sidebar — because the license flag was synced down before the branch went offline. Feature gating works correctly even in a fully offline branch.
- A single-branch client's sync is mainly backup and remote-access. A multi-branch client's sync powers cross-branch dashboards and comparison reports.

---

## 0.8 Monetization Strategy

The local-server-per-branch model means there are real per-branch costs to recover (deployment, hardware, on-site support) on top of central hosting — pricing reflects this explicitly.

### Revenue Streams

1. **One-time setup fee, per branch** — covers local server installation, data migration, and staff training. Scales with branch count, not organization count.
2. **Recurring subscription, per branch** — billed monthly or annually, tiered by room count. Covers central hosting, sync, updates, and standard support.
3. **Managed maintenance add-on** — optional premium. A self-managed branch costs less but the client handles local server troubleshooting themselves; managed tier means you remotely monitor and support it.
4. **Hardware bundling margin** — if you supply the local server device (even a basic mini-PC), bundle it into the setup fee at a markup rather than passing it through at cost.
5. **Central multi-branch aggregation fee** — a small flat fee per organization (not per branch) for chains, covering cross-branch dashboard and consolidated reporting.
6. **Add-ons** — payment-gateway processing markup, WhatsApp/SMS notification credit bundles, priority support SLA, dedicated/private central instance for large enterprise clients.

### Subscription Tiers (per branch, recurring)

*Illustrative starting point based on Nigerian and international hotel-PMS pricing benchmarks. Validate with prospective clients before locking in.*

| Tier | Branch size | Modules included | Suggested monthly |
|---|---|---|---|
| Starter | 5–15 rooms | Dashboard, Rooms, Reservations, Guests, Check-in/out, basic Billing | ₦15,000–₦25,000 |
| Growth | 15–50 rooms | + Housekeeping, Maintenance, Reports, Staff scheduling | ₦35,000–₦60,000 |
| Business | 50+ rooms | + Inventory, Restaurant/POS, Multi-Branch dashboard, Door Lock, priority support | ₦80,000–₦150,000+ |

### One-Time & Add-On Fees

| Item | Suggested range |
|---|---|
| Setup fee per branch (install + migration + training) | ₦150,000–₦400,000 |
| Hardware bundle (if supplying local server device) | +₦80,000–₦150,000 |
| Managed maintenance add-on | +₦10,000–₦20,000/month per branch |
| Multi-branch aggregation (chains only, per org) | ₦10,000–₦20,000/month |
| Door Lock integration (TTLock) | ₦15,000–₦25,000/month per branch |
| Dedicated/private central instance (large enterprise) | Custom — typically ₦300,000+/month |

### Billing Cadence

Offer monthly and annual billing. Incentivize annual prepay (e.g., two months free) for cash-flow predictability — important when carrying per-branch hardware and installation costs.

---

# PART 1 — DESIGN SYSTEM

## 1.1 Color Tokens

| Token | Hex | Usage |
|---|---|---|
| Primary | `#123A73` | Brand color, primary buttons, active accents |
| Nav Background | `#0F2044` | Top header bar, sidebar — darker navy for contrast against white text |
| Accent | `#1BA39C` | Secondary actions, links, teal highlights, sync indicators |
| Highlight | `#F57C00` | Deep orange — Occupied status, critical callouts, urgent flags |
| Success | `#2E7D32` | Available status, sync confirmed, completion states |
| Warning | `#FFA000` | Amber — Cleaning status, pending sync, caution states |
| Error | `#D32F2F` | Red — Maintenance/fault status, destructive actions, error states |
| Background | `#F5F7FA` | App canvas behind all surfaces |
| Surface | `#FFFFFF` | Cards, panels, modals, tables |
| Text Primary | `#0F172A` | Main body text, table content |
| Text Secondary | `#64748B` | Labels, sub-labels, timestamps, helper text |
| Text Inverse | `#FFFFFF` | Text on dark navy nav background |
| Border | `#E2E8F0` | Card borders, dividers, table lines |
| Scrim | `rgba(0,0,0,0.4)` | Behind modals and slide-over panels |

**Notification category accent colors:**
| Category | Hex |
|---|---|
| Emergency/Urgent | `#EF4444` |
| Reservation | `#6366F1` |
| Housekeeping | `#22C55E` |
| Maintenance | `#F97316` |
| Finance | `#14B8A6` |
| Restaurant | `#EAB308` |
| System | `#6B7280` |
| Chat/Internal | `#3B82F6` |
| Door Lock | `#8B5CF6` |

---

## 1.2 Typography

**Typeface:** Inter (primary). Fallback: system-ui, sans-serif.
**Monospaced:** JetBrains Mono — live clock, room/booking IDs, invoice numbers, PIN codes.

| Role | Size | Weight | Usage |
|---|---|---|---|
| Display | 28px | 700 | Page headings, stat card numbers |
| Heading 1 | 22px | 700 | Module titles |
| Heading 2 | 18px | 600 | Section headings, modal titles |
| Heading 3 | 15px | 600 | Card headings, table group labels |
| Body | 14px | 400 | General content, form labels, table rows |
| Body Small | 13px | 400 | Sub-labels, descriptions, secondary info |
| Caption | 11px | 400 | Timestamps, helper text, status sub-labels |
| Button | 14px | 500 | All button labels |
| Mono | 15px | 400 | Live clock, codes, IDs, PIN display |

---

## 1.3 Spacing & Layout

- Base grid: **8px**. All spacing, padding, margin, and gap values are multiples of 8.
- Card border radius: **12px** standard, **8px** for compact variants (chips, table cells).
- Elevation shadows: soft, layered — no hard borders where a shadow establishes depth. Three levels: subtle (cards), medium (dropdowns), strong (modals).
- Minimum interactive target: **44px height** across all buttons, row items, and form controls.

---

## 1.4 Component Library

Build each component with all states before building screens.

| Component | Variants / States |
|---|---|
| Buttons | Primary, Secondary, Outline, Destructive, Ghost, Icon-only — Default, Hover, Active, Loading, Disabled |
| Stat Card | Standard (icon + number + label + trend delta), Compact, Expandable to chart |
| List Item Card | Standard, With avatar, With status badge, Selectable |
| Status Badge / Chip | Color-coded by category (see 1.1 and 3.3), standard and compact |
| Search Bar | With icon, With scope selector dropdown |
| Data Table | Sortable headers, Row action menu (⋯), Pagination, Checkbox multi-select, Column overflow on narrow widths, Expandable row detail |
| Dialog / Modal | Confirm, Form, Destructive-confirm (red title), Information |
| Slide-Over Panel | Right-side, 400px wide, full-height, with scrim |
| Empty State | Icon + 1-line message + primary CTA button |
| Skeleton Loader | For stat cards, tables, list rows, panels |
| Toast / Snackbar | Success, Error, Info, Offline (amber), Sync-complete (green) — bottom-right, auto-dismisses |
| Calendar | Date picker, Date-range picker, Room-date grid (Reservation Grid) |
| Kanban Board | Columns with configurable labels, Draggable task cards, Column totals |
| Stepper / Wizard | Horizontal progress steps, Back/Next navigation, Step validation |
| Tabs | Underline indicator, Icon+label |
| Segmented Control | View toggles (Grid/List, Calendar/Table) |
| Breadcrumb | Active + parent trail, max 3 levels |
| Avatar | Initials circle, Photo variant, 32px and 48px sizes |
| Form Controls | Text input, Select, Multi-select, Textarea, Date picker, Toggle, Checkbox, Radio — all with label, helper text, error state |
| Upload Zone | Drag-and-drop + click to browse, file type restriction, progress indicator |
| Progress Bar | Stock levels, task completion |
| Tooltip | On hover for icon-only controls |
| Notification Dot | 8px red circle on sidebar icons and bell |
| Sync Indicator | Pill: green/amber/gray dot + text label |
| Lock Queue Indicator | Pill: purple dot + "N lock commands queued" (door lock module only) |
| Conflict Resolution Modal | Side-by-side Local vs Server version comparison |
| PIN Display | Large monospaced masked display, one-time reveal, copy button |
| Card Encoder Status | Color-coded status pill for USB encoder connection state |

**Icons:** Material Symbols Rounded, consistent stroke weight.
**Motion:** 200–300ms transitions. Fade for state changes; slide for panels/drawers; scale for modal entrances.

---

# PART 2 — GLOBAL SHELL & NAVIGATION

## 2.1 Fixed Three-Zone Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  TOP HEADER BAR — 64px fixed, full width, z-index above sidebar  │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│ SIDEBAR  │   MAIN CONTENT AREA                                   │
│ 240px    │   flex-fill, scrollable                               │
│ expanded │   24px padding all sides                              │
│          │                                                       │
│  or      │                                                       │
│  64px    │                                                       │
│ collapsed│                                                       │
│          │                                                       │
└──────────┴───────────────────────────────────────────────────────┘
```

Only the main content area scrolls. Header and sidebar are always visible.

---

## 2.2 Top Header Bar

**Height:** 64px, position: fixed, full width, background: `#0F2044`.

**Left Zone:**
- Hamburger/chevron (24px) — toggles sidebar expanded ↔ collapsed
- Hotel logo (32px height SVG/PNG) — visible when sidebar expanded, hidden when collapsed
- Hotel name text (18px, 500 weight, white) — from property config
- Vertical divider (1px, white 20% opacity)

**Center Zone:**
- Module breadcrumb — e.g. "Front Desk › Check-In" in 13px, `#94A3B8`
- Contextual guest chip when a guest/room is selected in a workflow: avatar initial + name + room number badge

**Right Zone (left to right):**
1. **Shift Indicator** — pill: current shift name + time range, color-coded dot (Morning = green, Evening = amber, Night = purple). Click → Shift Handover modal.
2. **Live Clock** — HH:MM:SS, 15px JetBrains Mono, white, updates every second. Date below in 11px `#94A3B8`.
3. **Sync Status Indicator** — always visible (see Part 3.2).
4. **Lock Queue Indicator** — visible only when door lock commands are queued offline: purple dot + "N lock commands queued". Click → lock queue popover.
5. **Notification Bell** — unread count badge (red, max "99+"). Click → Notification Slide-Over panel.
6. **Branch Switcher** — visible only to ORG and MGT with multi-branch access. Dropdown of accessible branches.
7. **User Avatar** — 36px circle. Click → dropdown: My Profile, Change Password, Switch Role, Sign Out. Department label in 11px uppercase `#94A3B8` below user name.

---

## 2.3 Sidebar Navigation

**Expanded:** 240px. **Collapsed:** 64px icons-only with hover tooltips.
**Background:** `#0F2044` — seamless with header.
**Transition:** 200ms ease slide; label text fades.

**Active item:** 3px left border (`#F57C00`), background white 8% opacity.
**Hover item:** background white 5% opacity.
**Expanded group children:** indented 16px, 13px font, `#CBD5E1`.
**Notification dot:** 8px red dot on module icon when module has unread alerts — visible in collapsed state.

```
┌────────────────────────────┐
│ [← COLLAPSE]               │
├────────────────────────────┤
│ MAIN NAVIGATION            │
│  🏠 Dashboard              │
│  📅 Reservations      ▾    │
│     • Reservation Grid     │
│     • New Reservation      │
│     • Group Bookings       │
│     • Waitlist             │
│     • Rate Management      │
│     • Reservation Search   │
│     • Cancellation         │
│  🔑 Front Desk        ▾    │
│     • Check-In             │
│     • Check-Out            │
│     • In-House Guests      │
│     • Arrivals List        │
│     • Departures List      │
│     • Guest Profiles       │
│     • Room Assignment      │
│     • Walk-In Registration │
│     • Folio Management     │
│     • Key Card Management  │
│     • Room Access Mgmt     │  ← door lock
│     • Key Card Log         │  ← door lock
│     • PIN Management       │  ← door lock
│  🛏 Housekeeping      ▾    │
│     • Housekeeping Board   │
│     • My Tasks (tablet)    │
│     • Schedule             │
│     • Inspection Log       │
│     • Lost & Found         │
│     • Linen & Supplies     │
│     • Do Not Disturb Log   │
│  🔧 Maintenance       ▾    │
│     • Work Orders          │
│     • Asset Register       │
│     • Preventive Schedule  │
│     • Vendor Contacts      │
│  🍽 Restaurant / POS  ▾    │
│     • POS Terminal         │
│     • Kitchen Display      │
│     • Table Management     │
│     • Menu Management      │
│     • Dining Reservations  │
│     • Room Service Orders  │
│     • Guest Room Charges   │
│  💬 Communications    ▾    │
│     • Internal Chat        │
│     • Guest Messaging      │
│     • Announcements        │
│     • Shift Handover       │
│  💰 Finance & Billing ▾    │
│     • Folio Management     │
│     • Invoice & Receipts   │
│     • Daily Summary        │
│     • Accounts Payable     │
│     • Revenue Reports      │
│  📦 Inventory         ▾    │
│     • Stock Dashboard      │
│     • Products             │
│     • Suppliers            │
│     • Stock Transactions   │
│     • Purchase Orders      │
│  👥 HR & Staff        ▾    │
│     • Staff Directory      │
│     • Roles & Permissions  │
│     • Attendance           │
│     • Shift Scheduler      │
│     • Payroll Summary      │
│  🏢 Multi-Branch      ▾    │  ORG only
│     • Branch Overview      │
│     • Branch Comparison    │
│     • Central Sync Status  │
│  📊 Reports           ▾    │
│     • Occupancy Reports    │
│     • Revenue Reports      │
│     • Department Reports   │
│     • Guest Analytics      │
│     • Inventory Reports    │
│     • Staff Reports        │
│  ⚙️ IT Admin          ▾    │
│     • User Management      │
│     • System Health        │
│     • Device Management    │
│     • Backup & Restore     │
│     • Audit Log            │
├────────────────────────────┤
│ QUICK ACTIONS              │
│  ➕ New Reservation        │
│  🔑 Quick Check-In         │
│  🚪 Quick Check-Out        │
│  🚨 Emergency Alert        │
├────────────────────────────┤
│ SYSTEM                     │
│  ⚙️ Settings               │
│     • Hotel Configuration  │
│     • Integrations         │
│        └ Door Lock         │  ← door lock
│     • Synchronization      │
│     • My Preferences       │
│  ❓ Help                   │
└────────────────────────────┘
```

---

## 2.4 Role Definitions

| Code | Role | Description |
|---|---|---|
| PLT | Platform Owner | Gideon. Separate admin console only. |
| ORG | Organization Super Admin | Client's owner/GM. All branches. |
| MGT | Hotel Management / Branch Manager | Property-level manager. Own branch only. |
| FD | Front Desk | Reception and check-in/out staff. |
| RSV | Reservations | Dedicated reservations staff. |
| HK | Housekeeping | Housekeeping attendants and supervisors. |
| MX | Maintenance | Maintenance technicians. |
| RT | Restaurant | Restaurant, bar, and kitchen staff. |
| RO | Resident Officer | Duty manager / on-site supervisor. |
| CS | Customer Service | Guest relations and concierge. |
| FIN | Finance / Accountant | Billing, accounts, financial reporting. |
| IT | IT Department | Local server admin, system health, users. |

---

## 2.5 Role-Based Menu Visibility Matrix

| Section | Screen | FD | RSV | HK | MX | RT | RO | CS | FIN | IT | MGT | ORG |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Dashboard** | My Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Dashboard** | Management Overview | | | | | | | | | | ✓ | ✓ |
| **Reservations** | Reservation Grid | ✓ | ✓ | | | | ✓ | ✓ | | | ✓ | ✓ |
| **Reservations** | New Reservation | ✓ | ✓ | | | | | ✓ | | | ✓ | ✓ |
| **Reservations** | Group Bookings | | ✓ | | | | | | | | ✓ | ✓ |
| **Reservations** | Waitlist | ✓ | ✓ | | | | ✓ | | | | ✓ | ✓ |
| **Reservations** | Rate Management | | ✓ | | | | | | ✓ | | ✓ | ✓ |
| **Reservations** | Reservation Search | ✓ | ✓ | | | | ✓ | ✓ | | | ✓ | ✓ |
| **Reservations** | Cancellation & Refund | ✓ | ✓ | | | | | | | | ✓ | ✓ |
| **Front Desk** | Check-In (incl. Step 7) | ✓ | | | | | | | | | ✓ | ✓ |
| **Front Desk** | Check-Out & Settlement | ✓ | | | | | | | | | ✓ | ✓ |
| **Front Desk** | Room Assignment Board | ✓ | ✓ | | | | | | | | ✓ | ✓ |
| **Front Desk** | Guest Profiles | ✓ | ✓ | | | | ✓ | ✓ | | | ✓ | ✓ |
| **Front Desk** | In-House Guest List | ✓ | | | | | ✓ | | | | ✓ | ✓ |
| **Front Desk** | Arrivals List | ✓ | ✓ | | | | | | | | ✓ | ✓ |
| **Front Desk** | Departures List | ✓ | | | | | | | | | ✓ | ✓ |
| **Front Desk** | Folio Screen | ✓ | | | | | | | ✓ | | ✓ | ✓ |
| **Front Desk** | Walk-In Registration | ✓ | | | | | | | | | ✓ | ✓ |
| **Front Desk** | Key Card Management | ✓ | | | | | | | | ✓ | ✓ | ✓ |
| **Front Desk** | Room Access Mgmt (FD-12) | ✓ | | | | | ✓ | | | | ✓ | ✓ |
| **Front Desk** | Key Card Log (FD-13) | ✓ | | | | | | | | ✓ | ✓ | ✓ |
| **Front Desk** | PIN Management (FD-14) | ✓ | | | | | ✓ | | | | ✓ | ✓ |
| **Housekeeping** | Housekeeping Board | ✓ | | ✓ | | | ✓ | | | | ✓ | ✓ |
| **Housekeeping** | My Tasks (tablet) | | | ✓ | | | | | | | | |
| **Housekeeping** | Housekeeping Schedule | | | ✓ | | | | | | | ✓ | ✓ |
| **Housekeeping** | Inspection Log | | | ✓ | | | ✓ | | | | ✓ | ✓ |
| **Housekeeping** | Lost & Found | | | ✓ | | | ✓ | ✓ | | | ✓ | ✓ |
| **Housekeeping** | Linen & Supplies | | | ✓ | | | | | ✓ | | ✓ | ✓ |
| **Housekeeping** | Do Not Disturb Log | ✓ | | ✓ | | | ✓ | | | | ✓ | ✓ |
| **Maintenance** | Work Orders | ✓ | | ✓ | ✓ | | | ✓ | | | ✓ | ✓ |
| **Maintenance** | Asset Register | | | | ✓ | | | | | ✓ | ✓ | ✓ |
| **Maintenance** | Preventive Schedule | | | | ✓ | | | | | | ✓ | ✓ |
| **Maintenance** | Vendor Contacts | | | | ✓ | | | | ✓ | | ✓ | ✓ |
| **Restaurant** | POS Terminal | | | | | ✓ | | | | | | |
| **Restaurant** | Kitchen Display | | | | | ✓ | | | | | | |
| **Restaurant** | Table Management | | | | | ✓ | | | | | ✓ | ✓ |
| **Restaurant** | Menu Management | | | | | ✓ | | | | | ✓ | ✓ |
| **Restaurant** | Dining Reservations | | | | | ✓ | | ✓ | | | ✓ | ✓ |
| **Restaurant** | Room Service Orders | ✓ | | | | ✓ | | | | | ✓ | ✓ |
| **Restaurant** | Guest Room Charges | ✓ | | | | ✓ | | | ✓ | | ✓ | ✓ |
| **Communications** | Internal Chat | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Communications** | Guest Messaging | ✓ | | | | | ✓ | ✓ | | | ✓ | ✓ |
| **Communications** | Announcements | | | | | | | | | | ✓ | ✓ |
| **Communications** | Shift Handover | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | ✓ | ✓ |
| **Finance** | Folio Management | ✓ | | | | | | | ✓ | | ✓ | ✓ |
| **Finance** | Invoice & Receipts | ✓ | | | | ✓ | | | ✓ | | ✓ | ✓ |
| **Finance** | Daily Summary | | | | | | | | ✓ | | ✓ | ✓ |
| **Finance** | Accounts Payable | | | | | | | | ✓ | | ✓ | ✓ |
| **Finance** | Revenue Reports | | | | | | | | ✓ | | ✓ | ✓ |
| **Inventory** | Stock Dashboard | | | ✓ | ✓ | ✓ | | | ✓ | | ✓ | ✓ |
| **Inventory** | Products | | | | | | | | ✓ | | ✓ | ✓ |
| **Inventory** | Suppliers | | | | ✓ | | | | ✓ | | ✓ | ✓ |
| **Inventory** | Stock Transactions | | | ✓ | ✓ | ✓ | | | ✓ | | ✓ | ✓ |
| **Inventory** | Purchase Orders | | | | | | | | ✓ | | ✓ | ✓ |
| **HR & Staff** | Staff Directory | | | | | | | | | | ✓ | ✓ |
| **HR & Staff** | Roles & Permissions | | | | | | | | | ✓ | ✓ | ✓ |
| **HR & Staff** | Attendance | | | | | | | | ✓ | | ✓ | ✓ |
| **HR & Staff** | Shift Scheduler | | | | | | | | | | ✓ | ✓ |
| **HR & Staff** | Payroll Summary | | | | | | | | ✓ | | ✓ | ✓ |
| **Multi-Branch** | Branch Overview | | | | | | | | | | | ✓ |
| **Multi-Branch** | Branch Comparison | | | | | | | | | | | ✓ |
| **Multi-Branch** | Central Sync Status | | | | | | | | | ✓ | | ✓ |
| **Reports** | Occupancy Reports | | ✓ | | | | | | ✓ | | ✓ | ✓ |
| **Reports** | Revenue Reports | | | | | | | | ✓ | | ✓ | ✓ |
| **Reports** | Department Reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Reports** | Guest Analytics | | ✓ | | | | | ✓ | | | ✓ | ✓ |
| **Reports** | Inventory Reports | | | ✓ | | ✓ | | | ✓ | | ✓ | ✓ |
| **Reports** | Staff Reports | | | | | | | | ✓ | | ✓ | ✓ |
| **IT Admin** | User Management | | | | | | | | | ✓ | ✓ | ✓ |
| **IT Admin** | System Health | | | | | | | | | ✓ | | ✓ |
| **IT Admin** | Device Management | | | | | | | | | ✓ | | |
| **IT Admin** | Backup & Restore | | | | | | | | | ✓ | | ✓ |
| **IT Admin** | Audit Log | | | | | | | | | ✓ | | ✓ |
| **Settings** | Hotel Configuration | | | | | | | | | ✓ | ✓ | ✓ |
| **Settings** | Door Lock Integration (ST-04) | | | | | | | | | ✓ | ✓ | ✓ |
| **Settings** | Synchronization | | | | | | | | | ✓ | | ✓ |
| **Settings** | My Preferences | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Door Lock** | Emergency Revoke (action) | ✓ | | | | | ✓ | | | | ✓ | ✓ |
| **Door Lock** | Lock Queue Monitor (top bar) | ✓ | | | | | ✓ | | | ✓ | ✓ | ✓ |

---

## 2.6 Notification Slide-Over Panel

**Trigger:** Bell icon in top header. **Width:** 400px, full viewport height, right side, scrim behind.

**Panel header:** "Notifications" + "Mark all read" (right) + close X.
**Filter tabs:** All | Urgent | Operational | System | Door Lock.

**Notification item (72px min-height):**
- Left: 4px color border by category + category icon in 40px tinted circle
- Center: bold 13px title + 12px body (2-line clamp) + 11px relative timestamp
- Right: unread blue dot if unread; dismiss X on hover

**Notification Categories:**

| Category | Color | Examples |
|---|---|---|
| Emergency/Urgent | `#EF4444` | Fire alarm, medical, guest complaint escalation, emergency revoke |
| Reservation | `#6366F1` | New booking, cancellation, VIP arrival |
| Housekeeping | `#22C55E` | Room ready, inspection needed, DND extended |
| Maintenance | `#F97316` | Work order created, overdue task, equipment failure |
| Finance | `#14B8A6` | Payment received, folio discrepancy, end-of-day summary |
| Restaurant | `#EAB308` | Room service order, dining reservation |
| Door Lock | `#8B5CF6` | Access activated, card lost, queue expired, API error |
| System | `#6B7280` | Login, backup complete, shift change, sync events |
| Chat | `#3B82F6` | Direct message, @mention |

Footer: "View all notifications" → full Notifications screen.

---

# PART 3 — GLOBAL UI BEHAVIORS

## 3.1 Three Required States for Every List, Table, and Widget

Every screen with data must have all three states designed before it is considered complete:
- **Loading:** Skeleton loaders matching the shape and row count of the actual content.
- **Empty:** Icon + one-line plain-language message + single primary CTA. E.g., "No guests checked in today — Register a walk-in guest."
- **Offline/Error:** Muted amber banner at the top of the content area: "You're offline — showing last synced data. Changes will sync when connected." Not a blocking error, not a full-page takeover.

## 3.2 Offline-First & Sync Indicators

**Sync status pill (top bar, always visible):**
- 🟢 Green + "Synced" — connected, all changes pushed.
- 🟡 Amber + "N pending" — offline or unconfirmed local changes.
- ⚫ Gray + "Offline" — no connectivity detected.

**Lock queue pill (top bar, visible when door lock commands are queued):**
- 🟣 Purple + "N lock commands queued" — door lock commands waiting for internet.

**Per-record sync badge:** Records created or edited while offline carry a "Pending sync" badge until push is confirmed.

**Conflict Resolution Modal:** Triggered when sync detects conflicting edits to the same record. Side-by-side "Local Version" vs. "Server Version" with: Keep Local | Keep Server | Resolve Manually. Decision logged in Audit Log.

## 3.3 Status Badge Color Coding

**Room Status:**
| Status | Color | Label |
|---|---|---|
| Available | `#2E7D32` Green | Available |
| Reserved | `#1BA39C` Teal | Reserved |
| Occupied | `#F57C00` Orange | Occupied |
| Cleaning | `#FFA000` Amber | Cleaning |
| Maintenance | `#D32F2F` Red | Maintenance |
| Out of Service | `#6B7280` Gray | Out of Service |

**Reservation Status:**
| Status | Color | Label |
|---|---|---|
| Confirmed | `#1BA39C` | Confirmed |
| Pending | `#FFA000` | Pending |
| Checked In | `#2E7D32` | Checked In |
| Checked Out | `#6B7280` | Checked Out |
| Cancelled | `#D32F2F` | Cancelled |
| No Show | `#EF4444` | No Show |

**Work Order / Task Status:**
| Status | Color | Label |
|---|---|---|
| Reported | `#6366F1` | Reported |
| Assigned | `#1BA39C` | Assigned |
| In Progress | `#F57C00` | In Progress |
| Completed | `#2E7D32` | Completed |
| Overdue | `#D32F2F` | Overdue |

**Access Credential Status:**
| Status | Color | Label |
|---|---|---|
| Active | `#2E7D32` | Active |
| Pending Sync | `#FFA000` | Pending Sync |
| Revoked | `#D32F2F` | Revoked |
| Expired | `#6B7280` | Expired |
| Failed | `#EF4444` | Failed |

---

# PART 4 — COMPLETE SCREEN INVENTORY

---

## MODULE: DASHBOARD

### D-01 — My Dashboard
**Roles:** All (content adapts per role)
**Purpose:** Role-specific overview of current shift priorities and immediate action items.

**Front Desk:** Rooms Available, Check-ins Today, Check-outs Today, Outstanding Balances. Quick actions: New Reservation, Quick Check-In, Quick Check-Out, Post Charge. Widgets: Today's Arrivals, Today's Departures, In-House count, Recent Activity.

**Housekeeping:** Rooms to Clean, In Progress, Completed, Inspections Pending. Quick actions: Start Cleaning, Report Issue, Log Lost & Found, Request Supplies. Widgets: My Task List, Room Status summary, Pending Inspections.

**Maintenance:** Open Work Orders, Overdue, Completed Today, Assets Due for Service. Quick actions: New Work Order, View Overdue. Widgets: Work Order list by priority, Upcoming preventive maintenance.

**Finance:** Revenue Today, Outstanding Invoices, Payments Received, Discounts Applied. Quick actions: Create Invoice, View Outstanding. Widgets: Revenue trend mini-chart, Recent transactions.

**Restaurant:** Tables Occupied, Orders in Queue, Room Service Pending, Today's Revenue. Quick actions: Open POS, View Kitchen Queue. Widgets: Active orders, table occupancy overview.

**Hotel Management / ORG:** Occupancy Rate, Revenue Today, Active Guests, Open Issues. All department KPI mini-cards, Revenue trend chart, Occupancy trend chart, Department alerts, Recent Activity.

### D-02 — Management Overview
**Roles:** MGT, ORG
**Purpose:** Executive-level property or multi-branch performance view.
**Data:** Occupancy % with trend, RevPAR, in-house count, today's arrivals/departures, revenue breakdown by category, department KPI cards (Housekeeping efficiency, Maintenance open orders, Restaurant covers, Finance outstanding), alert panel with all unresolved urgent notifications.
**Actions:** Drill into any department, export summary PDF.

---

## MODULE: RESERVATIONS

### R-01 — Reservation Grid
**Roles:** FD, RSV, RO, CS, MGT, ORG
**Purpose:** Visual room-availability matrix — all rooms × date range, reservation blocks as colored bars.
**Layout:** Rooms as frozen left column (room number, type, status badge). Dates as columns (14–30 day range, horizontal scroll). Reservation bars span dates, color-coded by status.
**Actions:** Click empty cell → New Reservation pre-filled. Click bar → Reservation Detail side panel. Drag bar → reschedule with conflict detection. Filter by room type, floor, status. Date navigator: forward/back, jump-to-date.

### R-02 — New Reservation Form
**Roles:** FD, RSV, CS, MGT, ORG
**Purpose:** Create a new reservation.
**Fields:** Guest (search existing or inline create), Booking type toggle (Individual/Group/Walk-in), Date-range picker with live availability check, Room type selector (shows available count), Specific room (optional), Rate plan, Nightly rate (auto-filled, overridable with reason), Adults/children, Special requests, Deposit toggle + amount + payment method.
**Actions:** Save Draft, Confirm Reservation, Assign Room Now, Print Confirmation.
**Validation:** Conflict detection — inline warning if selected room is unavailable for overlapping dates. Cannot submit while conflict exists.

### R-03 — Reservation Detail
**Roles:** FD, RSV, RO, CS, MGT, ORG
**Purpose:** Full view and management of a single reservation.
**Tabs:** Overview (all booking data), Folio (charges so far), History (full audit trail), Notes (internal + guest special requests).
**Actions:** Modify, Cancel, Check In (→ FD-01), Add Note, Post Charge, Assign/Reassign Room, Print Confirmation, View Guest Profile.

### R-04 — Group Booking Manager
**Roles:** RSV, MGT, ORG
**Purpose:** Block bookings for groups, conferences, events.
**Data:** Group name, event type, organizer contact, room block (type, quantity, dates), rooming list, master folio reference.
**Actions:** Add room types to block, assign guests to rooms, generate rooming list PDF, create master folio, cancel group booking.

### R-05 — Waitlist
**Roles:** FD, RSV, RO, MGT, ORG
**Purpose:** Manage guests waiting for a room type.
**Columns:** Guest, Requested dates, Room type, How long waiting, Priority.
**Actions:** Promote to reservation (when room available), contact guest, remove, re-order priority.

### R-06 — Rate Management
**Roles:** RSV, FIN, MGT, ORG
**Purpose:** Configure all room rate plans, seasonal pricing, promotions.
**Data:** Rate plan name, applicable room types, base rate, date overrides, corporate/group rates, active date ranges, discount structures.
**Actions:** Create rate plan, set date overrides, activate/deactivate plan.

### R-07 — Reservation Search
**Roles:** FD, RSV, RO, CS, MGT, ORG
**Purpose:** Search all reservations by multiple criteria.
**Filters:** Guest name, reservation ID, room, check-in date range, status, booking type.
**Actions:** Open reservation, check in, cancel.

### R-08 — Cancellation & Refund
**Roles:** FD, RSV, MGT, ORG
**Purpose:** Process reservation cancellations with policy enforcement.
**Data:** Policy terms, cancellation fee owed, refundable amount, deposit paid.
**Actions:** Confirm cancellation, waive fee (MGT/ORG + reason required), process refund.

---

## MODULE: FRONT DESK

### FD-01 — Check-In (7 steps)
**Roles:** FD, MGT, ORG
**Layout:** Multi-step wizard with horizontal progress bar.

**Step 1 — Select Reservation:** Search by name, reservation ID, or room. Today's arrivals list for quick selection. Or start Walk-In flow.

**Step 2 — Verify Guest:** Display guest profile, ID type/number, photo. Upload/scan ID document. Confirm details. VIP alert banner if applicable.

**Step 3 — Assign Room:** Confirm pre-assigned room or select from available-room grid filtered by reserved type. Room card: number, type, floor, amenities, housekeeping status (must be Clean/Inspected to assign).

**Step 4 — Collect Payment/Deposit:** Amount due, payment method selector (Cash, POS/Card, Transfer), receipt preview.

**Step 5 — Generate Receipt:** Print and email/WhatsApp send options.

**Step 6 — Confirm Check-In:** Room status → Occupied. Folio opens.

**Step 7 — Activate Room Access** *(if Door Lock integration enabled — see Part 6 for full spec):* Connectivity check, credential type selector (Key Card / PIN / Both), encoding/generation flow, offline fallback. Summary of issued credentials. "Complete Check-In" button finalizes wizard.

Back navigation: allowed steps 1–3. Disabled after payment captured in Step 4.

### FD-02 — Check-Out & Settlement
**Roles:** FD, MGT, ORG
**Layout:** Two-column. Left: full itemized folio. Right: payment section.

**Folio:** Charge list (date, category, description, amount, posted by), editable line items, subtotal/taxes/discounts/total, previous payments, balance remaining.
**Payment:** Split payment support (Cash + Card + Transfer simultaneously). Amount received, change due.
**Actions:** Settle Folio, Process Payment, Print Receipt, Send Receipt, Release Room (→ Cleaning), Extend Stay. Auto-triggers access revocation via TTLock (see Part 6.9).

### FD-03 — Room Assignment Board
**Roles:** FD, RSV, MGT, ORG
**Purpose:** Drag-and-drop guest-to-room assignment tool.
**Layout:** Left: unassigned arrivals list. Right: available room grid.
**Actions:** Drag arrival to room, swap assignments, auto-assign all, view room detail.

### FD-04 — Guest Profiles (list)
**Roles:** FD, RSV, RO, CS, MGT, ORG
**Filters:** Active Stay, Blacklisted, VIP, Has Balance.
**Actions:** Open profile, create new guest, merge duplicates.

### FD-05 — Guest Profile Detail
**Roles:** FD, RSV, RO, CS, MGT, ORG
**Tabs:** Overview (contact, ID documents, notes, blacklist status), Stay History, Preferences, Folios, Complaints & Feedback.
**Actions:** Edit, Add note, Create reservation, View folio, Blacklist (MGT/ORG, requires reason), Merge.

### FD-06 — In-House Guest List
**Roles:** FD, RO, MGT, ORG
**Columns:** Room, Guest Name, Check-in, Expected Check-out, Nights Remaining, VIP, Balance, Actions.
**Row actions:** Check Out, View Profile, View Folio, Send Message, Post Charge, Revoke Room Access.

### FD-07 — Arrivals List
**Roles:** FD, RSV, MGT, ORG
**Columns:** Expected Time, Guest, Reservation ID, Room Type, Room Assigned (Y/N), Special Requests, VIP, Actions.
**Actions:** Pre-assign room, Check In, Add note.

### FD-08 — Departures List
**Roles:** FD, MGT, ORG
**Columns:** Room, Guest, Expected Check-out, Balance Due, Late Checkout flag, Actions.
**Actions:** Initiate Check-Out, Extend Stay, Post Charge, Mark Late Checkout.

### FD-09 — Key Card Management
**Roles:** FD, IT, MGT, ORG
**Purpose:** Issue, re-encode, and deactivate physical room key cards via connected USB encoder.
**Data:** Room, active card count, last issued time/staff, deactivation log.
**Actions:** Encode new card, Deactivate lost/stolen card, Issue duplicate, View full history. (Note: this is the basic hardware management screen; the full access credential tracking lives in FD-12 and FD-13.)

### FD-10 — Folio Screen
**Roles:** FD, FIN, MGT, ORG
**Layout:** Guest/reservation header, charge table, payment history table, balance summary.
**Charge columns:** Date, Time, Category, Description, Quantity, Unit Price, Amount, Posted By.
**Actions:** Post Manual Charge, Transfer Charge, Apply Discount (manager gate above threshold), Split Folio, Void line item (reason required), Print/Email Folio.

### FD-11 — Walk-In Registration
**Roles:** FD, MGT, ORG
**Purpose:** Rapid combined flow — register guest and check in simultaneously.
**Fields:** Guest basic info, date range, room availability check → room selection, rate, deposit/payment. Creates both reservation and check-in records simultaneously. Proceeds into Check-In Step 7 (Access Activation) if door lock is enabled.

### FD-12 — Room Access Management
**Roles:** FD, RO, MGT, ORG
**Purpose:** Central view of all currently active access credentials across every room. Primary mid-stay access management screen.
**Filter bar:** Search by room/guest | Filter by credential type (Card/PIN/Physical Key) | Status (Active/Pending Sync/Revoked) | Floor.

**Room Access Card (per room):**
```
Room 204                           Sarah Okonkwo
────────────────────────────────────────────────
💳 Key Card ×2   ✅ Active   Valid to: 15 Jan 12:00
   Card 1: XXXX-XXXX  Issued: 12 Jan 14:03  by John A
   Card 2: XXXX-XXYX  Issued: 12 Jan 14:04  by John A

🔢 PIN Code      ✅ Active   Valid to: 15 Jan 12:00
   PIN: 74**12  Issued: 12 Jan 14:05  by John A

[ + Issue Replacement Card ]  [ + New PIN ]  [ Revoke All ]
```

**Issue Replacement Card flow:** Reason selector (Lost / Not working / Additional copy / Other) → Encode flow → If "Lost": prompt to revoke old card → TTLock API call → New credential record with `parent_credential_id` linking to original.

**Revoke All:** Destructive-confirm modal → calls TTLock API for all active credentials in parallel → logs all events → notifications sent.

### FD-13 — Key Card Log
**Roles:** FD, IT, MGT, ORG
**Purpose:** Complete immutable audit trail of every access credential event at the property.
**Columns:** Timestamp, Event Type (color-coded badge), Room, Guest, Credential Type, Card/PIN Ref, Staff, TTLock API Response, Notes.
**Filter:** Date range, Room, Guest, Event type, Staff member.

**Event type badge colors:**
- Issued / Replacement Issued / Duplicate Issued: Accent teal
- Revoked — Check-out: Gray
- Revoked — Lost: Warning amber
- Revoked — Emergency / Manual: Error red
- Encode Failed / API Failed / Sync Failed: Error red
- Queued Offline: Warning amber
- Sync Success: Success green

**Row expansion:** Full TTLock API response JSON, credential IDs, parent credential link.
**Actions:** Export CSV/PDF. No delete capability — append-only.

### FD-14 — PIN Management
**Roles:** FD, RO, MGT, ORG
**Purpose:** Focused view of all active PINs across the property for quick reference and revocation.
**Columns:** Room, Guest, PIN Hint (masked, e.g. 74\*\*12), Valid From, Valid To, Status (Active/Expiring/Expired/Revoked), Issued By, Actions (Revoke | New PIN).

**New PIN (mid-stay):** Revokes current PIN → generates new PIN via TTLock API → displays new PIN once in a modal (one-time display, same rule as check-in) → Print / Copy / Send via WhatsApp options.

**Auto-expiry indicator:** PINs within 2 hours of `valid_to` show amber "Expiring soon" chip.

---

## MODULE: HOUSEKEEPING

### HK-01 — Housekeeping Board
**Roles:** HK, FD, RO, MGT, ORG
**Purpose:** Master room status grid for the entire property's housekeeping state.
**Layout:** Filterable room card grid. Each card: room number, floor, type, housekeeping status badge, assigned attendant avatar (or "Unassigned"), priority indicator, DND icon, inspection status.
**Filters:** Floor, wing/section, status, attendant, priority.
**Actions per card:** Change status, Assign/reassign attendant, Add note, Mark as priority, View detail.

### HK-02 — My Tasks (Tablet)
**Roles:** HK only
**Purpose:** Personal task list for a single housekeeping attendant. Optimized for large-touch tablet use.
**Task card:** Large room number, floor/wing, room type, status badge, guest status (Occupied/Vacant/Check-out), special notes.
**Actions:** Start Cleaning → Mark In Progress → Mark Cleaned → awaits supervisor inspection. Flag issue, Log Lost & Found, Call supervisor.

### HK-03 — Room Cleaning Detail (Tablet)
**Roles:** HK only
**Purpose:** Per-room cleaning checklist used inside the room during cleaning.
**Layout:** Room info header, grouped checklist sections (Bed & Linen, Bathroom, Surfaces, Minibar/Amenities, Final Inspection). Checkbox per item. Photo upload per item optional. Notes field.
**Actions:** Report Damage, Log Lost & Found, Mark Room Complete, Call Supervisor.

### HK-04 — Inspection Log
**Roles:** HK, RO, MGT, ORG
**Purpose:** Record supervisor inspections of cleaned rooms.
**Inspection record:** Room, inspector, timestamp, checklist results (pass/fail per category), overall result, notes, photos.
**Actions:** Create inspection, Fail and reassign to attendant, Re-inspect, Export log.

### HK-05 — Lost & Found
**Roles:** HK, RO, CS, MGT, ORG
**Columns:** Item ID, Description, Location Found, Date, Logged By, Claimed By, Status (Held/Claimed/Disposed).
**Actions:** Add item (description, room, date, photo), Mark claimed (claimant details, print claim receipt), Mark disposed (reason), Search.

### HK-06 — Linen & Supplies Inventory
**Roles:** HK, FIN, MGT, ORG
**Layout:** Product list with stock level bars (current vs. par vs. reorder threshold).
**Actions:** Adjust stock count (with reason), Request Restock, Export report.

### HK-07 — Do Not Disturb Log
**Roles:** HK, FD, RO
**Columns:** Room, Guest, DND Start Time, Hours Elapsed, Expected Check-out, Wellness Check Status.
**Highlight rules:** DND > configurable threshold (e.g., 12 hours) → amber. Approaching check-out without contact → red.
**Actions:** Log wellness check, Override DND (RO/MGT + reason), Clear DND.

### HK-08 — Housekeeping Schedule
**Roles:** HK, MGT, ORG
**Layout:** Grid — attendants as columns, rooms/sections as rows, shift assignments as cells.
**Actions:** Assign/reassign rooms, balance workload automatically, print assignment sheets, view coverage gaps.

---

## MODULE: MAINTENANCE

### MX-01 — Work Order List
**Roles:** FD, HK, MX, CS, MGT, ORG
**Columns:** Order ID, Location, Category, Priority (color-coded), Status badge, Assigned Technician, Created By, Created At.
**Filters:** Status, priority, category, technician, date range.
**Actions:** Create, filter, open detail, bulk reassign.

### MX-02 — Work Order Detail
**Roles:** MX, MGT, ORG
**Layout:** Left: all order fields + status history timeline. Right: activity log (notes + photos, chronological).
**Data:** Description, location, category, priority, technician, SLA deadline, parts used, time logged, status history.
**Actions:** Update status, Add time log, Add note, Attach photo, Close order, Escalate.

### MX-03 — New Work Order Form
**Roles:** All roles with reporting access
**Fields:** Location (room selector or free-text), Category, Priority, Description, Photo attachments, Reporter contact.

### MX-04 — Asset Register
**Roles:** MX, IT, MGT, ORG
**Columns:** Asset ID, Name, Category, Location, Purchase Date, Warranty Expiry, Last Serviced, Next Service Due, Status.
**Actions:** Add asset, Edit, Link work orders, Attach documents, Print QR label, Export.

### MX-05 — Asset Detail
**Roles:** MX, IT, MGT, ORG
**Tabs:** Overview, Service History (linked work orders), Documents (manuals, warranties), Photos.
**Actions:** Edit, Create work order for this asset, Print QR label, Archive/dispose.

### MX-06 — Preventive Maintenance Schedule
**Roles:** MX, MGT, ORG
**Layout:** Calendar view with tasks on due dates; list view toggle.
**Data:** Task name, linked asset, frequency, last completed, next due date, completion history.
**Actions:** Create schedule entry, Mark complete, Reschedule, Create work order from overdue task.

### MX-07 — Vendor Contacts
**Roles:** MX, FIN, MGT, ORG
**Columns:** Company, Contact, Specialty, Phone, Contract type, Last engagement.
**Actions:** Add vendor, Edit, Create work order linked to vendor, Log call.

---

## MODULE: RESTAURANT / POS

### RT-01 — POS Terminal
**Roles:** RT only
**Layout:** Full-screen POS. Left: table/order selector. Center: menu grid (category tabs + item buttons). Right: running order total.
**Item button:** Name, price, availability. Tap adds to order. Long press → modifier panel.
**Actions:** Send to kitchen (→ RT-02), Hold order, Split bill (by item/seat/percentage), Apply discount (authorization gate), Accept payment (multi-method), Close check, Transfer order, Post to room folio.

### RT-02 — Kitchen Display Screen (KDS)
**Roles:** RT only
**Layout:** Full screen for wall-mounted display. Order cards color-coded by age (green → amber → red).
**Order card:** Table/room number, items with modifiers, time elapsed, item completion checkboxes.
**Actions:** Mark item ready, Mark order complete, Bump (archive), Recall bumped order, Toggle priority.

### RT-03 — Table Management
**Roles:** RT, MGT, ORG
**Layout:** Configurable floor plan. Tables as colored shapes — Available (green), Occupied (orange + guest count + time), Reserved (teal), Dirty/Cleaning (amber).
**Actions:** Seat party (→ RT-01), Combine tables, Mark dirty, Assign server, Reserve (→ RT-05), View active check.

### RT-04 — Menu Management
**Roles:** RT, MGT, ORG
**Layout:** Category list left; items within selected category right as cards.
**Item fields:** Name, description, price, category, photo, allergens, dietary flags, availability toggle.
**Actions:** Add category, Add/edit item, Set as 86'd, Create daily specials, Set printer/KDS routing.

### RT-05 — Dining Reservations
**Roles:** RT, CS, MGT, ORG
**Columns:** Date, Time, Party Size, Guest Name, Table, Special Requests, Status.
**Actions:** Create, Seat on arrival (→ RT-03), Cancel, Waitlist, Link to hotel guest profile.

### RT-06 — Room Service Orders
**Roles:** RT, FD, MGT, ORG
**Columns:** Order ID, Room Number, Guest, Items, Order Time, Promised Delivery, Status, Assigned Delivery Staff.
**Actions:** Accept, Assign delivery staff, Mark in-kitchen, Mark delivered, Post charge to folio.

### RT-07 — Guest Room Charges
**Roles:** FD, RT, FIN, MGT, ORG
**Purpose:** View and manage all F&B charges posted to guest room folios.
**Actions:** Post new charge to room, Transfer charge, Dispute/reverse charge (manager approval + reason).

---

## MODULE: COMMUNICATIONS

### CO-01 — Internal Chat
**Roles:** All roles
**Purpose:** Real-time LAN-based staff messaging. Operates fully offline over the local server.
**Layout:** Two-column messenger. Left: conversation list (direct messages + department group channels). Right: active thread.
**Features:** Direct messages, department group channels, @mentions, image attachments, timestamps, read receipts, presence indicators (on-shift/offline). Emergency broadcast button (🚨) at top — sends high-priority alert to all online users simultaneously.

### CO-02 — Guest Messaging
**Roles:** FD, RO, CS, MGT, ORG
**Purpose:** Message in-house guests via WhatsApp, SMS, or internal guest portal.
**Layout:** Conversation list left (one thread per in-house guest), active thread right with reply box.
**Actions:** Send message, forward to department, escalate to manager, mark resolved.

### CO-03 — Announcements
**Roles:** MGT, ORG (create); all (read)
**Fields:** Title, body, target audience (all staff / specific department / specific role), expiry date.
**Actions:** Create, Edit, Archive, Mark as read per staff member.

### CO-04 — Shift Handover
**Roles:** FD, RSV, HK, MX, RT, RO, MGT, ORG
**Purpose:** Structured handover notes between shift changes. Triggered by Shift Indicator in header.
**Sections:** Outstanding tasks, VIP guests, Maintenance issues open, Guest complaints in progress, Pending payments, General notes.
**Actions:** Create record (outgoing shift leader), Acknowledge (incoming shift leader), View archive.

---

## MODULE: FINANCE & BILLING

### FI-01 — Folio Management (Finance view)
**Roles:** FD, FIN, MGT, ORG
**Columns:** Folio ID, Guest/Reference, Room, Check-in, Check-out, Total Charges, Payments Applied, Balance, Status (Open/Closed/Disputed).
**Filters:** Status, date range, balance > 0.
**Actions:** Open folio, post adjustment, transfer charges, close folio, export.

### FI-02 — Invoice & Receipts
**Roles:** FD, RT, FIN, MGT, ORG
**Invoice list filters:** Paid, Outstanding, Refunded, Cancelled.
**Invoice fields:** Client name, billing address, line items, subtotal, tax breakdown, discount, total, payment terms.
**Actions:** Create, Edit draft, Mark as paid, Process refund (destructive — confirmation required), Print/PDF, Send via email/WhatsApp.

### FI-03 — Daily Summary
**Roles:** FIN, MGT, ORG
**Data:** Revenue by category, payments by method, discounts, tax collected, refunds, outstanding total, opening/closing cash balance.
**Actions:** Generate/lock summary, Export PDF, Reopen (MGT/ORG + reason).

### FI-04 — Accounts Payable
**Roles:** FIN, MGT, ORG
**Columns:** Vendor, Invoice Number, Invoice Date, Due Date, Amount, Status (Unpaid/Paid/Overdue).
**Actions:** Add vendor invoice, Mark as paid, Schedule payment, Export AP report.

### FI-05 — Revenue Reports
**Roles:** FIN, MGT, ORG
**Charts:** Daily revenue trend, Revenue by category (pie/bar), RevPAR, ADR, Occupancy × Rate correlation.
**Filters:** Date range, room type, rate plan.
**Actions:** Export PDF, Excel, CSV.

---

## MODULE: INVENTORY

### IV-01 — Stock Dashboard
**Roles:** HK, MX, RT, FIN, MGT, ORG
**Widgets:** Low-stock alert card, total item count, total stock value, recent transaction summary. Low-stock banner lists items below threshold with "Reorder" quick action.

### IV-02 — Products / Items
**Roles:** FIN, MGT, ORG (manage); others view
**Columns:** Item code, Name, Category, Unit, Current Stock, Par Level, Reorder Threshold, Unit Cost, Location, Last Updated.
**Actions:** Add item, Edit, Adjust stock count (reason + reference), View transaction history.

### IV-03 — Suppliers
**Roles:** FIN, MX, MGT, ORG
**Columns:** Supplier name, Contact, Phone, Category, Payment terms, Last order date.
**Actions:** Add, Edit, Create purchase order.

### IV-04 — Stock Transactions
**Roles:** HK, MX, RT, FIN, MGT, ORG
**Columns:** Date, Item, Type (In/Out/Adjustment), Quantity, Reference, Logged By.
**Actions:** Log manual transaction, Attach document, Export.

### IV-05 — Purchase Orders
**Roles:** FIN, MGT, ORG
**Columns:** PO Number, Supplier, Date, Items, Total Value, Status (Draft/Sent/Received/Cancelled).
**Actions:** Create PO (select supplier, add items, set quantities), Send, Mark received (triggers stock transaction auto-entry), Cancel, Print.

---

## MODULE: HR & STAFF

### HR-01 — Staff Directory
**Roles:** MGT, ORG
**Columns:** Avatar, Full Name, Employee ID, Role, Department, Phone, Status.
**Actions:** Add staff, View profile, Deactivate account.

### HR-02 — Staff Profile Detail
**Roles:** MGT, ORG (full); each staff sees own profile
**Tabs:** Overview (contact, role, emergency contact), Attendance log, Shifts (upcoming), Payroll Summary, Management Notes.
**Actions (MGT/ORG):** Edit, Reset password, Change role, Deactivate, Add note.

### HR-03 — Roles & Permissions
**Roles:** IT, MGT, ORG
**Layout:** Role list left; permission matrix for selected role right (each module/action as toggle row).
**Actions:** Edit permissions, Create custom role, View role's current users.

### HR-04 — Attendance
**Roles:** FIN, MGT, ORG
**Layout:** Date-range filter; staff rows × daily attendance columns (Present/Absent/Late/On Leave).
**Actions:** Record manual entry, Approve leave requests, Export report.

### HR-05 — Shift Scheduler
**Roles:** MGT, ORG
**Layout:** Calendar/grid — dates as columns, staff as rows, shift blocks as cells.
**Actions:** Create shift block, Clone last week's schedule, Publish to staff, Export printable roster.

### HR-06 — Payroll Summary
**Roles:** FIN, MGT, ORG
**Layout:** Pay period selector; staff list with calculated gross pay.
**Actions:** View breakdown per staff, Export for payroll processing, Adjust rate on file.

---

## MODULE: MULTI-BRANCH MANAGEMENT

### MB-01 — Branch Overview
**Roles:** ORG only
**Layout:** Card per branch: name, location, occupancy %, revenue today, open issues, last sync time, branch manager name.
**Actions:** Click card → enter that branch's view. Add new branch record (triggers provisioning workflow).

### MB-02 — Branch Comparison
**Roles:** ORG only
**Widgets:** Side-by-side bar charts (occupancy, revenue, ADR). Comparison table (all branches × KPI metrics). Date-range filter.
**Actions:** Export comparison report, drill into branch.

### MB-03 — Central Sync Status
**Roles:** ORG, IT
**Columns:** Branch name, Last Sync Time, Pending Items, Sync Status (green/amber/red), Local Server IP, Actions.
**Actions:** Force sync for a branch, View sync error log, Flag branch as offline/unreachable.

---

## MODULE: IT ADMIN

### IT-01 — User Management
**Roles:** IT, MGT, ORG
**Columns:** Name, Email, Role, Department, Status, Last Login.
**Actions:** Invite new user, Edit role, Reset password, Deactivate/reactivate, View audit log for user.

### IT-02 — System Health
**Roles:** IT, MGT, ORG
**Widgets:** Local server status (CPU %, RAM %, disk, uptime), Database status (connection, size, last backup), Network status (LAN, internet, latency to central server), Service statuses (each internal service: up/down + last restart).
**Actions:** Restart service, View error logs, Run diagnostic, Send health report to Platform Owner.

### IT-03 — Device Management
**Roles:** IT only
**Columns:** Device name, Type (PC/Tablet), Department, IP Address, MAC Address, Last Seen, Status.
**Actions:** Register device, Deauthorize, View access log per device.

### IT-04 — Backup & Restore
**Roles:** IT, ORG
**Backup:** Frequency selector, Manual "Back Up Now" button + progress, Snapshot list (timestamp, size, type, location: Local/Cloud).
**Restore:** Select snapshot → Restore Local or Restore from Cloud. Each gated behind destructive-confirm: "Confirm by typing RESTORE."

### IT-05 — Audit Log
**Roles:** IT, ORG
**Columns:** Timestamp, User, Role, Action, Module, Record affected, IP Address, Details (expandable).
**Filters:** User, module, action type, date range.
**Actions:** Export CSV/PDF, Search. Append-only — no delete or edit.

---

## MODULE: REPORTS

### RP-01 — Occupancy Reports
**Roles:** RSV, FIN, MGT, ORG
**Charts:** Occupancy % by day (line), by room type (bar), No-show rate, Cancellation rate, Average Length of Stay.
**Filters:** Date range, room type. **Actions:** Export PDF, Excel, CSV.

### RP-02 — Revenue Reports
**Roles:** FIN, MGT, ORG
**Charts:** Revenue by day (line), by category (pie), ADR, RevPAR, vs. last period.
**Filters:** Date range, category, room type. **Actions:** Export.

### RP-03 — Department Reports
**Roles:** All (each sees own department only)
**Front Desk:** Check-in/out counts, average processing time, walk-in rate.
**Housekeeping:** Rooms cleaned per attendant, average turnaround, inspection pass rate.
**Maintenance:** Orders created/closed, average resolution time, overdue rate.
**Restaurant:** Covers served, average check size, popular items, kitchen ticket time.
**Actions:** Export.

### RP-04 — Guest Analytics
**Roles:** RSV, CS, MGT, ORG
**Charts:** Repeat guest rate, Nationality breakdown, Average stay duration, Loyalty tier distribution, Complaint volume trend.
**Actions:** Export.

### RP-05 — Inventory Reports
**Roles:** HK, RT, FIN, MGT, ORG
**Charts:** Consumption by category, Low-stock frequency, Supplier spend. **Actions:** Export.

### RP-06 — Staff Reports
**Roles:** FIN, MGT, ORG
**Charts:** Hours worked by department, Attendance rate, Shift coverage gaps. **Actions:** Export.

---

## MODULE: SETTINGS

### ST-01 — Hotel / Property Configuration
**Roles:** IT, MGT, ORG
**Sections:**
- **Property Profile:** Name, logo, address, contact, check-in/out times, currency, timezone.
- **Enabled Modules:** Toggles for optional modules (Restaurant/POS, Inventory, Multi-Branch, Door Lock). Visibility in sidebar and permissions matrix driven by these toggles. Auto-matched to subscription plan.
- **Tax Configuration:** Rate(s), name(s), inclusive/exclusive, applicable categories.
- **Pricing Rules:** Rate rounding, discount approval threshold.

### ST-02 — Synchronization
**Roles:** IT, ORG
**Data:** Connection status, central server URL, last sync time, pending item count, last sync duration, sync error history.
**Actions:** Sync Now, Clear pending queue (confirmation required), Edit server connection settings, View conflict history.

### ST-03 — My Preferences
**Roles:** All (each user manages own)
**Sections:** Language, Date/time format, Theme (Light/Dark), Notification preferences by category, Dashboard widget layout (drag-to-reorder).

### ST-04 — Door Lock Integration
**Roles:** IT, MGT, ORG
**Purpose:** Configure TTLock API connection for this branch. Full spec in Part 6.11.

---

# PART 5 — END-TO-END USER FLOWS

### Flow 1 — Standard Reservation to Check-Out
Dashboard → [R-01] Reservation Grid → [R-02] New Reservation → [R-03] Reservation Detail (confirmation) → [FD-01] Check-In Steps 1–7 → [FD-10] Folio (charges accumulate) → [FD-02] Check-Out & Settlement → Receipt → Room released to Cleaning → Access credentials auto-revoked (TTLock) → [HK-01] Housekeeping Board updated.

### Flow 2 — Walk-In Registration
Dashboard → [FD-11] Walk-In Registration → Room selected, guest registered, reservation + check-in created simultaneously → [FD-01] Step 7 (Activate Room Access) → [FD-10] Folio opens → Room: Occupied.

### Flow 3 — Housekeeping Shift (Tablet)
[HK-02] My Tasks (attendant views assigned rooms) → [HK-03] Room Cleaning Detail (cleans, checks off items, reports damage, logs lost & found) → Mark cleaned → [HK-04] Inspection Log (supervisor inspects) → Room: Inspected/Available → Front desk notified → Available for room assignment.

### Flow 4 — Maintenance Request to Closure
Any staff → [MX-03] New Work Order → [MX-01] Work Order List (technician views) → [MX-02] Work Order Detail (update status, log time, attach photos) → Mark Completed → Room/Asset status updated → Logged in [IT-05] Audit Log.

### Flow 5 — Restaurant Order to Room Charge
[RT-01] POS Terminal (order placed, "Post to room" selected) → [RT-02] Kitchen Display (kitchen prepares) → [RT-06] Room Service Orders (delivery) → Charge auto-posted to [FD-10] Folio → Visible at check-out in [FD-02].

### Flow 6 — Offline → Sync Recovery
Staff performs actions while internet is down → sync indicator: Amber / "7 pending" → Internet restored → Toast: "Reconnected — syncing 7 items" → Indicator transitions amber → green → If conflicts: [Conflict Resolution Modal] → Staff resolves → All changes confirmed → Event logged in [IT-05].

### Flow 7 — Shift Handover
End of shift → [CO-04] Shift Handover (triggered by Shift Indicator in header) → Outgoing staff fills all sections → Submits → Incoming shift leader sees notification, opens, reviews, acknowledges → Both actions logged with timestamps.

### Flow 8 — Guest Check-In with Door Lock Activation
[FD-01] Step 1–6 (standard check-in) → Step 7: Connectivity check → If online: Credential type selector → Staff selects Key Card + PIN → Encode card via USB encoder (TTLock API called simultaneously) → PIN generated and displayed once → Summary screen shows: ✅ Card ×1 active, ✅ PIN active → Print receipt with PIN → "Complete Check-In" → Reservation: Checked In, Room: Occupied.

### Flow 9 — Lost Key Card Mid-Stay
Front Desk receives lost card report → [FD-12] Room Access Management → Locate room card → "+ Issue Replacement Card" → Reason: "Guest lost card" → Encode new card → Prompt: "Revoke lost card?" → Confirm → TTLock API: revokes old card serial, activates new card → Events logged in [FD-13] Key Card Log with parent/child link → Guest receives new card → New card shown as active in Room Access Management.

### Flow 10 — Emergency Access Revocation
Any authorized staff → [FD-06] In-House Guest List → Guest row → "Revoke Room Access" → [Emergency Revoke Modal]: Select reason → Confirm → TTLock API called for all credentials in parallel → All revoked → Toast to all logged-in staff: "⚠ Emergency revoke — Room 204 by [name]" → Notification to MGT/ORG → Logged in [IT-05] Audit Log.

---

# PART 6 — DOOR LOCK & ACCESS CONTROL

## 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER (Front Desk PC)                                        │
│  – Check-In Step 7 (Activate Room Access)                       │
│  – Room Access Management (FD-12)                               │
│  – Key Card Log (FD-13)                                         │
│  – PIN Management (FD-14)                                       │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP (local LAN)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL SERVER                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Lock Provider Interface (abstraction layer)             │  │
│  │  activateCardAccess() · generatePIN()                    │  │
│  │  revokeAccess() · getAccessLog()                         │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │  TTLock Adapter                                          │  │
│  │  Translates interface calls → TTLock API requests        │  │
│  │  Handles auth tokens, refresh, rate limits               │  │
│  │  Logs every API response locally                         │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │  Offline Queue (lock_sync_queue table)                   │  │
│  │  If TTLock unreachable: queue command, return status     │  │
│  │  Retry every 2 min when internet returns                 │  │
│  │  Expire items older than check-out datetime              │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Card Encoder Agent (background service on FD PC)       │  │
│  │  Listens on local port for encode commands               │  │
│  │  Interfaces with USB card encoder hardware               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS (internet required)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  TTLOCK CLOUD API                                               │
│  Authenticates, authorizes, pushes commands via MQTT            │
└────────────────────┬────────────────────────────────────────────┘
                     │ WiFi / Zigbee / Bluetooth (hotel LAN)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  TTLOCK GATEWAY (hardware on-site) → Smart Lock on door         │
└─────────────────────────────────────────────────────────────────┘
```

**Key principle:** Browser never calls TTLock directly. API keys never leave the local server. All lock commands are logged locally before leaving the server. Adding a second provider in future (e.g., ZKTeco) requires only a new adapter — no UI changes.

**Internet dependency:** TTLock requires internet to issue or revoke credentials. Once activated, the lock and card/PIN operate offline indefinitely. Internet is only needed at the moment of issue or revocation.

---

## 6.2 Credential Types

| Type | Issue requires internet | Use at door requires internet |
|---|---|---|
| Key Card | Yes | No — encoded into lock firmware once activated |
| PIN Code | Yes | No — PIN stored on lock firmware |

---

## 6.3 Database Schema (additions to local DB, synced to central)

### `access_credentials`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| organization_id | UUID | FK → organizations |
| branch_id | UUID | FK → branches |
| reservation_id | UUID | FK → reservations |
| guest_id | UUID | FK → guests |
| room_id | UUID | FK → rooms |
| credential_type | ENUM | `card` \| `pin` \| `physical_key` |
| credential_reference | STRING | Card serial / masked PIN hint (e.g. 74\*\*12) |
| ttlock_card_id | STRING | TTLock card ID (returned on encode) |
| ttlock_keyboard_pwd_id | STRING | TTLock keyboard password ID (PIN) |
| valid_from | DATETIME | Check-in datetime |
| valid_to | DATETIME | Check-out datetime |
| status | ENUM | `active` \| `revoked` \| `expired` \| `pending_sync` \| `failed` |
| is_duplicate | BOOLEAN | True if replacement/copy of another card |
| parent_credential_id | UUID | FK → access_credentials (for duplicate tracking) |
| issued_by | UUID | FK → users |
| issued_at | DATETIME | Issuance timestamp |
| revoked_by | UUID | FK → users |
| revoked_at | DATETIME | Null until revoked |
| revoke_reason | ENUM | `checkout` \| `lost` \| `expired` \| `manual` \| `emergency` |
| sync_status | ENUM | `synced` \| `pending` \| `failed` |
| ttlock_api_response | JSONB | Raw TTLock API response for debugging |
| notes | TEXT | Staff notes |

### `lock_sync_queue`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| branch_id | UUID | FK → branches |
| command_type | ENUM | `activate_card` \| `activate_pin` \| `revoke_card` \| `revoke_pin` |
| credential_id | UUID | FK → access_credentials |
| payload | JSONB | Full command payload to retry |
| created_at | DATETIME | When queued |
| retry_count | INTEGER | Retry attempts so far |
| last_retry_at | DATETIME | Last attempt |
| expires_at | DATETIME | Set to check-out datetime — auto-expire if guest has left |
| status | ENUM | `pending` \| `success` \| `expired` \| `failed_permanent` |
| error_log | TEXT | Last API error message |

### `key_card_events` (append-only audit log)
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| credential_id | UUID | FK → access_credentials |
| event_type | ENUM | `issued` \| `duplicate_issued` \| `replacement_issued` \| `revoked` \| `encode_failed` \| `api_failed` \| `queued_offline` \| `sync_success` \| `sync_failed` \| `emergency_revoked` |
| performed_by | UUID | FK → users (or "system" for auto-events) |
| performed_at | DATETIME | Timestamp |
| details | TEXT | Free-text detail |
| ip_address | STRING | Device IP for audit |

---

## 6.4 Check-In Step 7 — Activate Room Access

**Trigger:** Appears automatically after Step 6 if Door Lock integration is enabled in ST-04.

### Connectivity Check Banner

**Online (default):** No banner — controls render normally.

**Offline (amber banner):**
```
⚠  No internet — TTLock API unreachable
Room access cannot be activated right now.
[ Queue & Retry Automatically ]  [ Issue Physical Key & Skip ]
```
"Queue & Retry" → writes to `lock_sync_queue`, credential status `pending_sync`, check-in completes.
"Issue Physical Key & Skip" → opens Physical Key Fallback sub-panel, check-in completes.

### Credential Type Selector (when online)

Two side-by-side option cards:
- 💳 Key Card — encode physical card via USB encoder
- 🔢 PIN Code — generate 6-digit time-bounded PIN

Bottom toggle: "Issue Key Card + PIN" — activates both simultaneously.

### Key Card Encoding Panel

```
💳  KEY CARD ENCODING
─────────────────────────────────────────────────
Guest: Sarah Okonkwo    Room: 204
Valid: 12 Jan 14:00  →  15 Jan 12:00

Number of cards:  [ 1 ▾ ]  (max 3 per check-in)
Encoder status:   🟢 Encoder connected (USB)

[ Insert blank card, then: ]   [ Encode Card ]

─ After encoding ─
✅ Card 1 encoded
   Serial: XXXX-XXXX   Issued: 12 Jan 14:03  by John A

[ + Encode Additional Card ]
```

**Encoder status states:** 🟢 Connected | 🔴 Not detected (blocks encode button) | 🟡 Encoding in progress (spinner).

**On "Encode Card":** Local server calls Card Encoder Agent → USB encoder hardware. Simultaneously calls TTLock API to register card + update lock firmware. On success: green confirmation row. On failure: red inline error + retry. Multiple cards each get their own `access_credentials` record; 2nd+ are `is_duplicate: true`.

### PIN Code Panel

```
🔢  PIN CODE GENERATION
─────────────────────────────────────────────────
Guest: Sarah Okonkwo    Room: 204
Valid: 12 Jan 14:00  →  15 Jan 12:00

[ Generate PIN ]

─ After generation ─
✅ PIN generated and activated

Guest PIN:  ┌─────────────┐
            │  7 4 3 8 1 2 │  ← large monospaced, one-time display
            └─────────────┘

⚠  Show to guest now. Cannot be retrieved after this screen.

[ Copy PIN ]   [ Print on Receipt ]   [ Send via WhatsApp ]

⚠  Stored as masked reference only (74**12) — never plaintext.
```

PIN is displayed once only. If lost, staff must generate a new one (cannot retrieve old PIN).

### Physical Key Fallback Sub-Panel

```
🗝  PHYSICAL KEY LOG (offline fallback)
─────────────────────────────────────────────────
Key Reference:  [ Room 204 - Key #2        ]
Notes:          [ Digital access pending   ]

[ Log Physical Key ]
```

Creates `access_credentials` record with `status: pending_sync` and `credential_type: physical_key`. Flagged in FD-12 and FD-13 until digital access later activates.

### Step 7 Completion Summary

```
ACCESS SUMMARY
✅ Key Card (×2) — encoded, active          Room 204
✅ PIN Code — activated, shown to guest      Room 204
Valid: 12 Jan 14:00 → 15 Jan 12:00

[ Print Receipt with PIN ]    [ Complete Check-In ]
```

---

## 6.5 Room Access Management (FD-12)

See Part 4 — Front Desk → FD-12 for layout and filter spec.

**Issue Replacement Card flow:** Reason selector → Encode → If "lost": auto-prompt to revoke original → TTLock revoke API call → new card record with `parent_credential_id`.

**Revoke All:** Destructive-confirm modal → parallel TTLock API calls for all active credentials → events logged → MGT/ORG/FD notifications sent.

---

## 6.6 Key Card Log (FD-13)

See Part 4 — Front Desk → FD-13 for columns and filter spec.

**Row expansion:** Full TTLock API response JSON, credential ID chain, parent credential link.
**Append-only** — no delete capability.

---

## 6.7 PIN Management (FD-14)

See Part 4 — Front Desk → FD-14 for columns and filter spec.

**New PIN mid-stay:** Revoke current → Generate new → One-time display modal → Print/Copy/WhatsApp.
**Auto-expiry:** PINs within 2 hours of `valid_to` show amber "Expiring soon" chip.

---

## 6.8 Emergency Revoke Flow

**Entry points:** FD-12 "Revoke All" button, FD-06 In-House Guest List row action, FD-13 row action menu.

**Emergency Revoke Modal:**
```
🚨  EMERGENCY ROOM ACCESS REVOCATION
─────────────────────────────────────────────────
Room: 204    Guest: Sarah Okonkwo
Active: 2 key cards + 1 PIN

Reason:
○  Security concern / suspected theft
○  Guest dispute
○  Incorrect room assigned
○  Other: [ _________________ ]

⚠  Deactivates ALL access immediately.
   Logged against your account. Cannot be undone.

[ Cancel ]    [ Confirm Emergency Revoke ]
```

**On confirm:** Parallel TTLock API calls for all active credentials (parallel, not sequential — speed matters). Toast to all online staff. Notification to MGT/ORG. Logged in IT-05 Audit Log.

**If offline during emergency revoke:**
```
🔴  CRITICAL: Cannot reach TTLock API — no internet
Digital revocation not possible.
Physical action required:
1. Change physical lock cylinder or override code
2. Contact TTLock support for offline override options
3. Revoke command is queued but may not be fast enough.

[ Understood — Log as Escalated Physical Revoke ]
```

---

## 6.9 Automatic Revocation at Check-Out

**Trigger:** When FD-02 "Release Room" is confirmed.

Local server queries all `access_credentials` for this reservation where `status: active`. For each: calls TTLock API revoke. On success: updates status, logs event (`revoke_reason: checkout`, `revoked_by: system`). On failure (offline): queues to `lock_sync_queue` with `expires_at: checkout_time + 1 hour`.

**Check-out screen confirmation:**
```
ROOM ACCESS REVOKED
✅  Key Card (×2) — deactivated
✅  PIN Code — deactivated
Room 204 → Cleaning status.
```

**If offline:**
```
⚠  Access Revocation Queued
Will deactivate when internet returns.
Note: Credentials are time-limited — they stop working
automatically at check-out time (15 Jan 12:00) regardless.
```

---

## 6.10 Lock Command Queue Monitor (top bar)

When `lock_sync_queue` has pending items, the Lock Queue Indicator appears in the top bar. Clicking opens a popover:

```
🔒 Lock Command Queue
─────────────────────────────────────────────
Activate card — Room 204          Queued: 14:03
Expires: 15 Jan 12:00

Activate PIN — Room 204           Queued: 14:05
Expires: 15 Jan 12:00

Retrying every 2 min...
Last attempt: 14:10 (failed — no internet)

[ Retry Now ]   [ View Full Queue ]
```

**Auto-retry:** Every 2 minutes while offline. On success: queue item marked `success`, credential → `active`, success toast to original issuing staff.

**Expiry:** If `expires_at` passes before sync succeeds: item marked `expired`, credential marked `failed`, urgent alert to MGT/ORG/IT: "Lock activation expired before internet returned — Room 204, Sarah Okonkwo. No digital access was ever activated."

---

## 6.11 Settings: ST-04 — Door Lock Integration

**Sections:**

**Provider selector:** TTLock Cloud API (default). Dropdown for future providers (ZKTeco, Dormakaba, etc.).

**Master enable/disable toggle:** When disabled, Step 7 hides in check-in wizard and all door lock screens disappear from sidebar.

**TTLock API Credentials:** Client ID, Client Secret (masked + show toggle), Username, Password. "Test Connection" button → live API call → returns success (lock count) or error with troubleshooting hints.

**Room → Lock Mapping table:** Room number | TTLock Lock ID | Lock Name. "Auto-map by Name" calls TTLock API, matches lock names to room names, flags unmatched. "Save Mapping."

**Card Encoder config:** Encoder Type dropdown. Port: Auto-detect. Status indicator. "Test Encoder" button.

**Integration Settings:**
- Auto-revoke access on check-out: toggle (default: enabled)
- Queue commands when offline: toggle (default: enabled)
- Queue expiry buffer (hours after check-out): number input (default: 1)
- Notify MGT on offline revoke: toggle (default: enabled)
- Max cards per check-in: number input (default: 3)

---

## 6.12 Door Lock Notification Triggers

| Event | Category | Recipients | Message |
|---|---|---|---|
| Card or PIN activated | System | Issuing staff only | "Room 204 access activated for Sarah Okonkwo" |
| Replacement card issued | Operational | FD, RO, MGT | "Replacement card issued — Room 204 (lost card)" |
| Emergency revoke | Urgent | All FD + RO + MGT + ORG | "⚠ Emergency revoke — Room 204 by [staff name]" |
| Command queued offline | System | Issuing staff + IT | "Lock activation queued — will retry when internet returns" |
| Command sync success | System | Issuing staff | "Room 204 access now active — sync completed" |
| Command expired before sync | Urgent | MGT, ORG, IT | "Lock activation expired — Room 204. No digital access was ever activated for [guest]." |
| TTLock API connection error | System | IT, MGT | "Door lock API unreachable — check internet or TTLock credentials" |

All door lock notifications appear in the Notification Panel under the System or Urgent filter tab.

---

# PART 7 — DESIGN BUILD ORDER

Build in this order to prevent blocking dependencies. Every item is full-scope — nothing is deferred.

1. Design system & component library (Part 1 complete — including PIN Display and Lock Queue Indicator components)
2. Global shell — header (all right-zone controls including Lock Queue Indicator), sidebar (with door lock items), notification panel (Part 2)
3. Dashboard — D-01 (all role variants) and D-02 (Part 4)
4. Reservations module — R-01 through R-08
5. Front Desk — FD-01 (all 7 steps including door lock Step 7) through FD-11
6. Door Lock screens — FD-12, FD-13, FD-14 (Front Desk sub-screens)
7. Housekeeping module — HK-01 through HK-08
8. Maintenance module — MX-01 through MX-07
9. Finance & Billing — FI-01 through FI-05
10. Restaurant / POS — RT-01 through RT-07
11. Communications — CO-01 through CO-04
12. Inventory — IV-01 through IV-05
13. HR & Staff — HR-01 through HR-06
14. Reports — RP-01 through RP-06
15. IT Admin — IT-01 through IT-05
16. Multi-Branch Management — MB-01 through MB-03
17. Settings — ST-01 (including Enabled Modules), ST-02, ST-03, ST-04 (Door Lock Integration)
18. All end-to-end prototype flows linked (Part 5, Flows 1–10)

---

*End of document. This is the single authoritative reference for the complete platform.*
*Version 1.0 — covers architecture, hierarchy, monetization, full UI/UX specification, door lock integration, and build order.*
