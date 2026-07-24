# Nexura
## Authentication Flow & Client Distribution Architecture

**Document type:** Standalone technical reference for authentication design, session management, token strategy, and client deployment/distribution model.
**Companion to:** Nexura Complete Master Blueprint v1.0
**Applies to:** All roles, all deployment layers — Platform Owner, Organization Super Admin, Branch Staff.
**Critical context:** This product is offline-first. Every auth decision must hold up under zero internet conditions. This document explains how it does.

---

# TABLE OF CONTENTS

- **PART 1** — The Core Insight: Why This Auth Is Different
- **PART 2** — Infrastructure Auth Layers
- **PART 3** — Auth Flow: Platform Owner
- **PART 4** — Auth Flow: Organization Super Admin
- **PART 5** — Auth Flow: Branch Staff (majority of users)
- **PART 6** — Session Management & Token Strategy
- **PART 7** — Edge Cases & Failure Scenarios
- **PART 8** — Password Management & Account Recovery
- **PART 9** — Security Architecture
- **PART 10** — Client Distribution Model
- **PART 11** — How Updates Reach Clients
- **PART 12** — Off-Site Access
- **PART 13** — Provisioning a New Client End-to-End
- **PART 14** — Auth & Distribution Decision Reference

---

# PART 1 — THE CORE INSIGHT: WHY THIS AUTH IS DIFFERENT

## 1.1 The Problem With Standard SaaS Auth

In a typical SaaS web application, the sequence is:

```
Browser → Internet → Cloud Server (serves app + validates auth)
```

Every page load, every token validation, every session check hits the cloud. Pull the internet cable and every user is immediately locked out — not because the data is gone, but because auth itself depends on the network.

This is unacceptable for a hotel running front desk operations in a region with unreliable connectivity.

## 1.2 How This Product Solves It

The web application is not served from the internet. It is served from a local server physically sitting on the hotel's own LAN.

```
Browser → Hotel LAN → Local Server (serves app + validates auth)
```

When a receptionist opens Chrome on the front desk PC, they do not go to `https://yourdomain.com`. They go to a local address — `http://nexura.local` or `http://192.168.1.10` — and the local server responds with the complete React application, validates their credentials, issues their session token, and processes every subsequent request. Internet is not involved in any part of this.

This means:
- Auth is offline by default, not as a fallback.
- Internet going down changes nothing for staff already working.
- A week-long outage at the ISP level does not interrupt a single check-in.

The internet is used only for: syncing data to the central server, TTLock door lock commands, and WhatsApp/SMS notifications — all non-critical paths that degrade gracefully.

## 1.3 The Two-Key System

Because the local server issues its own tokens independently of the central server, there are effectively two signing authorities in this system:

**Local Signing Key** — held by each branch's local server. Used to sign and validate JWT tokens for all branch sessions. Never leaves the property. Never sent to the central server. Generated at provisioning time.

**Central Signing Key** — held by the central cloud server. Used to sign tokens for the Platform Admin Console and the Organization Super Admin's cross-branch portal. Never used to validate branch session tokens.

These two authorities are intentionally separate. A compromise of the central server's signing key cannot be used to forge branch session tokens. A compromise of one branch's local key cannot be used to access any other branch or the central system.

---

# PART 2 — INFRASTRUCTURE AUTH LAYERS

The platform has three distinct authentication layers, each with its own server, its own token authority, and its own user population.

```
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 1: Platform Admin Console                                 │
│  URL: admin.nexura.app (public internet)                   │
│  Server: Central Cloud Server                                    │
│  Users: Platform Owner (Gideon) only                             │
│  Token authority: Central server signs & validates               │
│  Internet required: Yes — always cloud-accessed                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ sync + provisioning
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 2: Organization Portal                                    │
│  URL: portal.nexura.app (public internet)                  │
│  Server: Central Cloud Server (aggregated data)                  │
│  Users: Organization Super Admin (cross-branch view)             │
│  Token authority: Central server signs & validates               │
│  Internet required: Yes for cross-branch data; offline           │
│  degrades to last-synced snapshot                                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ sync (opportunistic)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  LAYER 3: Branch App (one per branch)                            │
│  URL: http://nexura.local (hotel LAN only)                         │
│  Server: Local Server (on hotel premises)                        │
│  Users: All branch staff + Super Admin when on-site             │
│  Token authority: Local server signs & validates                 │
│  Internet required: No — fully offline capable                   │
└──────────────────────────────────────────────────────────────────┘
```

No layer shares tokens with another. A token issued by the local server is useless on the central server and vice versa. This is by design.

---

# PART 3 — AUTH FLOW: PLATFORM OWNER

## 3.1 Who This Is

Gideon — the sole operator of the platform. One account. This account does not exist inside any client's hotel-facing application.

## 3.2 Access Method

Browser → `https://admin.nexura.app` → served by the central cloud server.

## 3.3 Login Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Navigate to admin.nexura.app                          │
│  2. Login form loads (served by central server over HTTPS)      │
│  3. Enter email + password                                       │
│  4. Central server validates credentials against admin_users    │
│     table (separate table from any client's user data)          │
│  5. Central server issues: Access Token (JWT, 1hr expiry)       │
│                          + Refresh Token (30 days)               │
│  6. Tokens stored as httpOnly, Secure, SameSite=Strict cookies  │
│  7. Admin console loads with full cross-organization access      │
└─────────────────────────────────────────────────────────────────┘
```

## 3.4 What the Platform Owner Can Do

- Create and manage Organization records
- Create Organization Super Admin accounts
- Provision branch records and issue sync keys
- Control which modules each organization's subscription unlocks
- View billing and payment status across all clients
- Monitor branch sync health (last sync time, pending items)
- Suspend or reactivate client organizations
- Access audit logs across any organization (support/compliance use)
- Push updates to local servers

## 3.5 Security Posture

Platform Owner account enforces:
- Multi-factor authentication (TOTP) — mandatory, no bypass
- Login attempt rate limiting (5 attempts, then 15-minute lockout)
- Session tied to IP range (configurable — Gideon's known IP ranges)
- All actions logged to a platform-level audit trail with timestamp, IP, action, affected entity

---

# PART 4 — AUTH FLOW: ORGANIZATION SUPER ADMIN

The Organization Super Admin has the most complex auth situation because they operate in two contexts: on-site at a branch (local auth) and remotely checking cross-branch performance (central auth). These are treated as two separate sessions.

## 4.1 On-Site Auth (local server)

When the Super Admin is physically at a branch:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Open browser on branch LAN device                           │
│  2. Navigate to http://nexura.local                                │
│  3. Login screen loads from local server                        │
│  4. Enter email + password                                       │
│  5. Local server checks users table (local DB)                  │
│     → Account exists with role: org_super_admin                 │
│     → Password hash matches (bcrypt)                            │
│  6. Local server issues Local JWT:                              │
│     - Signed with local server's signing key                    │
│     - Payload: user_id, role, org_id, branch_id, expires_at    │
│     - Expiry: 12 hours (configurable)                           │
│  7. JWT stored as httpOnly cookie on device                     │
│  8. App loads with full branch access + org-level screens       │
│     scoped to this branch's data                                │
└─────────────────────────────────────────────────────────────────┘
```

The Super Admin sees all screens available to their role when on the branch LAN. Cross-branch data (MB-01, MB-02, MB-03) is populated from the local server's last-synced central data snapshot. If the branch recently synced, this is near real-time. If offline, it reflects the last sync with a "last updated" timestamp shown.

## 4.2 Remote / Cross-Branch Access (central server)

When the Super Admin is off-site and wants to see aggregated performance across all branches:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Open browser on any internet-connected device               │
│  2. Navigate to portal.nexura.app                         │
│  3. Login screen loads from central server                      │
│  4. Enter email + password                                       │
│  5. Central server validates against its own org_users table    │
│  6. Central server issues Central JWT (separate from local JWT) │
│     - Signed with central server's signing key                  │
│     - Payload: user_id, role, org_id, all_branch_ids, expires  │
│     - Expiry: 8 hours                                           │
│  7. Portal loads — cross-branch dashboard, comparison, reports  │
│  8. Data shown is aggregated from last sync of all branches     │
│     (not live branch data — clearly labeled with sync times)    │
└─────────────────────────────────────────────────────────────────┘
```

This portal is read-heavy — dashboards, reports, comparisons. Write actions (creating accounts, editing settings) redirect to the appropriate branch's local app. The portal is not a remote control for branch operations; it is an observation layer.

## 4.3 Account Synchronization

The Super Admin's account exists in two places: the central database (authoritative) and each branch's local database (synchronized copy). Password changes made on either side sync to the other on next connection. The central copy is the source of truth — if there is ever a conflict, the central version wins for this account type.

---

# PART 5 — AUTH FLOW: BRANCH STAFF

This covers all branch-level roles: Front Desk, Reservations, Housekeeping, Maintenance, Restaurant, Resident Officer, Customer Service, Finance, IT Department, and Branch Manager.

## 5.1 Standard Online Login

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Staff opens browser on any LAN-connected device             │
│  2. Navigates to http://nexura.local                               │
│  3. Login screen served by local server                         │
│                                                                  │
│     ┌──────────────────────────────────────────────┐            │
│     │  🏨  Grand Meridian · Nexura                       │            │
│     │                                               │            │
│     │  Email:     [ __________________________ ]   │            │
│     │  Password:  [ __________________________ ]   │            │
│     │  ☐ Remember this device                      │            │
│     │                                               │            │
│     │  [ Log In ]                                   │            │
│     │                                               │            │
│     │  Forgot Password?   |   Continue Offline      │            │
│     │  Change Server (IT only)                      │            │
│     └──────────────────────────────────────────────┘            │
│                                                                  │
│  4. Credentials submitted to local server (POST /auth/login)    │
│  5. Local server:                                               │
│     a. Looks up user by email in local users table              │
│     b. Verifies bcrypt hash of password                         │
│     c. Checks account status (active / suspended / deactivated) │
│     d. Checks role permissions are configured                   │
│  6. On success: local server issues JWT                         │
│     - Signed with this branch's unique signing key              │
│     - Payload includes:                                          │
│       · user_id                                                  │
│       · role (e.g. "front_desk")                                │
│       · org_id                                                   │
│       · branch_id                                               │
│       · department                                               │
│       · permissions_hash (snapshot of role permissions)         │
│       · issued_at                                               │
│       · expires_at                                               │
│       · session_id (unique per session, stored in DB for        │
│         revocation tracking)                                    │
│  7. JWT set as httpOnly, Secure (if HTTPS configured on LAN),  │
│     SameSite=Strict cookie                                      │
│  8. App loads with navigation and features scoped to role       │
└─────────────────────────────────────────────────────────────────┘
```

## 5.2 Continue Offline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Triggered when: internet is down AND a valid JWT cookie        │
│  already exists on this device for this user                    │
│                                                                  │
│  1. Login screen detects: internet unreachable                  │
│  2. Login screen checks: valid unexpired JWT cookie present?    │
│  3. If yes: "Continue Offline" button becomes prominent         │
│  4. Staff taps "Continue Offline"                               │
│  5. Browser sends existing JWT cookie to local server           │
│     (POST /auth/continue-offline)                               │
│  6. Local server checks:                                        │
│     a. JWT signature valid (signed by my key)? ✓               │
│     b. JWT not expired? ✓ (or within grace period)              │
│     c. session_id not in revoked_sessions table? ✓             │
│  7. Local server returns session confirmation — no internet     │
│     call made at any point                                      │
│  8. App loads with offline mode banner active:                  │
│     "Working offline — changes will sync when connected"        │
│                                                                  │
│  What works offline:                                            │
│  ✅ All core Nexura operations (reservations, check-in, billing,   │
│     housekeeping, maintenance, folio management, reports from   │
│     local data)                                                 │
│                                                                  │
│  What is degraded offline:                                      │
│  ⚠  TTLock door lock commands (queued, retry on reconnect)     │
│  ⚠  WhatsApp / SMS notifications (queued)                      │
│  ⚠  Cross-branch data (shows last synced snapshot)             │
│  ⚠  Central backup (local backup still runs)                   │
│                                                                  │
│  What is blocked offline:                                       │
│  ❌ Password resets via email (no email connectivity)           │
│  ❌ New account creation by Platform Owner (central only)       │
└─────────────────────────────────────────────────────────────────┘
```

## 5.3 Failed Login Handling

```
Attempt 1–3 failed:   Inline error: "Incorrect email or password."
Attempt 4:            Warning: "1 attempt remaining before lockout."
Attempt 5:            Account locked for 15 minutes.
                      Error: "Too many failed attempts. Try again at
                      [time] or contact your manager."

After lockout expires: Attempt counter resets, login available again.
Branch Manager / IT can manually unlock an account immediately
via HR → Staff Profile → Unlock Account.
Platform Owner can unlock from the Admin Console.
```

All failed login attempts are written to the local `audit_log` table with timestamp, IP address, and username attempted.

## 5.4 Remember This Device

When "Remember this device" is checked at login:

- A long-lived Refresh Token (30 days) is stored in an httpOnly cookie alongside the short-lived Access Token.
- On subsequent visits, if the Access Token is expired but the Refresh Token is valid, the local server silently issues a new Access Token without requiring the user to log in again.
- The Refresh Token is device-specific — stored in the `device_sessions` table with device fingerprint, MAC address (captured via the local network), and last active timestamp.
- If a device is deauthorized in IT Admin → Device Management, its Refresh Token is immediately invalidated. Next access attempt returns a 401 and the user must log in fresh.
- "Remember this device" is never available on shared or public devices — recommend this only for assigned, dedicated workstations.

---

# PART 6 — SESSION MANAGEMENT & TOKEN STRATEGY

## 6.1 Token Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  ACCESS TOKEN (JWT)                                              │
│  ─────────────────                                               │
│  Issuer:     Local Server (branch-specific)                      │
│  Algorithm:  RS256 (asymmetric — local server holds private key; │
│              public key available for verification)              │
│  Expiry:     12 hours (default, configurable per property)       │
│  Storage:    httpOnly cookie — never accessible to JavaScript    │
│  Contents:                                                        │
│    {                                                             │
│      "iss": "nexura-local-branch-{branch_id}",                     │
│      "sub": "{user_id}",                                         │
│      "role": "front_desk",                                       │
│      "org_id": "{org_id}",                                      │
│      "branch_id": "{branch_id}",                                 │
│      "department": "Front Desk",                                 │
│      "permissions_hash": "{sha256 of role permission set}",     │
│      "session_id": "{uuid — used for server-side revocation}",  │
│      "iat": 1736694000,                                          │
│      "exp": 1736737200                                           │
│    }                                                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  REFRESH TOKEN                                                   │
│  ─────────────                                                   │
│  Issuer:     Local Server                                        │
│  Type:       Opaque random token (not JWT — no decodable data)   │
│  Expiry:     30 days                                             │
│  Storage:    httpOnly cookie + server-side in device_sessions    │
│  Rotation:   New refresh token issued on every use               │
│              (old one immediately invalidated)                    │
└──────────────────────────────────────────────────────────────────┘
```

## 6.2 Token Validation Flow (every request)

```
Browser sends request with JWT cookie
           │
           ▼
Local server middleware intercepts
           │
           ▼
┌─────────────────────────────────┐
│ 1. Decode JWT (no network call) │
│ 2. Verify RS256 signature       │
│    using local public key       │
│ 3. Check exp > now              │
│ 4. Check session_id not in      │
│    revoked_sessions table       │
│ 5. Check permissions_hash       │
│    matches current role config  │
└──────────┬──────────────────────┘
           │
     ┌─────┴─────┐
     │           │
   Valid       Invalid
     │           │
     ▼           ▼
 Continue    Return 401
 request     → Browser
             redirects to
             login screen
```

**No network call.** No database join on every request (except the lightweight session revocation check, which is a keyed lookup on an indexed table, completing in microseconds). The local server can validate thousands of concurrent requests per second without degradation.

## 6.3 Permissions Hash

The `permissions_hash` field in the JWT is a SHA-256 hash of the role's current permission configuration. On every validated request, the server recomputes the hash from the live role config and compares it to the token's stored hash.

If they differ (because a manager changed the role's permissions after this user logged in), the server immediately:
1. Invalidates the current session
2. Returns 401 with a specific reason code: `PERMISSIONS_CHANGED`
3. The app shows: "Your account permissions were updated. Please log in again."

This ensures permission changes take effect in real time without waiting for token expiry.

## 6.4 Shift-Based Session Awareness

The JWT payload includes no hard shift lock — staff can log in across shift boundaries. However, the Shift Indicator in the top header bar is powered by the local server's current shift configuration, not the token itself. If a staff member's assigned shift ends, they are gently prompted to hand over (CO-04 Shift Handover flow) but are not forcibly logged out. Only an explicit "Sign Out" or an IT-forced session revocation terminates the session before token expiry.

## 6.5 Session Table (local DB)

```sql
CREATE TABLE active_sessions (
  session_id        UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  device_id         UUID REFERENCES registered_devices(id),
  issued_at         TIMESTAMP NOT NULL,
  expires_at        TIMESTAMP NOT NULL,
  last_active_at    TIMESTAMP,
  ip_address        INET,
  user_agent        TEXT,
  is_offline_mode   BOOLEAN DEFAULT FALSE,
  revoked_at        TIMESTAMP,        -- NULL if active
  revoke_reason     TEXT              -- NULL if active
);
```

IT Admin can view all active sessions in IT Admin → Device Management and can force-terminate any session remotely (sets `revoked_at`, adds `session_id` to a `revoked_sessions` lookup table checked on every request).

---

# PART 7 — EDGE CASES & FAILURE SCENARIOS

## 7.1 JWT Expired, Internet Down

Scenario: A staff member's 12-hour token expires at 3am during an internet outage. Their shift started at 11pm and runs until 7am.

**Solution — Offline Grace Period:**

The local server has a configurable grace period (default: 8 hours, set in Settings → Synchronization). If:
- Internet is unreachable, AND
- The JWT is expired but was valid within the grace period window

...the local server issues a short-lived emergency extension token (4 hours) without requiring re-authentication. This is logged as an `offline_extension` event in the audit log.

When internet returns, the extension is acknowledged and the session normalized on next regular auth cycle.

## 7.2 Local Server Reboots Mid-Shift

Scenario: A power cut reboots the local server. All in-memory sessions are cleared.

**Solution:** Sessions are persisted in the `active_sessions` table in the local database — they survive a reboot. The local server's private signing key is stored encrypted on disk, unlocked at boot with a key derived from the machine's hardware ID (set during provisioning). On reboot, the server is fully operational within 30–60 seconds. Staff devices still holding their JWT cookies reconnect transparently — they don't notice the reboot beyond a brief "reconnecting" state.

## 7.3 Two Staff Members, Same Account

Scenario: Two receptionists share one login (common in poorly-run properties).

**Policy response, not a technical one:** The platform supports this technically (two concurrent sessions from the same account are allowed) but audit logs will show all actions attributed to the shared account, making accountability impossible. The recommended approach is separate accounts per person — accounts are free and unlimited. The onboarding process should include explicit guidance on this point.

## 7.4 Staff Account Deactivated While Logged In

Scenario: A Branch Manager deactivates a staff member's account while they are mid-session.

**What happens:** The deactivation marks the account as `status: deactivated` in the `users` table and adds all their `session_id` values to the `revoked_sessions` lookup table. The next request the deactivated user makes — within seconds — hits the session revocation check and returns 401. Their session ends immediately. They cannot log back in. The process takes effect in real time, no waiting for token expiry.

## 7.5 Role Permissions Changed While Staff Is Logged In

Covered in 6.3 — permissions_hash mismatch triggers immediate session invalidation and re-login prompt.

## 7.6 Local Server Signing Key Compromised

In the unlikely event a branch's local signing key is compromised:

1. IT Admin escalates to Platform Owner.
2. Platform Owner pushes an emergency key rotation via the central server to that branch's local server.
3. The local server generates a new signing key pair.
4. All existing sessions are immediately invalidated (bulk insert into `revoked_sessions`).
5. All staff must log in again with their credentials — they are not locked out, just re-authenticated.
6. The old key is destroyed.

This process takes approximately 2–5 minutes and is entirely remote — no physical access to the branch server required.

## 7.7 Forgotten Password, Internet Down

Scenario: A receptionist has forgotten their password during an internet outage. They cannot receive a password reset email.

**Resolution path:** Branch Manager or IT role can issue a temporary password directly from within the app (HR → Staff Profile → Reset Password). This sets a new bcrypt hash in the local `users` table immediately, no internet required. The affected user logs in with the temporary password and is immediately prompted to change it. On next sync, the new hash propagates to the central server.

---

# PART 8 — PASSWORD MANAGEMENT & ACCOUNT RECOVERY

## 8.1 Password Requirements (enforced at local server)

- Minimum 8 characters
- At least one uppercase, one lowercase, one number
- Common password blacklist check (local dictionary)
- Cannot reuse the last 5 passwords (previous hashes stored in `password_history` table)
- bcrypt hash with cost factor 12

## 8.2 Standard Password Reset (online)

```
1. Staff clicks "Forgot Password" on login screen
2. Enters email address
3. Local server checks if email exists in local users table
4. If branch has internet: local server calls central server to
   trigger password reset email (central server sends the email)
5. Email contains a time-limited reset link (1 hour expiry)
   pointing to: http://nexura.local/reset-password?token={token}
6. Staff opens link on LAN device → local server validates token
7. Staff enters new password → local server updates hash
8. New hash syncs to central server on next connection
```

## 8.3 Offline Password Reset

Covered in 7.7 — Branch Manager or IT issues a temporary password directly in-app. No email required.

## 8.4 Account Recovery (locked out Super Admin)

If an Organization Super Admin locks themselves out and cannot access any branch on the LAN:

1. Super Admin contacts Platform Owner (Gideon).
2. Platform Owner accesses the central admin console.
3. Platform Owner generates a one-time recovery token tied to that org.
4. Recovery token sent to the Super Admin's registered recovery email.
5. Super Admin uses the portal (`portal.nexura.app`) to reset their central password.
6. On next sync, the updated credentials propagate to each branch's local server.
7. Super Admin can then log into the local branch app with the new credentials.

---

# PART 9 — SECURITY ARCHITECTURE

## 9.1 Transport Security

**On the LAN:** HTTP is acceptable for local-only traffic (no internet exposure). For properties that want HTTPS on the LAN, the local server supports a self-signed certificate or a LAN-scoped certificate generated during provisioning. The browser will show a "Not Secure" warning for self-signed — this is mitigated by adding the cert to the property's device trust store during setup.

**To the central server:** Always HTTPS with TLS 1.3 minimum. Certificate pinned in the local server's sync client.

**Admin Console and Portal:** Always HTTPS, HSTS enforced, no HTTP fallback.

## 9.2 Data Encryption

```
At rest (local server database):
  → SQLite / PostgreSQL encrypted at the database level
  → Encryption key derived from machine hardware ID + provisioning secret
  → Key is never stored on disk in plaintext

At rest (backups):
  → Local backups encrypted with AES-256 before writing to disk
  → Cloud backups encrypted client-side before upload to central server
  → Central server receives and stores pre-encrypted blobs only
  → Platform Owner cannot read backup contents (zero-knowledge backup)

In transit:
  → Local LAN: HTTP (or HTTPS if configured)
  → Local → Central sync: TLS 1.3, certificate pinned
  → Browser cookies: httpOnly, Secure (if HTTPS), SameSite=Strict
```

## 9.3 Role Enforcement (defense in depth)

Role-based access is enforced at three independent layers:

```
Layer 1 — Navigation (UI):
  Sidebar items not visible to unauthorized roles are simply
  not rendered. React router guards redirect any direct URL
  access to unauthorized screens to the dashboard.

Layer 2 — API (local server):
  Every API endpoint checks the JWT's role claim and
  permissions_hash before processing. A request from a
  Housekeeping role to POST /api/invoices returns 403
  regardless of what the browser sends.

Layer 3 — Database (local server):
  Row-level filters applied to every query. A Front Desk
  user querying the users table only ever receives their
  own record back — the query is automatically scoped.
  Financial data queries return only what the role's
  permission scope allows.

All three layers must be bypassed simultaneously to access
unauthorized data. A bug in the UI does not expose data.
A forged JWT role claim is caught at the API layer.
```

## 9.4 Audit Trail

Every mutating action in the system (create, update, delete, status change, login, logout, failed login, permission change, session revocation) is written to the local `audit_log` table. This table is:

- **Append-only** — no UPDATE or DELETE operations permitted at the application level. The database user the application runs under does not have DELETE permissions on this table.
- **Synced to central** — audit logs from all branches are synced to the central server, giving the Platform Owner a complete cross-branch audit history.
- **Immutable on central** — the central copy cannot be modified by any client account.
- **Viewable in IT-05** (Audit Log screen) by IT and ORG roles.

## 9.5 Session Revocation Performance

The revoked_sessions lookup table is a simple indexed table of session IDs marked as revoked. It is checked on every API request. To keep this fast:

- Indexed on `session_id` (UUID) — O(1) lookup.
- Expired sessions purged nightly (sessions past `expires_at + 24hrs`) to keep the table small.
- The table typically holds fewer than 100 rows in a normal hotel environment.
- Lookup adds < 1ms to request processing time.

---

# PART 10 — CLIENT DISTRIBUTION MODEL

## 10.1 What Gets Distributed

There are two distinct artifacts in this distribution model:

**The Local Server Package** — a complete, self-contained deployment bundle containing:
- Backend API server (Node.js / similar runtime)
- Local database engine (SQLite embedded, or lightweight Postgres)
- The complete compiled React web application build
- Sync engine (handles local ↔ central data synchronization)
- Card Encoder Agent (background service for USB key card encoding)
- Lock Queue Service (manages TTLock offline command queue)
- Auto-updater service (checks for and applies updates)
- Configuration and provisioning tooling

**The Admin Console** — a standard cloud web app served by the central server. No distribution required — it's always available at its public URL.

## 10.2 How Devices Access the App

There is no app store submission, no user-facing installer, no download for end users. Any device on the hotel LAN opens a browser and navigates to the local server's address. The local server serves the React application. That is the entire "distribution" from the end user's perspective.

```
Device (browser) → http://nexura.local → Local Server → App loads
```

**Setting up a new device on the LAN:**

1. Connect device to hotel WiFi or wired LAN.
2. Open browser.
3. Navigate to `http://nexura.local` (or the LAN IP, e.g. `http://192.168.1.10`).
4. Login screen appears immediately.
5. Device is ready.

No software installation required on the device. Works on any browser (Chrome, Edge, Firefox, Safari). Works on Windows PCs, Android tablets, iPad, Mac — any device with a modern browser and LAN connectivity.

**Making the address permanent (done once during property setup):**

Option A — Hosts file entry on each device:
Add `192.168.1.10  nexura.local` to the device's hosts file. Requires one-time admin access per device.

Option B — Local DNS on the hotel router:
Configure the router's DNS to resolve `nexura.local` → local server IP. Applies to every device on the network automatically. Preferred approach.

Option C — Browser bookmark / homepage:
Set the browser homepage to `http://192.168.1.10` and optionally configure the browser in kiosk mode. Simplest approach, no DNS or hosts file changes needed.

**Kiosk mode (recommended for front desk PCs):**

Configure Chrome or Edge to open in fullscreen app mode at startup:
```
chrome.exe --app=http://nexura.local --start-fullscreen
```

This makes Nexura feel like a native installed application — no browser chrome, no tabs, no address bar visible. Staff simply see Nexura at full screen when the PC boots.

## 10.3 The Local Server Itself — Installation

The local server is installed once per branch by you (or a trained technician) during the client onboarding process.

**Hardware options:**

| Option | Description | Cost range | Best for |
|---|---|---|---|
| Mini-PC (supplied by you) | Small form-factor Windows or Linux PC, pre-configured and shipped. Plug in, power on, done. | ₦80,000–₦150,000 hardware cost | Standard onboarding — cleanest experience |
| Client's existing PC | Install on a dedicated back-office PC the client already has. Requires remote access or on-site visit. | ₦0 hardware (labor only) | Cost-sensitive clients |
| Client's NAS device | Some NAS devices (Synology, QNAP) can run Docker containers. Install local server as a container. | ₦0 additional hardware | Tech-savvy clients with existing infrastructure |
| Cloud VM (hybrid mode) | For clients with reliable internet, local server runs on a cloud VM instead of on-site. Loses true offline capability — only suitable where offline resilience is not required. | Monthly VM cost | Urban properties with guaranteed connectivity |

**Installation process:**

```
1. Physical or remote access to the target machine established.

2. Install Docker (if not present) — single command:
   curl -fsSL https://get.docker.com | sh

3. Pull the Nexura local server image from your private registry:
   docker pull registry.nexura.app/nexura-local:latest

4. Run the provisioning command with the branch's unique
   provisioning token (generated from your Admin Console):
   docker run -d \
     --name nexura-local \
     --restart always \
     -p 80:80 \
     -e PROVISION_TOKEN="xxxxxx" \
     -v hms_data:/data \
     registry.nexura.app/nexura-local:latest

5. The container:
   a. Connects to central server using PROVISION_TOKEN
   b. Downloads organization config (org_id, branch_id,
      enabled modules, room list, user accounts, rate plans)
   c. Generates local signing key pair
   d. Initializes local database with seeded data
   e. Reports "provisioning complete" to central server
   f. Begins serving the web app on port 80

6. Navigate to http://[machine-ip] from any LAN device.
   Login screen confirms successful installation.

7. Log in as Super Admin (credentials provided by Platform
   Owner during provisioning).

8. Configure property profile, verify room list, create
   Branch Manager account.

9. Branch is fully operational.

Total installation time: 15–30 minutes per branch,
including LAN hostname setup.
```

## 10.4 Multi-Device, Multi-Role at One Branch

One local server handles every device at the branch simultaneously. There is no per-device license or per-device configuration:

```
Hotel LAN
│
├── Front Desk PC 1     → http://nexura.local (Receptionist A)
├── Front Desk PC 2     → http://nexura.local (Receptionist B)
├── Manager's Laptop    → http://nexura.local (Branch Manager)
├── Housekeeping Tablet → http://nexura.local (HK Attendant)
├── Maintenance Tablet  → http://nexura.local (Technician)
├── Restaurant Terminal → http://nexura.local (Restaurant Staff)
└── Accountant's PC     → http://nexura.local (Accountant)
```

All devices serve themselves from the same local server. Each user logs in with their individual account. Role-based navigation and permissions are applied per session. Multiple people can be logged into different accounts on different devices simultaneously — standard concurrent session support.

---

# PART 11 — HOW UPDATES REACH CLIENTS

## 11.1 The Update Architecture

Because the React application is served from the local server — not from a CDN or the internet — updates flow through the local server, not to client devices directly.

```
Your Development Machine
         │
         │  Push new build
         ▼
Private Docker Registry
(registry.nexura.app)
         │
         │  Auto-updater polls every 6 hours
         ▼
Local Server at Branch A   Local Server at Branch B   ...
         │                          │
         │  Serves updated app      │  Serves updated app
         ▼                          ▼
All LAN devices              All LAN devices
(next page refresh)          (next page refresh)
```

Client devices receive the update on their next page refresh after the local server applies it. There is no action required from staff or hotel management. They refresh the page and are on the new version.

## 11.2 Update Process in Detail

```
1. You push a new Docker image to your private registry:
   docker push registry.nexura.app/nexura-local:1.2.3

2. Each local server's auto-updater service wakes on schedule
   (every 6 hours, configurable) and checks the registry for
   a newer image version.

3. If a new version is available:
   a. Downloads new image in background (no service interruption)
   b. Waits for a low-traffic window (2am–4am local time, by
      default — configurable per property)
   c. Spins up new container alongside old one
   d. Runs database migrations if any (on a copy of local DB)
   e. Health check on new container
   f. If health check passes: switches traffic to new container,
      terminates old one. Zero-downtime swap.
   g. If health check fails: rolls back to old container,
      alerts Platform Owner via Admin Console.

4. All active browser sessions continue uninterrupted through
   the swap (existing JWTs remain valid, session table
   persists in the database volume).

5. On next page navigation, staff receive the new React build
   from the updated local server.

6. Update completion logged to central server — Platform Owner
   can see which branches are on which version in Admin Console.
```

## 11.3 Staged Rollouts

You can push updates to a subset of branches first:

```
Tag strategy in Docker registry:

  nexura-local:stable       → All branches pull this by default
  nexura-local:beta         → Specific branches configured to pull beta
  nexura-local:1.2.3        → Pin a specific version (emergency rollback)

To stage a rollout:
  1. Push nexura-local:beta
  2. Configure 2–3 test branches to pull the beta channel
  3. Monitor for 24–48 hours via Admin Console
  4. If stable: docker tag nexura-local:beta nexura-local:stable
  5. Push — all remaining branches update on their next check cycle
```

## 11.4 Emergency Hotfixes

If a critical bug needs to reach all branches immediately:

```
1. Push nexura-local:hotfix-1.2.4
2. From Admin Console: "Force update all branches" command
3. Central server sends a "check for updates now" signal to
   all connected local servers via the existing sync channel
4. Connected branches update within minutes
5. Offline branches update on next connection to central
6. Platform Owner can see per-branch update status in real time
```

## 11.5 Rollback

If an update causes problems after deployment:

```
From Admin Console:
1. Select affected branches
2. "Rollback to previous version" action
3. Central server sends rollback command to those local servers
4. Local servers revert to the previous Docker image
   (kept cached for exactly this purpose)
5. Rollback completes without data loss —
   DB migrations are versioned and reversible
```

---

# PART 12 — OFF-SITE ACCESS

## 12.1 The Default Situation

Branch apps (`http://nexura.local`) are only accessible on the hotel LAN. This is intentional — the offline-first architecture is predicated on LAN-only operation. There is no public URL for a branch app by default.

This is not a limitation. It is a security property. The branch database is never exposed to the internet.

## 12.2 Organization Super Admin Remote Access

The Super Admin's cross-branch remote access is handled by the Organization Portal at `portal.nexura.app` — a separate, internet-facing interface served by the central server showing aggregated data from all branch syncs. This gives remote visibility without exposing any branch's local server.

**What the portal shows:**
- All Multi-Branch Management screens (MB-01, MB-02, MB-03)
- Aggregated reports across all branches (RP-01 through RP-06)
- Sync status and health of all branches
- User management (create/deactivate accounts)
- Billing and subscription management

**What the portal does NOT give:**
- Live real-time branch operational data (it shows synced data, not live websocket feeds)
- Access to branch-level operational screens (those stay on the LAN)
- Any write access to branch data that bypasses the branch's local sync queue

## 12.3 Advanced: VPN Access (premium tier)

For clients who specifically require live remote access to a branch's operational screens — e.g., a GM who wants to remotely see the live Reservation Grid from home — a VPN tunnel to the hotel's LAN is the correct technical solution.

Configuration approach:
- Install WireGuard VPN on the branch's local server (or router)
- Issue VPN credentials to authorized remote users
- Remote user connects VPN → appears to be on hotel LAN → browses to `http://nexura.local` normally
- Full app access with their standard credentials

This is an optional, chargeable configuration provided during onboarding. It is not a default feature.

## 12.4 What Off-Site Staff Should NOT Do

Staff should never use port-forwarding on the hotel's router to expose the local server directly to the internet (`http://[public-ip]:80`). This eliminates all security protections. If a client asks for this, the correct response is to offer the VPN option instead.

---

# PART 13 — PROVISIONING A NEW CLIENT: END-TO-END

This section documents the complete sequence from signed contract to fully operational branch.

```
DAY 0 — AGREEMENT
─────────────────
1. Contract signed, plan tier agreed (Starter / Growth / Business).
2. Hardware decision made:
   - You supply pre-configured mini-PC (ship to property), OR
   - Client has a machine — you access remotely.
3. Onboarding fee invoiced.


DAY 1 — CENTRAL SETUP (Platform Owner — ~15 minutes)
─────────────────────────────────────────────────────
4. Log into admin.nexura.app.
5. Create Organization record:
   - Name, contact details, plan tier, billing info.
6. Create first Organization Super Admin account:
   - Name, email, temporary password.
   - Email sent to client with login instructions.
7. Create Branch record for branch 1:
   - Property name, address, room count.
   - Enabled modules (matched to plan tier).
8. Generate Provisioning Token for branch 1 (one-time token,
   expires in 48 hours).
9. Send Provisioning Token to technician doing the install.


DAY 1–2 — LOCAL SERVER INSTALLATION (technician — ~30 minutes)
───────────────────────────────────────────────────────────────
10. Physical or remote access to the branch's target machine.
11. Run install commands (see Part 10.3 for full command set).
12. Local server boots, connects to central using Provisioning Token.
13. Downloads initial configuration:
    - Organization and branch metadata
    - Room list (if pre-configured; otherwise configured in-app)
    - Super Admin account (synced from central)
    - Enabled modules per plan
    - Default rate plans and tax configuration
14. Local signing key generated and stored.
15. Database initialized.
16. Local server begins serving app on http://[machine-ip].
17. Technician verifies: opens browser, sees login screen.
18. Logs in as Super Admin with credentials provided.
19. Configures LAN hostname (nexura.local → machine IP).
20. Tests from a second device on the LAN.
21. Provisioning marked complete in Admin Console.


DAY 2 — CLIENT HANDOVER & SETUP (Super Admin — ~2 hours)
─────────────────────────────────────────────────────────
22. Super Admin logs in for first time.
23. Completes Property Profile:
    - Hotel name, logo, address, check-in/out times.
    - Currency, timezone.
24. Enables/confirms modules for this property
    (pre-set per plan, Super Admin can review).
25. Configures rooms (add room numbers, types, floors, amenities)
    if not pre-imported.
26. Configures tax rates and pricing rules.
27. Creates Branch Manager account.
28. Branch Manager logs in, creates staff accounts:
    - Front Desk, Housekeeping, Maintenance, etc.
29. Staff log in and confirm access.
30. (If door lock module enabled): IT Admin configures ST-04
    Door Lock Integration — TTLock API credentials, room mapping,
    encoder test.
31. Test check-in performed with a dummy reservation to verify
    full workflow including folio, billing, and door lock.
32. Branch is live.


ONGOING — EACH ADDITIONAL BRANCH
─────────────────────────────────
33. Repeat steps 7–32 for each new branch.
34. Billing system automatically adds new branch's subscription
    line on provisioning completion.
35. Branch appears in Super Admin's Branch Overview (MB-01)
    after first successful sync.
```

---

# PART 14 — AUTH & DISTRIBUTION DECISION REFERENCE

Quick-reference table for the most commonly asked questions:

| Question | Answer |
|---|---|
| Where is the web app served from? | The local server on the hotel LAN — not the internet |
| Can staff work when internet is down? | Yes — fully, for all core operations |
| Where are JWT tokens validated? | At the local server — no internet call required |
| How long do tokens last? | Access token: 12 hours default. Refresh token: 30 days |
| What happens when a token expires offline? | Grace period extension (8 hours default) issued locally |
| Can two people use the same account? | Technically yes, but discouraged — breaks audit trail |
| What happens when an account is deactivated? | Session revoked in real time — next request returns 401 |
| Does the central server see branch sessions? | No — local server tokens are never sent to central |
| Is there an app to install on client devices? | No — browser only, navigate to http://nexura.local |
| How do updates reach staff devices? | Through the local server; staff just refresh the browser |
| How long does a branch installation take? | 30 minutes for the server; 2 hours for full client setup |
| Can a Super Admin access the app remotely? | Via the Organization Portal (aggregated data only); live access requires VPN |
| Is the local server's database exposed to internet? | No — LAN only by default |
| What if the local server machine breaks? | Restore from local or cloud backup to replacement hardware; provisioning token reissued |
| How do you push emergency updates to all clients? | "Force update" from Admin Console — reaches all connected branches within minutes |
| How do you roll back a bad update? | "Rollback" command from Admin Console — reverts to previous Docker image |

---

*End of document.*
*Companion document to: Nexura Complete Master Blueprint v1.0*
*Version 1.0 — covers full authentication architecture, session management, security model, and client distribution.*
