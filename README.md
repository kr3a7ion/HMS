# Nexura

Offline-first hospitality management platform. Each property runs a local
server on its own hotel LAN; devices on-site talk only to that local server,
which syncs opportunistically to a shared central server whenever internet
is available. The product is fully operational with zero internet
connection.

Phases 0-2 are complete: every module the Blueprint schedules before the
central server (Front Desk, Housekeeping, Maintenance, Finance, Restaurant/
POS, Communications, Inventory, HR & Staff, Reports, IT Admin, Settings,
Dashboard) runs on real, persisted data against the **local server** under
`server/`. Phase 3 adds the **central server** under `central-server/` —
multi-tenant organization/branch records, the Org Portal, the Platform
Admin Console, and a KPI-snapshot sync protocol between the two servers.
See `ROADMAP.md` for exactly what's real, what's deliberately deferred and
why, and the build order.

## Reference documents

- `src/imports/Nexura_Complete_Master_Blueprint.md` — architecture,
  organizational hierarchy, monetization, and the full UI/UX specification.
  Authoritative source for screen behavior and roles.
- `src/imports/Nexura_Auth_and_Distribution_Architecture.md` — authentication
  flow, session/token strategy, and client distribution model.
- `guidelines/Guidelines.md` — engineering and design conventions for this
  codebase specifically.
- `ROADMAP.md` — phased build plan and current status.

## Running the prototype (frontend)

```
npm i
npm run dev
```

## Running the local server (backend, Phase 1+)

```
cd server
npm install
npm run seed
npm run dev
```

See `server/README.md` for demo credentials and how to exercise the auth
endpoints directly.

## Running the central server (backend, Phase 3+)

Optional — the local server and frontend are fully usable without it, per
the Blueprint's "operational before first sync" requirement.

```
cd central-server
npm install
npm run seed
npm run dev
```

The seed prints a branch ID and sync key. To connect a running local
server to it, set these when starting `server/` (`npm run dev`):

```
CENTRAL_SERVER_URL=http://localhost:5000
CENTRAL_BRANCH_ID=<printed by central-server's seed>
CENTRAL_SYNC_KEY=<printed by central-server's seed>
```

Then trigger a sync from Settings > Synchronization (or `IT`/`ORG` role)
in the app, or `POST http://localhost:4000/sync/now`. The Org Portal
(`superadmin@grandpalms.ng` / `demo123`) and Platform Admin Console
(`platform-owner@nexura.app` / `demo123`) are reachable from the login
screen's "Open Org Portal" / "Open Admin Console" links — each is its own
real login against `central-server/`, separate from the local session.

## Stack

Frontend: Vite + React + TypeScript, Tailwind v4, shadcn/ui (Radix
primitives). Local server and central server: Node.js + Express + SQLite
(`better-sqlite3` + Drizzle ORM), each its own independent deployable
service with its own database and signing key.
