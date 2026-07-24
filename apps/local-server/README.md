# Nexura local server

The per-branch local server: owns auth and data for one branch, runs on the
hotel LAN, works fully offline once a session exists. See
`../src/imports/Nexura_Auth_and_Distribution_Architecture.md` for the full
spec this implements against.

**Current scope (Phase 1):** auth (login, offline-continue, session
revocation) plus just enough schema to eventually support the Front Desk
vertical slice (reservations, guests, rooms, folio charges, payments). See
`../ROADMAP.md` for what's next.

Stack: Node.js + TypeScript, Express, SQLite via `better-sqlite3` +
Drizzle, RS256 JWTs signed with a locally-generated key pair.

## Setup

```
cd server
npm install
npm run seed    # creates data/nexura.db, seeds demo org/branch/users/rooms
npm run dev      # starts the server on http://localhost:4000
npm test          # runs the offline-continue integration test (isolated DB)
```

Demo accounts (password `demo123` for all): `owner@grandpalms.ng` (ORG),
`manager@grandpalms.ng` (MGT), `frontdesk@grandpalms.ng` (FD),
`housekeeper@grandpalms.ng` (HK), `maintenance@grandpalms.ng` (MX),
`finance@grandpalms.ng` (FIN), `restaurant@grandpalms.ng` (RT).

## Try it

```
curl -i -c cookies.txt -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"frontdesk@grandpalms.ng","password":"demo123"}'

curl -i -b cookies.txt http://localhost:4000/auth/me
```

To see the offline-continue path: delete/rename `data/keys/` and restart
would generate a *new* key pair (breaking existing tokens on purpose — don't
do that mid-test). Instead, to actually test offline-continue, just wait for
the access token to expire (12h default — not practical to wait for by
hand), or temporarily lower `ACCESS_TOKEN_TTL_SECONDS` in
`src/auth/tokens.ts` to something like `30` while testing locally, then:

```
# after the access token has expired but within the 8h grace window
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:4000/auth/continue-offline
```

A real automated test for this (kill network mid-session, assert the
continue-offline flow works) is still open — see ROADMAP.md Phase 1.

## What's deliberately not done yet

- No refresh-token rotation endpoint (`active_sessions.refresh_token_hash`
  is stored but nothing reads it yet) — full "Remember this device" (Auth
  doc 5.4) is more than this phase needs.
- Local signing key is plaintext PEM on disk (0600 permissions), not
  encrypted with a hardware-ID-derived key as Auth doc 9.2 specifies —
  real hardening for Phase 4's distribution work.
- No `/reservations`, `/guests`, `/rooms` endpoints yet — schema exists,
  routes don't. Next up.
- No Drizzle migrations — `src/db/init.sql` bootstraps the schema with
  `CREATE TABLE IF NOT EXISTS` on every boot. Fine while the schema is
  still moving; switch to versioned migrations once it stabilizes.
