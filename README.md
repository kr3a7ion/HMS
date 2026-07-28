# Nexura

**Offline-first hospitality management platform.** Each property runs a local server on its own LAN. On-site devices talk only to that server, so the hotel keeps operating at full capability with zero internet connection. When a link is available, the local server syncs opportunistically to a shared central server for multi-branch reporting.

---

## Why offline-first

Most hotel management systems assume a reliable internet connection. In a lot of the world that assumption is wrong, and when the link drops the front desk stops being able to check guests in.

Nexura inverts the dependency. The local server is the source of truth for its property — auth, reservations, folios, housekeeping and POS all resolve on the LAN. The central server is an aggregator, not a gatekeeper. A property that has never once reached the internet is still fully operational.

That constraint shaped most of the interesting decisions in the codebase.

---

## Screenshots

<!-- Add 3-5 images to docs/ and reference them here. Dashboard, reservation grid,
     housekeeping board and sync status are the ones worth showing. -->

| Dashboard                        | Reservations                           |
| -------------------------------- | -------------------------------------- |
| ![Dashboard](docs/dashboard.png) | ![Reservations](docs/reservations.png) |

---

## Architecture

```
apps/
├── web/              React + Vite front end (~90 screens, role-aware)
├── local-server/     Per-property server — owns auth and all operational data
└── central-server/   Multi-tenant org/branch records, Org Portal, Admin Console
```

Three independently built and deployed packages in a pnpm workspace, each with its own lockfile and CI job.

**Data flow:** devices → local server (LAN, always available) → central server (opportunistic, when online).

Sync is a KPI-snapshot protocol rather than full per-record replication with conflict resolution. That was a deliberate cut: the multi-branch screens need aggregate comparison, not row-level merge, and building a replication engine nobody would use is how projects die. `ROADMAP.md` documents the reasoning.

---

## Stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Front end  | React, TypeScript, Vite, Tailwind, shadcn/ui, Radix    |
| Servers    | Node, Express, TypeScript                              |
| Data       | SQLite (better-sqlite3) with Drizzle ORM               |
| Auth       | JWT, bcrypt, TOTP MFA, RBAC permission keys            |
| Validation | Zod                                                    |
| API docs   | Generated OpenAPI spec, linted with Redocly            |
| Testing    | Node's built-in test runner via tsx                    |
| CI         | GitHub Actions — typecheck, build and test per package |
| Deployment | Docker images for both servers                         |

SQLite is a deliberate choice, not a shortcut. A per-property server needs a database that runs with no external process, no DBA and no network — on whatever machine the hotel has in the back office.

---

## Modules

Front Desk · Reservations · Housekeeping · Maintenance · Finance & Billing · Restaurant/POS · Inventory · HR & Staff · Communications · Reports · Multi-branch · IT Admin · Settings

Eight roles — management, front desk, housekeeping, maintenance, finance, restaurant, reservations, IT — each with a scoped permission set and its own dashboard.

---

## Engineering notes

A few problems that took real thought:

**Door lock commands with no network.** Physical lock integration (TTLock) sits behind a provider interface with a queue in front of it. A key issued while the uplink is down is persisted and replayed on reconnect, rather than silently failing at the desk.

**Restoring a database the server is currently using.** SQLite can't safely swap its own open file mid-request. `POST /admin/backups/:id/restore` stages a marker file instead; applying it is the first thing the next boot does, before the live connection is opened.

**Permissions as data, not conditionals.** Roles resolve to permission keys checked in middleware, so adding a role is a seed change rather than a scatter of `if (role === ...)` across twenty route modules.

**Admin surface hardening.** Platform admin login carries TOTP MFA, IP-range restriction and per-account login rate limiting. A central server holding several organisations' data is a different threat model from a single property's front desk.

**Tested where it matters.** `offline-continue`, `rbac-permissions`, `reservations-lifecycle`, `doorlock`, `auth-login`, `admin-mfa` — integration-level, against a real seeded database.

---

## Status

Phases 0–2 complete: every pre-central-server module runs on real persisted data against the local server. Phase 3 complete in a deliberately scoped form — a separate central server with its own database and signing key, real KPI-snapshot sync, and separately authenticated Org Portal and Platform Admin Console.

`ROADMAP.md` tracks what is real, what is deferred and why. Deferred items are listed as deferred rather than quietly dropped.

---

## Running locally

```bash
# Front end
cd apps/web && npm i && npm run dev

# Local server (required for real data)
cd apps/local-server && npm i && npm run seed && npm run dev

# Central server (optional — the platform is fully usable without it)
cd apps/central-server && npm i && npm run seed && npm run dev
```

Demo credentials are in `apps/local-server/README.md`.

---

## Reference documents

- `ROADMAP.md` — phased build plan and current status
- `apps/web/src/imports/Nexura_Complete_Master_Blueprint.md` — architecture, hierarchy, full UI/UX specification
- `apps/web/src/imports/Nexura_Auth_and_Distribution_Architecture.md` — auth flow, session and token strategy, client distribution
- `guidelines/Guidelines.md` — engineering and design conventions

---

## About

Built by **Gideon** ([@kr3a7ion](https://github.com/kr3a7ion)) — Flutter and full-stack developer, Abuja, Nigeria.

Open to remote roles and relocation with visa sponsorship. [codewithgideon.com](https://codewithgideon.com)
