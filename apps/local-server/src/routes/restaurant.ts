// RT-01 POS Terminal, RT-02 Kitchen Display, RT-03 Table Management,
// RT-04 Menu Management. RT-06 Room Service is folded into the same order
// model (roomReservationId instead of tableId) rather than a separate
// screen/table. RT-05 Dining Reservations and RT-07 (Guest Room Charges
// lives in finance.ts-style query, not here) are a separate pass -- see
// ROADMAP.md.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { menuCategories, menuItems, restaurantTables, restaurantOrders, restaurantOrderItems, reservations, guests, rooms, folioCharges } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();

// ─── Menu (RT-04) ───────────────────────────────────────────────────────────
router.get("/menu", requireAuth, (req: AuthedRequest, res) => {
  const branchId = req.auth!.branchId;
  const categories = db.select().from(menuCategories).where(eq(menuCategories.branchId, branchId)).orderBy(menuCategories.sortOrder).all();
  const items = db.select().from(menuItems).where(eq(menuItems.branchId, branchId)).all();
  res.json(categories.map(c => ({ ...c, items: items.filter(i => i.categoryId === c.id) })));
});

const createCategorySchema = z.object({ name: z.string().min(1) });

router.post("/menu/categories", requireAuth, requirePermission("restaurant:manage"), (req: AuthedRequest, res) => {
  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const id = nanoid();
  const count = db.select().from(menuCategories).where(eq(menuCategories.branchId, req.auth!.branchId)).all().length;
  db.insert(menuCategories).values({ id, branchId: req.auth!.branchId, name: parsed.data.name, sortOrder: count }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "menu_category_created", module: "Restaurant", recordId: id, details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ id });
});

const createItemSchema = z.object({ categoryId: z.string(), name: z.string().min(1), price: z.number().positive() });

router.post("/menu/items", requireAuth, requirePermission("restaurant:manage"), (req: AuthedRequest, res) => {
  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const category = db.select().from(menuCategories).where(eq(menuCategories.id, parsed.data.categoryId)).get();
  if (!category || category.branchId !== req.auth!.branchId) return res.status(400).json({ error: "CATEGORY_NOT_FOUND" });

  const id = nanoid();
  db.insert(menuItems).values({ id, branchId: req.auth!.branchId, categoryId: parsed.data.categoryId, name: parsed.data.name, price: parsed.data.price, available: true }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "menu_item_created", module: "Restaurant", recordId: id, details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ id });
});

const availabilitySchema = z.object({ available: z.boolean() });

router.post("/menu/items/:id/availability", requireAuth, requirePermission("restaurant:manage"), (req: AuthedRequest, res) => {
  const item = db.select().from(menuItems).where(eq(menuItems.id, req.params.id)).get();
  if (!item || item.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(menuItems).set({ available: parsed.data.available }).where(eq(menuItems.id, item.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: parsed.data.available ? "menu_item_enabled" : "menu_item_86d", module: "Restaurant", recordId: item.id, details: item.name, ipAddress: req.ip });
  res.json({ ok: true });
});

// ─── Tables (RT-03) ─────────────────────────────────────────────────────────
router.get("/tables", requireAuth, (req: AuthedRequest, res) => {
  res.json(db.select().from(restaurantTables).where(eq(restaurantTables.branchId, req.auth!.branchId)).all());
});

const tableStatusSchema = z.object({ status: z.enum(["available", "occupied", "reserved", "dirty"]) });

router.post("/tables/:id/status", requireAuth, requirePermission("restaurant:manage"), (req: AuthedRequest, res) => {
  const table = db.select().from(restaurantTables).where(eq(restaurantTables.id, req.params.id)).get();
  if (!table || table.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  const parsed = tableStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(restaurantTables).set({ status: parsed.data.status }).where(eq(restaurantTables.id, table.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "table_status_changed", module: "Restaurant", recordId: table.id, details: `${table.label} -> ${parsed.data.status}`, ipAddress: req.ip });
  res.json(db.select().from(restaurantTables).where(eq(restaurantTables.id, table.id)).get());
});

// ─── Orders (RT-01, RT-02, RT-06) ───────────────────────────────────────────
function orderTotal(orderId: string) {
  return db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, orderId)).all()
    .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

router.get("/orders", requireAuth, requirePermission("restaurant:manage"), (req: AuthedRequest, res) => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  let rows = db.select({
    id: restaurantOrders.id, tableId: restaurantOrders.tableId, roomReservationId: restaurantOrders.roomReservationId,
    status: restaurantOrders.status, createdAt: restaurantOrders.createdAt, closedAt: restaurantOrders.closedAt,
    tableLabel: restaurantTables.label,
  })
    .from(restaurantOrders)
    .leftJoin(restaurantTables, eq(restaurantOrders.tableId, restaurantTables.id))
    .where(eq(restaurantOrders.branchId, req.auth!.branchId))
    .orderBy(desc(restaurantOrders.createdAt))
    .all();
  if (statusFilter) rows = rows.filter(r => r.status === statusFilter);

  const withItemsAndTotal = rows.map(r => ({
    ...r,
    items: db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, r.id)).all(),
    total: orderTotal(r.id),
  }));
  res.json(withItemsAndTotal);
});

const createOrderSchema = z.object({ tableId: z.string().optional(), roomReservationId: z.string().optional() })
  .refine(d => (!!d.tableId) !== (!!d.roomReservationId), { message: "exactly one of tableId or roomReservationId is required" });

router.post("/orders", requireAuth, requirePermission("restaurant:operate"), (req: AuthedRequest, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  if (parsed.data.tableId) {
    const table = db.select().from(restaurantTables).where(eq(restaurantTables.id, parsed.data.tableId)).get();
    if (!table || table.branchId !== req.auth!.branchId) return res.status(400).json({ error: "TABLE_NOT_FOUND" });
    db.update(restaurantTables).set({ status: "occupied" }).where(eq(restaurantTables.id, table.id)).run();
  } else if (parsed.data.roomReservationId) {
    const reservation = db.select().from(reservations).where(eq(reservations.id, parsed.data.roomReservationId)).get();
    if (!reservation || reservation.branchId !== req.auth!.branchId) return res.status(400).json({ error: "RESERVATION_NOT_FOUND" });
    if (reservation.status !== "checked_in") return res.status(409).json({ error: "GUEST_NOT_IN_HOUSE" });
  }

  const id = nanoid();
  db.insert(restaurantOrders).values({
    id, branchId: req.auth!.branchId, tableId: parsed.data.tableId, roomReservationId: parsed.data.roomReservationId,
    status: "open", serverId: req.auth!.userId, createdAt: new Date(),
  }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "restaurant_order_opened", module: "Restaurant", recordId: id, ipAddress: req.ip });
  res.status(201).json({ id });
});

// Deliberately NOT audit-logged below: adding items, sending to kitchen, and
// per-item ready/served bumps are multiple-times-a-minute kitchen-floor
// operations during service, not administrative actions -- the order and
// its full item list stay fully visible via GET /orders/:id regardless, so
// nothing is lost, it's just not a discrete audit_log row per ticket bump.

function loadOrderOrNull(id: string, branchId: string) {
  const order = db.select().from(restaurantOrders).where(eq(restaurantOrders.id, id)).get();
  if (!order || order.branchId !== branchId) return null;
  return order;
}

router.get("/orders/:id", requireAuth, requirePermission("restaurant:manage"), (req: AuthedRequest, res) => {
  const order = loadOrderOrNull(req.params.id, req.auth!.branchId);
  if (!order) return res.status(404).json({ error: "NOT_FOUND" });
  const items = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, order.id)).all();
  res.json({ ...order, items, total: items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) });
});

const addItemSchema = z.object({ menuItemId: z.string(), quantity: z.number().int().positive().default(1) });

router.post("/orders/:id/items", requireAuth, requirePermission("restaurant:operate"), (req: AuthedRequest, res) => {
  const order = loadOrderOrNull(req.params.id, req.auth!.branchId);
  if (!order) return res.status(404).json({ error: "NOT_FOUND" });
  if (order.status === "closed") return res.status(409).json({ error: "ORDER_CLOSED" });

  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const menuItem = db.select().from(menuItems).where(eq(menuItems.id, parsed.data.menuItemId)).get();
  if (!menuItem || menuItem.branchId !== req.auth!.branchId) return res.status(400).json({ error: "MENU_ITEM_NOT_FOUND" });
  if (!menuItem.available) return res.status(409).json({ error: "ITEM_86D" });

  db.insert(restaurantOrderItems).values({
    id: nanoid(), orderId: order.id, menuItemId: menuItem.id, name: menuItem.name,
    quantity: parsed.data.quantity, unitPrice: menuItem.price, status: "pending",
  }).run();

  const items = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, order.id)).all();
  res.status(201).json({ items, total: items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) });
});

router.post("/orders/:id/send-to-kitchen", requireAuth, requirePermission("restaurant:operate"), (req: AuthedRequest, res) => {
  const order = loadOrderOrNull(req.params.id, req.auth!.branchId);
  if (!order) return res.status(404).json({ error: "NOT_FOUND" });
  db.update(restaurantOrders).set({ status: "sent_to_kitchen" }).where(eq(restaurantOrders.id, order.id)).run();
  res.json({ ok: true });
});

const itemStatusSchema = z.object({ status: z.enum(["pending", "ready", "served"]) });

// RT-02 KDS actions -- mark item ready, then served/bumped.
router.post("/orders/:id/items/:itemId/status", requireAuth, requirePermission("restaurant:operate"), (req: AuthedRequest, res) => {
  const order = loadOrderOrNull(req.params.id, req.auth!.branchId);
  if (!order) return res.status(404).json({ error: "NOT_FOUND" });
  const item = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.id, req.params.itemId)).get();
  if (!item || item.orderId !== order.id) return res.status(404).json({ error: "ITEM_NOT_FOUND" });

  const parsed = itemStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  db.update(restaurantOrderItems).set({ status: parsed.data.status }).where(eq(restaurantOrderItems.id, item.id)).run();

  const items = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, order.id)).all();
  if (items.length > 0 && items.every(i => i.status === "served")) {
    db.update(restaurantOrders).set({ status: "served" }).where(eq(restaurantOrders.id, order.id)).run();
  }
  res.json({ ok: true });
});

const closeOrderSchema = z.object({
  postToRoom: z.boolean(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
}).refine(d => d.postToRoom || !!d.paymentMethod, { message: "paymentMethod is required when not posting to room" });

// RT-01 "Post to Room Folio" / "Accept Payment" close actions. No split
// bill or discount authorization gate in this pass -- see ROADMAP.md.
router.post("/orders/:id/close", requireAuth, requirePermission("restaurant:operate"), (req: AuthedRequest, res) => {
  const order = loadOrderOrNull(req.params.id, req.auth!.branchId);
  if (!order) return res.status(404).json({ error: "NOT_FOUND" });
  if (order.status === "closed") return res.status(409).json({ error: "ALREADY_CLOSED" });

  const parsed = closeOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const items = db.select().from(restaurantOrderItems).where(eq(restaurantOrderItems.orderId, order.id)).all();
  if (items.length === 0) return res.status(400).json({ error: "ORDER_EMPTY" });
  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  if (parsed.data.postToRoom) {
    if (!order.roomReservationId) return res.status(400).json({ error: "NO_ROOM_LINKED" });
    const reservation = db.select().from(reservations).where(eq(reservations.id, order.roomReservationId)).get();
    if (!reservation || reservation.status !== "checked_in") return res.status(409).json({ error: "GUEST_NOT_IN_HOUSE" });
    db.insert(folioCharges).values({
      id: nanoid(), reservationId: order.roomReservationId, category: "Restaurant",
      description: `Order ${order.id.slice(0, 8)} — ${items.map(i => `${i.name} x${i.quantity}`).join(", ")}`,
      quantity: 1, unitPrice: total, amount: total, postedBy: req.auth!.userId, postedAt: new Date(),
    }).run();
    db.update(restaurantOrders).set({ status: "closed", closedAt: new Date() }).where(eq(restaurantOrders.id, order.id)).run();
  } else {
    db.update(restaurantOrders).set({
      status: "closed", closedAt: new Date(), paymentMethod: parsed.data.paymentMethod, paidAmount: total,
    }).where(eq(restaurantOrders.id, order.id)).run();
  }

  if (order.tableId) db.update(restaurantTables).set({ status: "dirty" }).where(eq(restaurantTables.id, order.tableId)).run();

  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "restaurant_order_closed", module: "Restaurant", recordId: order.id, details: parsed.data.postToRoom ? `Posted to room (${total})` : `${parsed.data.paymentMethod} (${total})`, ipAddress: req.ip });
  res.json({ id: order.id, status: "closed", total });
});

// RT-07 Guest Room Charges. A read view over folio_charges -- same table
// Front Desk and Finance already read/write, filtered to F&B categories.
// No separate "post new charge" action here -- that's what RT-01's
// "Post to Room Folio" close action already does; duplicating it as a
// freeform entry point would let staff bypass the order/kitchen trail.
router.get("/room-charges", requireAuth, requirePermission("folio:postcharge"), (req: AuthedRequest, res) => {
  const branchReservations = db.select({ id: reservations.id, guestId: reservations.guestId, roomId: reservations.roomId })
    .from(reservations).where(eq(reservations.branchId, req.auth!.branchId)).all();
  const byReservation = new Map(branchReservations.map(r => [r.id, r]));

  const charges = db.select().from(folioCharges).where(eq(folioCharges.category, "Restaurant")).orderBy(desc(folioCharges.postedAt)).all()
    .filter(c => byReservation.has(c.reservationId));

  const result = charges.map(c => {
    const r = byReservation.get(c.reservationId)!;
    const guest = db.select().from(guests).where(eq(guests.id, r.guestId)).get();
    const room = r.roomId ? db.select().from(rooms).where(eq(rooms.id, r.roomId)).get() : null;
    return {
      id: c.id, reservationId: c.reservationId, description: c.description, amount: c.amount, postedAt: c.postedAt,
      guestFirstName: guest?.firstName ?? null, guestLastName: guest?.lastName ?? null, roomNumber: room?.number ?? null,
    };
  });
  res.json(result);
});

export default router;
