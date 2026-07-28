// Hand-written detail (summary/description/requestBody/responses) per
// endpoint, keyed by "METHOD /path-with-:params" (the raw Express path,
// before generate-openapi.mjs converts :param -> {param} for the actual
// OpenAPI document). Kept separate from the extraction logic on purpose:
// re-running the generator after a route changes never clobbers this
// file, and every requestBody schema here was copied directly from the
// real zod schema in the corresponding routes/*.ts file, not invented --
// keep it that way when routes change.
const j = (schema) => ({ content: { "application/json": { schema } } });

export const ENRICHMENTS = {
  // ── Auth ──────────────────────────────────────────────────────────────
  "POST /auth/login": {
    summary: "Branch staff login", description: "Issues an `access_token` (12h) and `refresh_token` (30d) httpOnly cookie pair. See Auth doc Part 6.1.",
    requestBody: j({ type: "object", required: ["email", "password"], properties: { email: { type: "string", format: "email" }, password: { type: "string" } } }),
  },
  "POST /auth/continue-offline": {
    summary: "Offline session extension", description: "Auth doc Part 7.1. Not gated by `requireAuth` because the whole point is the access token has *expired* -- this endpoint validates the expired token itself and, if it expired within the last 8 hours (`GRACE_PERIOD_HOURS`), issues a 4-hour extension token. Past that window, returns 401 `GRACE_PERIOD_EXPIRED`.",
  },
  "POST /auth/logout": { summary: "Log out", description: "Clears the session cookies and revokes the session server-side." },
  "GET /auth/me": { summary: "Current session identity" },
  "POST /auth/change-password": {
    summary: "Change own password",
    requestBody: j({ type: "object", required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string" }, newPassword: { type: "string", minLength: 8 } } }),
  },

  // ── Rooms / Guests / Reservations ────────────────────────────────────
  "GET /rooms": { summary: "List rooms for the branch" },
  "GET /guests": { summary: "Search guests", description: "`?search=` matches first name, last name, or phone. No `search` param returns the branch's most recent 20 guests." },
  "POST /guests": {
    summary: "Create a guest profile", description: "FD-04 inline guest creation.",
    requestBody: j({ type: "object", required: ["firstName", "lastName"], properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string", format: "email" }, phone: { type: "string" }, idType: { type: "string" }, idNumber: { type: "string" } } }),
  },
  "GET /reservations": { summary: "Reservation grid", description: "Every non-cancelled reservation for the branch, joined with guest name and room number." },
  "POST /reservations": {
    summary: "Create a reservation (R-02)", description: "Either `guestId` (existing guest) or `newGuest` (creates one inline) is required, not both. Rejects with `409 ROOM_CONFLICT` if the room is already booked for an overlapping date range.",
    requestBody: j({ type: "object", required: ["checkInDate", "checkOutDate", "rate"], properties: {
      guestId: { type: "string" }, newGuest: { type: "object", properties: { firstName: { type: "string" }, lastName: { type: "string" }, email: { type: "string" }, phone: { type: "string" } } },
      roomId: { type: "string" }, checkInDate: { type: "string", format: "date" }, checkOutDate: { type: "string", format: "date" },
      rate: { type: "number", minimum: 0, exclusiveMinimum: true }, adults: { type: "integer", minimum: 1, default: 1 }, children: { type: "integer", minimum: 0, default: 0 }, specialRequests: { type: "string" },
    } }),
  },
  "GET /reservations/:id": { summary: "Reservation detail", description: "Includes guest, room, and a computed real-time folio summary." },
  "POST /reservations/:id/check-in": {
    summary: "Check in (FD-01 step 6)", description: "Refuses with `409 ROOM_NOT_CLEAN` unless the room's housekeeping status is `clean` or `inspected` (HK-01 genuinely gates Front Desk). Posts the room-rate line item to the folio for real.",
    requestBody: j({ type: "object", properties: { roomId: { type: "string", description: "Overrides the reservation's currently-assigned room, if any." } } }),
  },
  "POST /reservations/:id/folio/charges": {
    summary: "Post a manual folio charge (FD-10)",
    requestBody: j({ type: "object", required: ["category", "description", "unitPrice"], properties: { category: { type: "string" }, description: { type: "string" }, quantity: { type: "integer", minimum: 1, default: 1 }, unitPrice: { type: "number", minimum: 0 } } }),
  },
  "POST /reservations/:id/check-out": {
    summary: "Settle & release room (FD-02)", description: "Refuses with `409 BALANCE_REMAINING` while the folio balance is above zero. On success, room goes to `cleaning`/`dirty` for Housekeeping to pick up, and real door-lock credentials are revoked (Blueprint 6.9).",
    requestBody: j({ type: "object", properties: { paymentAmount: { type: "number", minimum: 0 }, paymentMethod: { type: "string", enum: ["cash", "card", "transfer"], description: "Required if paymentAmount > 0." } } }),
  },

  // ── Housekeeping ──────────────────────────────────────────────────────
  "GET /housekeeping/rooms": { summary: "Housekeeping board (HK-01)" },
  "POST /housekeeping/rooms/:id/status": {
    summary: "Update a room's housekeeping status",
    requestBody: j({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["dirty", "in_progress", "clean", "inspected"] } } }),
  },
  "POST /housekeeping/rooms/:id/assign": {
    summary: "Assign an attendant to a room",
    requestBody: j({ type: "object", required: ["attendantId"], properties: { attendantId: { type: "string", nullable: true } } }),
  },
  "GET /housekeeping/inspections": { summary: "Inspection log (HK-04)" },
  "POST /housekeeping/inspections": {
    summary: "Record a room inspection", description: "`pass` releases the room to `inspected`; `fail` sends it back to `dirty` for re-cleaning.",
    requestBody: j({ type: "object", required: ["roomId", "result"], properties: { roomId: { type: "string" }, result: { type: "string", enum: ["pass", "fail"] }, notes: { type: "string" } } }),
  },
  "GET /lost-found": { summary: "Lost & Found log (HK-05)" },
  "POST /lost-found": {
    summary: "Log a found item",
    requestBody: j({ type: "object", required: ["description"], properties: { description: { type: "string" }, locationFound: { type: "string" } } }),
  },
  "POST /lost-found/:id/claim": { summary: "Mark an item claimed", requestBody: j({ type: "object", required: ["claimedBy"], properties: { claimedBy: { type: "string" } } }) },
  "POST /lost-found/:id/dispose": { summary: "Dispose of an unclaimed item", requestBody: j({ type: "object", required: ["reason"], properties: { reason: { type: "string" } } }) },

  // ── Maintenance ───────────────────────────────────────────────────────
  "GET /maintenance/work-orders": { summary: "Work order list (MX-01)" },
  "POST /maintenance/work-orders": {
    summary: "Report an issue (MX-03)", description: "Open to any authenticated role, not just Maintenance -- Blueprint specs this as 'all roles with reporting access'.",
    requestBody: j({ type: "object", required: ["location", "category", "priority", "description"], properties: { location: { type: "string" }, category: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high"] }, description: { type: "string" } } }),
  },
  "GET /maintenance/work-orders/:id": { summary: "Work order detail (MX-02)", description: "Includes the full real event timeline (created/assigned/status-changed/notes)." },
  "POST /maintenance/work-orders/:id/status": { summary: "Advance work order status", requestBody: j({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["reported", "assigned", "in_progress", "completed"] } } }) },
  "POST /maintenance/work-orders/:id/assign": { summary: "Assign a technician", requestBody: j({ type: "object", required: ["technicianId"], properties: { technicianId: { type: "string" } } }) },
  "POST /maintenance/work-orders/:id/notes": { summary: "Add a work order note", requestBody: j({ type: "object", required: ["note"], properties: { note: { type: "string" } } }) },

  // ── Restaurant / POS ──────────────────────────────────────────────────
  "GET /restaurant/menu": { summary: "Menu, grouped by category" },
  "POST /restaurant/menu/categories": { summary: "Create a menu category", requestBody: j({ type: "object", required: ["name"], properties: { name: { type: "string" } } }) },
  "POST /restaurant/menu/items": { summary: "Create a menu item", requestBody: j({ type: "object", required: ["categoryId", "name", "price"], properties: { categoryId: { type: "string" }, name: { type: "string" }, price: { type: "number", minimum: 0, exclusiveMinimum: true } } }) },
  "POST /restaurant/menu/items/:id/availability": { summary: "86 / re-enable a menu item", requestBody: j({ type: "object", required: ["available"], properties: { available: { type: "boolean" } } }) },
  "GET /restaurant/tables": { summary: "Table Management board (RT-03)" },
  "POST /restaurant/tables/:id/status": { summary: "Update table status", requestBody: j({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["available", "occupied", "reserved", "dirty"] } } }) },
  "GET /restaurant/orders": { summary: "Order list", description: "`?status=` filters (e.g. `open`, `sent_to_kitchen`, `served`, `closed`)." },
  "POST /restaurant/orders": {
    summary: "Open an order (POS or Room Service)", description: "Exactly one of `tableId` (POS) or `roomReservationId` (RT-06 room service) is required -- rejects with `400 INVALID_INPUT` if both or neither are set.",
    requestBody: j({ type: "object", properties: { tableId: { type: "string" }, roomReservationId: { type: "string" } } }),
  },
  "GET /restaurant/orders/:id": { summary: "Order detail with items and running total" },
  "POST /restaurant/orders/:id/items": { summary: "Add an item to an open order", requestBody: j({ type: "object", required: ["menuItemId"], properties: { menuItemId: { type: "string" }, quantity: { type: "integer", minimum: 1, default: 1 } } }) },
  "POST /restaurant/orders/:id/send-to-kitchen": { summary: "Send order to the kitchen display" },
  "POST /restaurant/orders/:id/items/:itemId/status": { summary: "Update a single item's kitchen status (RT-02 KDS)", requestBody: j({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["pending", "ready", "served"] } } }) },
  "POST /restaurant/orders/:id/close": {
    summary: "Close an order — post to room or take payment", description: "`postToRoom: true` posts the total as a real folio charge on the linked reservation (refuses if the guest isn't checked in); otherwise `paymentMethod` is required.",
    requestBody: j({ type: "object", required: ["postToRoom"], properties: { postToRoom: { type: "boolean" }, paymentMethod: { type: "string", enum: ["cash", "card", "transfer"] } } }),
  },
  "GET /restaurant/room-charges": { summary: "Guest Room Charges (RT-07)", description: "Restaurant-category folio charges only, read from the same `folio_charges` table Front Desk and Finance use." },

  // ── Finance & Billing ─────────────────────────────────────────────────
  "GET /finance/folios": { summary: "Folio Management list (FI-01)", description: "`?status=`, `?minBalance=true`, `?dateFrom=`/`?dateTo=` filters." },
  "POST /finance/folios/:id/dispute": { summary: "Toggle a folio's disputed flag", requestBody: j({ type: "object", required: ["disputed"], properties: { disputed: { type: "boolean" } } }) },
  "GET /finance/daily-summary": { summary: "Daily Summary (FI-03)", description: "`?date=YYYY-MM-DD`, defaults to today. Real aggregation of `folio_charges` by category and `payments` by method for the calendar day." },

  // ── Inventory ─────────────────────────────────────────────────────────
  "GET /inventory/products": { summary: "Product list (IV-02)", description: "`?category=` also backs HK-06 Linen & Supplies as a filtered view of the same data." },
  "POST /inventory/products": {
    summary: "Create a product",
    requestBody: j({ type: "object", required: ["itemCode", "name", "category", "unit", "parLevel", "reorderThreshold", "unitCost"], properties: { itemCode: { type: "string" }, name: { type: "string" }, category: { type: "string" }, unit: { type: "string" }, parLevel: { type: "number", minimum: 0 }, reorderThreshold: { type: "number", minimum: 0 }, unitCost: { type: "number", minimum: 0 }, location: { type: "string" }, initialStock: { type: "number", minimum: 0, default: 0 } } }),
  },
  "POST /inventory/products/:id/adjust": {
    summary: "Adjust stock (IV-02 count adjust / IV-04 manual transaction)", description: "One endpoint backs both UI entry points. `in`/`out` are a relative delta; `adjustment` sets the absolute new count. Every call posts a real `stock_transactions` row -- this *is* the audit trail for stock, nothing else duplicates it.",
    requestBody: j({ type: "object", required: ["type", "quantity"], properties: { type: { type: "string", enum: ["in", "out", "adjustment"] }, quantity: { type: "number" }, reference: { type: "string" } } }),
  },
  "GET /inventory/products/:id/transactions": { summary: "Stock transaction history for one product" },
  "GET /inventory/transactions": { summary: "Stock Transactions, all products (IV-04)" },
  "GET /inventory/dashboard": { summary: "Stock Dashboard (IV-01)", description: "Low-stock count, total inventory value, and the 10 most recent transactions." },
  "GET /inventory/suppliers": { summary: "Supplier list (IV-03)" },
  "POST /inventory/suppliers": { summary: "Create a supplier", requestBody: j({ type: "object", required: ["name"], properties: { name: { type: "string" }, contact: { type: "string" }, phone: { type: "string" }, category: { type: "string" }, paymentTerms: { type: "string" } } }) },
  "GET /inventory/purchase-orders": { summary: "Purchase Order list (IV-05)" },
  "POST /inventory/purchase-orders": {
    summary: "Create a purchase order",
    requestBody: j({ type: "object", required: ["supplierId", "items"], properties: { supplierId: { type: "string" }, items: { type: "array", minItems: 1, items: { type: "object", required: ["productId", "quantity", "unitCost"], properties: { productId: { type: "string" }, quantity: { type: "number", minimum: 0, exclusiveMinimum: true }, unitCost: { type: "number", minimum: 0 } } } } } }),
  },
  "GET /inventory/purchase-orders/:id": { summary: "Purchase order detail with line items" },
  "POST /inventory/purchase-orders/:id/send": { summary: "Mark PO sent to supplier", description: "Requires status `draft`." },
  "POST /inventory/purchase-orders/:id/receive": { summary: "Mark PO received", description: "Requires status `sent`. Posts a real `in` stock transaction for every line item and bumps `products.currentStock` — the actual mechanism behind 'triggers stock transaction auto-entry'." },
  "POST /inventory/purchase-orders/:id/cancel": { summary: "Cancel a purchase order", description: "Refuses with `409 ALREADY_RECEIVED` once received." },

  // ── HR & Staff ────────────────────────────────────────────────────────
  "GET /hr/staff": { summary: "Staff Directory (HR-01)", description: "`?department=`, `?status=` filters." },
  "POST /hr/staff": {
    summary: "Create a staff member (HR-01)", description: "Returns a one-time temp password for the manager to relay. `role` must be a real, existing role id (built-in or custom, HR-03) -- validated against the live `roles` table, not a hardcoded enum.",
    requestBody: j({ type: "object", required: ["email", "firstName", "lastName", "role", "department"], properties: { email: { type: "string", format: "email" }, firstName: { type: "string" }, lastName: { type: "string" }, role: { type: "string" }, department: { type: "string" }, phone: { type: "string" }, payRate: { type: "number", minimum: 0 }, contractType: { type: "string", enum: ["Full-time", "Part-time", "Contract"] } } }),
  },
  "GET /hr/staff/:id": { summary: "Staff Profile Detail (HR-02)", description: "Notes are only included in the response for viewers with `hr:manage`; a staff member viewing their own profile without that permission gets the rest of the profile but an empty notes array." },
  "POST /hr/staff/:id/update": { summary: "Edit a staff profile", requestBody: j({ type: "object", properties: { department: { type: "string" }, phone: { type: "string" }, emergencyContactName: { type: "string" }, emergencyContactPhone: { type: "string" }, role: { type: "string" }, contractType: { type: "string", enum: ["Full-time", "Part-time", "Contract"] } } }) },
  "POST /hr/staff/:id/deactivate": { summary: "Deactivate a staff account" },
  "POST /hr/staff/:id/reset-password": { summary: "Reset a staff member's password", description: "Returns a one-time temp password." },
  "POST /hr/staff/:id/pay-rate": { summary: "Adjust a staff member's pay rate", requestBody: j({ type: "object", required: ["payRate"], properties: { payRate: { type: "number", minimum: 0 } } }) },
  "POST /hr/staff/:id/notes": { summary: "Add a management note to a staff profile", requestBody: j({ type: "object", required: ["note"], properties: { note: { type: "string" } } }) },
  "GET /hr/attendance": { summary: "Attendance (HR-04)", description: "`?start=`/`?end=`, defaults to the last 7 days. Includes pending leave requests." },
  "POST /hr/attendance": { summary: "Record an attendance entry", requestBody: j({ type: "object", required: ["userId", "date", "status"], properties: { userId: { type: "string" }, date: { type: "string", format: "date" }, status: { type: "string", enum: ["present", "absent", "late", "leave"] }, notes: { type: "string" } } }) },
  "POST /hr/leave-requests": { summary: "Record a leave request", description: "Manager-recorded, not staff self-service — Blueprint's HR module list only specs 'record manual entry / approve.'", requestBody: j({ type: "object", required: ["userId", "startDate", "endDate"], properties: { userId: { type: "string" }, startDate: { type: "string", format: "date" }, endDate: { type: "string", format: "date" }, reason: { type: "string" } } }) },
  "POST /hr/leave-requests/:id/decide": { summary: "Approve or reject a leave request", description: "Approval cascades into real `attendance` rows (status `leave`) for every date in the range.", requestBody: j({ type: "object", required: ["decision"], properties: { decision: { type: "string", enum: ["approved", "rejected"] } } }) },
  "GET /hr/shifts": { summary: "Shift Scheduler (HR-05)", description: "`?start=`/`?end=`, defaults to the next 7 days." },
  "POST /hr/shifts": { summary: "Set a staff member's shift for a date", description: "Upsert — overwrites any existing shift for that (staff, date) pair.", requestBody: j({ type: "object", required: ["userId", "date", "shiftType"], properties: { userId: { type: "string" }, date: { type: "string", format: "date" }, shiftType: { type: "string", enum: ["Morning", "Evening", "Night", "Off"] } } }) },
  "POST /hr/shifts/publish": { summary: "Publish all draft shifts in a date range", requestBody: j({ type: "object", required: ["start", "end"], properties: { start: { type: "string", format: "date" }, end: { type: "string", format: "date" } } }) },
  "POST /hr/shifts/clone": { summary: "Clone a week's shift pattern to a new week", requestBody: j({ type: "object", required: ["fromStart", "toStart"], properties: { fromStart: { type: "string", format: "date" }, toStart: { type: "string", format: "date" } } }) },
  "GET /hr/payroll": { summary: "Payroll Summary (HR-06)", description: "`?period=YYYY-MM`, defaults to the current month. Deducts a prorated daily rate for unapproved absences; no overtime/tax/benefits modeling." },
  "GET /hr/roles": { summary: "List roles (HR-03)", description: "Includes real live user counts and permission counts per role." },
  "GET /hr/roles/:id": { summary: "Role detail — the permission matrix (HR-03)", description: "Returns the role's current permissions, the full permission catalog for rendering the toggle matrix, and every user currently assigned this role." },
  "POST /hr/roles": {
    summary: "Create a custom role (HR-03)", description: "Custom roles start with an empty permission set (`isSystemRole: false`) — pick permissions afterward via the permissions endpoint below.",
    requestBody: j({ type: "object", required: ["name"], properties: { name: { type: "string" }, permissions: { type: "array", items: { type: "string" }, description: "Optional at creation; validated against the real permission key catalog." } } }),
  },
  "POST /hr/roles/:id/permissions": {
    summary: "Edit a role's permissions — built-in or custom (HR-03)", description: "Real, live consequence: every active session held by a user with this role is invalidated on its very next request (the `permissions_hash` embedded in their JWT stops matching).",
    requestBody: j({ type: "object", required: ["permissions"], properties: { permissions: { oneOf: [{ type: "string", enum: ["*"] }, { type: "array", items: { type: "string" } }] } } }),
  },
  "DELETE /hr/roles/:id": { summary: "Delete a custom role", description: "Refuses with `400` for a built-in role, or `409 ROLE_IN_USE` if any staff member is still assigned to it." },

  // ── Communications ────────────────────────────────────────────────────
  "GET /chat/channels": { summary: "Internal Chat channel list (CO-01)", description: "Department channels plus any DM involving the caller, each with a last-message preview. Polling-based (frontend polls every 15s), not push." },
  "POST /chat/dm": { summary: "Find or create a DM channel", requestBody: j({ type: "object", required: ["otherUserId"], properties: { otherUserId: { type: "string" } } }) },
  "GET /chat/channels/:id/messages": { summary: "Message history for a channel", description: "403/404s for a DM the caller isn't a party to. Frontend polls every 4s for the active channel." },
  "POST /chat/channels/:id/messages": { summary: "Send a chat message", requestBody: j({ type: "object", required: ["body"], properties: { body: { type: "string" }, emergency: { type: "boolean", description: "Emergency Broadcast — posts to #All Staff with a flagged banner." } } }) },
  "GET /announcements": { summary: "Announcement list (CO-03)", description: "`?archived=true` includes archived ones. Read counts are real, tracked via `announcement_reads`." },
  "POST /announcements": { summary: "Post an announcement", requestBody: j({ type: "object", required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "string" }, targetAudience: { type: "string", default: "all" }, expiresAt: { type: "string", format: "date-time" } } }) },
  "POST /announcements/:id/read": { summary: "Mark an announcement read", description: "Passive — called when a viewer loads the screen with the announcement visible, not a manual action." },
  "POST /announcements/:id/archive": { summary: "Archive an announcement" },
  "GET /shift-handovers": { summary: "Shift Handover list (CO-04)" },
  "POST /shift-handovers": {
    summary: "Create a shift handover note",
    requestBody: j({ type: "object", required: ["shiftName"], properties: { shiftName: { type: "string" }, outstandingTasks: { type: "string" }, vipGuests: { type: "string" }, maintenanceIssues: { type: "string" }, guestComplaints: { type: "string" }, pendingPayments: { type: "string" }, generalNotes: { type: "string" } } }),
  },
  "GET /shift-handovers/:id": { summary: "Shift handover detail" },
  "POST /shift-handovers/:id/acknowledge": { summary: "Acknowledge a handover", description: "Refuses with `409 ALREADY_ACKNOWLEDGED` on a repeat call." },

  "GET /guest-messages/in-house": { summary: "In-house guest picker for starting a conversation (CO-02)" },
  "GET /guest-messages/threads": { summary: "Every guest conversation thread for the branch", description: "Newest activity first, real last-message preview, flags whether the guest is currently in-house." },
  "GET /guest-messages/threads/:guestId": { summary: "Thread detail + full message history", description: "Lazily creates an empty thread on first access if this guest has never been messaged." },
  "POST /guest-messages/threads/:guestId/messages": {
    summary: "Log a guest communication", description: "This is a real communication *log*, not a WhatsApp/SMS send — `channel` records how the real-world conversation happened, it doesn't trigger delivery. See the module description.",
    requestBody: j({ type: "object", required: ["channel", "direction", "body"], properties: { channel: { type: "string", enum: ["whatsapp", "sms", "internal"] }, direction: { type: "string", enum: ["to_guest", "from_guest"] }, body: { type: "string" } } }),
  },
  "POST /guest-messages/threads/:guestId/forward": {
    summary: "Forward a thread to a department", description: "Posts a real message into that department's actual Internal Chat channel (auto-created if the branch doesn't have one yet) — the receiving team sees it where they already look.",
    requestBody: j({ type: "object", required: ["department"], properties: { department: { type: "string", enum: ["Front Desk", "Housekeeping", "Maintenance", "Restaurant"] } } }),
  },
  "POST /guest-messages/threads/:guestId/escalate": { summary: "Escalate a thread to management", description: "Posts a real message into a real DM with every Manager/ORG at the branch, reusing Internal Chat rather than a separate inbox." },
  "POST /guest-messages/threads/:guestId/resolve": { summary: "Mark a guest thread resolved" },

  // ── Reports ───────────────────────────────────────────────────────────
  "GET /reports/occupancy": { summary: "Occupancy Report (RP-01)" },
  "GET /reports/revenue": { summary: "Revenue Report (RP-02)" },
  "GET /reports/department": { summary: "Department Report (RP-03)", description: "Open to any authenticated role — no permission gate, matches every other 'own numbers' view." },
  "GET /reports/guest-analytics": { summary: "Guest Analytics (RP-04)", description: "Includes real month-bucketed repeat-vs-new guest computation over a 6-month lookback window." },
  "GET /reports/inventory": { summary: "Inventory Report (RP-05)" },
  "GET /reports/staff": { summary: "Staff Performance Report (RP-06)" },

  // ── IT Admin ──────────────────────────────────────────────────────────
  "GET /admin/users": { summary: "User Management list (IT-01)" },
  "POST /admin/users": {
    summary: "Invite a new user (IT-01)", description: "Returns a one-time temp password. `role` validated against the live `roles` table.",
    requestBody: j({ type: "object", required: ["email", "firstName", "lastName", "role"], properties: { email: { type: "string", format: "email" }, firstName: { type: "string" }, lastName: { type: "string" }, role: { type: "string" } } }),
  },
  "POST /admin/users/:id/role": { summary: "Change a user's role", requestBody: j({ type: "object", required: ["role"], properties: { role: { type: "string" } } }) },
  "POST /admin/users/:id/reset-password": { summary: "Reset a user's password (IT-01)" },
  "POST /admin/users/:id/deactivate": { summary: "Deactivate a user" },
  "POST /admin/users/:id/reactivate": { summary: "Reactivate a user" },
  "GET /admin/users/:id/audit-log": { summary: "Per-user audit history" },
  "GET /admin/system-health": { summary: "System Health (IT-02)" },
  "POST /admin/diagnostics": { summary: "Run a diagnostics check (IT-02)" },
  "GET /admin/error-log": { summary: "Captured server error log (IT-02)" },
  "GET /admin/devices": { summary: "Authorized devices / active sessions (IT-03)" },
  "POST /admin/devices/:sessionId/deauthorize": { summary: "Revoke a session (IT-03)" },
  "GET /admin/backups": { summary: "Backup Snapshots list (IT-04)" },
  "POST /admin/backups": { summary: "Create a backup snapshot (IT-04)" },
  "POST /admin/backups/:id/restore": {
    summary: "Restore from a backup snapshot (IT-04)", description: "Stages a restore marker — the running process can't safely swap its own open SQLite file mid-request, so this applies on the *next* server boot, not immediately.",
    requestBody: j({ type: "object", required: ["confirm"], properties: { confirm: { type: "string", enum: ["RESTORE"] } } }),
  },
  "GET /admin/audit-log": { summary: "Platform-level audit log (IT-05)", description: "Append-only, enforced at the DB level with `BEFORE UPDATE`/`BEFORE DELETE` triggers, not just an absent delete endpoint." },

  // ── Settings ──────────────────────────────────────────────────────────
  "GET /settings/branch": { summary: "Branch/property config (ST-01)", description: "Readable by any authenticated user — the sidebar needs `enabledModules` regardless of the viewer's role." },
  "POST /settings/branch": {
    summary: "Update branch/property settings",
    requestBody: j({ type: "object", properties: { name: { type: "string" }, address: { type: "string" }, contactPhone: { type: "string" }, contactEmail: { type: "string" }, checkInTime: { type: "string" }, checkOutTime: { type: "string" }, currency: { type: "string" }, timezone: { type: "string" }, taxName: { type: "string" }, taxRate: { type: "number", minimum: 0 }, taxInclusive: { type: "boolean" }, rateRounding: { type: "integer", minimum: 0 }, discountApprovalThreshold: { type: "number", minimum: 0 }, enabledModules: { type: "array", items: { type: "string", enum: ["restaurant", "inventory", "multiBranch", "doorLock"] } } } }),
  },
  "GET /settings/me": { summary: "My Preferences (ST-03)" },
  "POST /settings/me": { summary: "Update my preferences", requestBody: j({ type: "object", properties: { language: { type: "string" }, dateFormat: { type: "string" }, timeFormat: { type: "string", enum: ["24h", "12h"] }, notificationPrefs: { type: "object", additionalProperties: { type: "boolean" } } } }) },

  // ── Dashboard / Sync ──────────────────────────────────────────────────
  "GET /dashboard/me": { summary: "Role-based dashboard (D-01)", description: "`?role=` lets MGT/ORG preview another role's dashboard — server-enforced, silently ignored for anyone else." },
  "GET /dashboard/overview": { summary: "Management overview dashboard (D-02)" },
  "GET /sync/status": { summary: "Sync & Deployment status (ST-02)", description: "Includes real deployment fields (current version, update channel, pending force-update/rollback) alongside push/pull sync state." },
  "POST /sync/now": { summary: "Trigger an immediate sync push/pull", description: "Also triggers a real update-availability check against the registry as part of the pull." },

  // ── Door Lock (Blueprint Part 6) ──────────────────────────────────────
  "GET /door-lock/config": { summary: "Door lock provider config (ST-04)", description: "Secrets are write-only — `hasClientSecret`/`hasPassword` booleans are returned instead of the real values." },
  "POST /door-lock/config": {
    summary: "Update door lock provider config", description: "An empty string for `clientSecret`/`password` means 'leave unchanged', since the real value is never echoed back to the frontend to re-submit.",
    requestBody: j({ type: "object", properties: { provider: { type: "string" }, clientId: { type: "string" }, clientSecret: { type: "string" }, username: { type: "string" }, password: { type: "string" }, autoRevokeOnCheckout: { type: "boolean" }, queueWhenOffline: { type: "boolean" }, notifyMgtOnOfflineRevoke: { type: "boolean" }, maxCardsPerCheckIn: { type: "integer", minimum: 1, maximum: 10 }, queueExpiryBufferHours: { type: "number", minimum: 0, maximum: 24 } } }),
  },
  "POST /door-lock/config/test-connection": { summary: "Test the configured TTLock connection", description: "A real call against TTLock's live API — a genuine 'invalid client_id' from `api.sciener.com` is a successful test of the adapter, not a failure of this endpoint." },
  "GET /door-lock/room-mapping": { summary: "Room ↔ physical lock mapping" },
  "POST /door-lock/room-mapping": { summary: "Set a room's lock mapping", requestBody: j({ type: "object", required: ["roomId", "ttlockLockId", "lockName"], properties: { roomId: { type: "string" }, ttlockLockId: { type: "string" }, lockName: { type: "string" } } }) },
  "POST /door-lock/room-mapping/auto-map": { summary: "Auto-map rooms to locks by name (Blueprint 6.11)", description: "Calls TTLock's real lock list and fuzzy-matches names to room numbers." },
  "GET /door-lock/credentials": { summary: "Access credentials (FD-09/12/14)", description: "`?status=` filters (`active` by default, or `all`)." },
  "GET /door-lock/events": { summary: "Key Card Log (FD-13)", description: "Real append-only event feed, most recent 500." },
  "GET /door-lock/queue": { summary: "Lock Command Queue Monitor (6.10)", description: "Pending offline-queued lock commands for the branch." },
  "POST /door-lock/queue/retry-now": { summary: "Force an immediate queue retry" },
  "POST /door-lock/issue": {
    summary: "Issue a card or PIN credential (Check-In step 7, FD-12, FD-14)", description: "Refuses with `409 MAX_CARDS_REACHED` past the configured per-checkin card limit unless `isDuplicate` is set.",
    requestBody: j({ type: "object", required: ["reservationId", "credentialType"], properties: { reservationId: { type: "string" }, credentialType: { type: "string", enum: ["card", "pin"] }, isDuplicate: { type: "boolean" }, parentCredentialId: { type: "string" } } }),
  },
  "POST /door-lock/physical-key": { summary: "Log a physical key fallback issuance", requestBody: j({ type: "object", required: ["reservationId", "keyReference"], properties: { reservationId: { type: "string" }, keyReference: { type: "string" }, notes: { type: "string" } } }) },
  "POST /door-lock/revoke/:credentialId": { summary: "Revoke a single credential", requestBody: j({ type: "object", required: ["reason"], properties: { reason: { type: "string", enum: ["checkout", "lost", "expired", "manual", "emergency"] } } }) },
  "POST /door-lock/revoke-room/:roomId": { summary: "Emergency Revoke — every credential for a room (Blueprint 6.8)", requestBody: j({ type: "object", required: ["reason"], properties: { reason: { type: "string" } } }) },

  // ── Users ─────────────────────────────────────────────────────────────
  "GET /users": { summary: "Branch staff list", description: "Lighter-weight than HR-01's Staff Directory — used for picker/assignment UI (e.g. assigning a housekeeper or technician)." },
};
