// IV-01 Stock Dashboard, IV-02 Products, IV-03 Suppliers,
// IV-04 Stock Transactions, IV-05 Purchase Orders. Also backs HK-06 Linen &
// Supplies as a category-filtered view of the same products/transactions
// (GET /inventory/products?category=Linen) -- see schema.ts for why.
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { products, stockTransactions, suppliers, purchaseOrders, purchaseOrderItems, users } from "../db/schema.js";
import { requireAuth, requirePermission, type AuthedRequest } from "../auth/middleware.js";
import { logAudit } from "../services/audit.js";

const router = Router();


// ─── Products (IV-02, HK-06) ────────────────────────────────────────────────
router.get("/products", requireAuth, requirePermission("inventory:read"), (req: AuthedRequest, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  let rows = db.select().from(products).where(eq(products.branchId, req.auth!.branchId)).all();
  if (category) rows = rows.filter(p => p.category === category);
  res.json(rows);
});

const createProductSchema = z.object({
  itemCode: z.string().min(1), name: z.string().min(1), category: z.string().min(1), unit: z.string().min(1),
  parLevel: z.number().nonnegative(), reorderThreshold: z.number().nonnegative(), unitCost: z.number().nonnegative(),
  location: z.string().optional(), initialStock: z.number().nonnegative().default(0),
});

router.post("/products", requireAuth, requirePermission("inventory:write"), (req: AuthedRequest, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const id = nanoid();
  const now = new Date();
  db.insert(products).values({
    id, branchId: req.auth!.branchId, itemCode: parsed.data.itemCode, name: parsed.data.name,
    category: parsed.data.category, unit: parsed.data.unit, currentStock: parsed.data.initialStock,
    parLevel: parsed.data.parLevel, reorderThreshold: parsed.data.reorderThreshold, unitCost: parsed.data.unitCost,
    location: parsed.data.location, updatedAt: now,
  }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "product_created", module: "Inventory", recordId: id, details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ id });
});

function logStockChange(productId: string, branchId: string, type: "in" | "out" | "adjustment", delta: number, reference: string | undefined, userId: string) {
  db.insert(stockTransactions).values({
    id: nanoid(), branchId, productId, type, quantity: delta, reference, loggedBy: userId, createdAt: new Date(),
  }).run();
}

const adjustSchema = z.object({
  type: z.enum(["in", "out", "adjustment"]),
  quantity: z.number(), // in/out: positive amount moved; adjustment: new absolute stock count
  reference: z.string().optional(),
});

// IV-02 "Adjust stock count" / IV-04 "Log manual transaction" -- one
// endpoint backs both UI entry points since they're the same operation.
router.post("/products/:id/adjust", requireAuth, requirePermission("inventory:write"), (req: AuthedRequest, res) => {
  const product = db.select().from(products).where(eq(products.id, req.params.id)).get();
  if (!product || product.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });

  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const { type, quantity, reference } = parsed.data;

  let newStock: number;
  let delta: number;
  if (type === "in") { delta = Math.abs(quantity); newStock = product.currentStock + delta; }
  else if (type === "out") {
    delta = -Math.abs(quantity);
    newStock = product.currentStock + delta;
    if (newStock < 0) return res.status(409).json({ error: "INSUFFICIENT_STOCK", currentStock: product.currentStock });
  } else { newStock = quantity; delta = newStock - product.currentStock; }

  db.update(products).set({ currentStock: newStock, updatedAt: new Date() }).where(eq(products.id, product.id)).run();
  logStockChange(product.id, req.auth!.branchId, type, delta, reference, req.auth!.userId);

  res.json(db.select().from(products).where(eq(products.id, product.id)).get());
});

router.get("/products/:id/transactions", requireAuth, requirePermission("inventory:read"), (req: AuthedRequest, res) => {
  const product = db.select().from(products).where(eq(products.id, req.params.id)).get();
  if (!product || product.branchId !== req.auth!.branchId) return res.status(404).json({ error: "NOT_FOUND" });
  const rows = db.select().from(stockTransactions).where(eq(stockTransactions.productId, product.id)).orderBy(desc(stockTransactions.createdAt)).all();
  res.json(rows);
});

// ─── Stock Transactions, all products (IV-04) ──────────────────────────────
router.get("/transactions", requireAuth, requirePermission("inventory:read"), (req: AuthedRequest, res) => {
  const rows = db.select({
    id: stockTransactions.id, type: stockTransactions.type, quantity: stockTransactions.quantity,
    reference: stockTransactions.reference, createdAt: stockTransactions.createdAt,
    productName: products.name, productUnit: products.unit,
    loggedByFirstName: users.firstName, loggedByLastName: users.lastName,
  })
    .from(stockTransactions)
    .leftJoin(products, eq(stockTransactions.productId, products.id))
    .leftJoin(users, eq(stockTransactions.loggedBy, users.id))
    .where(eq(stockTransactions.branchId, req.auth!.branchId))
    .orderBy(desc(stockTransactions.createdAt))
    .all();
  res.json(rows);
});

// ─── Dashboard (IV-01) ──────────────────────────────────────────────────────
router.get("/dashboard", requireAuth, requirePermission("inventory:read"), (req: AuthedRequest, res) => {
  const items = db.select().from(products).where(eq(products.branchId, req.auth!.branchId)).all();
  const lowStock = items.filter(p => p.currentStock <= p.reorderThreshold);
  const totalValue = items.reduce((s, p) => s + p.currentStock * p.unitCost, 0);
  const recent = db.select({
    id: stockTransactions.id, type: stockTransactions.type, quantity: stockTransactions.quantity, createdAt: stockTransactions.createdAt,
    productName: products.name,
  })
    .from(stockTransactions)
    .leftJoin(products, eq(stockTransactions.productId, products.id))
    .where(eq(stockTransactions.branchId, req.auth!.branchId))
    .orderBy(desc(stockTransactions.createdAt))
    .limit(10)
    .all();

  res.json({ totalItems: items.length, lowStockCount: lowStock.length, totalValue, lowStockItems: lowStock, recentTransactions: recent });
});

// ─── Suppliers (IV-03) ──────────────────────────────────────────────────────
router.get("/suppliers", requireAuth, requirePermission("purchasing:suppliers"), (req: AuthedRequest, res) => {
  res.json(db.select().from(suppliers).where(eq(suppliers.branchId, req.auth!.branchId)).all());
});

const createSupplierSchema = z.object({ name: z.string().min(1), contact: z.string().optional(), phone: z.string().optional(), category: z.string().optional(), paymentTerms: z.string().optional() });

router.post("/suppliers", requireAuth, requirePermission("purchasing:suppliers"), (req: AuthedRequest, res) => {
  const parsed = createSupplierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const id = nanoid();
  db.insert(suppliers).values({ id, branchId: req.auth!.branchId, ...parsed.data }).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "supplier_created", module: "Inventory", recordId: id, details: parsed.data.name, ipAddress: req.ip });
  res.status(201).json({ id });
});

// ─── Purchase Orders (IV-05) ────────────────────────────────────────────────
router.get("/purchase-orders", requireAuth, requirePermission("purchasing:orders"), (req: AuthedRequest, res) => {
  const rows = db.select({
    id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, status: purchaseOrders.status,
    createdAt: purchaseOrders.createdAt, sentAt: purchaseOrders.sentAt, receivedAt: purchaseOrders.receivedAt,
    supplierName: suppliers.name,
  })
    .from(purchaseOrders)
    .leftJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(purchaseOrders.branchId, req.auth!.branchId))
    .orderBy(desc(purchaseOrders.createdAt))
    .all();

  const withTotals = rows.map(po => {
    const items = db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)).all();
    return { ...po, itemCount: items.length, total: items.reduce((s, i) => s + i.quantity * i.unitCost, 0) };
  });
  res.json(withTotals);
});

const createPoSchema = z.object({
  supplierId: z.string(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().positive(), unitCost: z.number().nonnegative() })).min(1),
});

router.post("/purchase-orders", requireAuth, requirePermission("purchasing:orders"), (req: AuthedRequest, res) => {
  const parsed = createPoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });

  const supplier = db.select().from(suppliers).where(eq(suppliers.id, parsed.data.supplierId)).get();
  if (!supplier || supplier.branchId !== req.auth!.branchId) return res.status(400).json({ error: "SUPPLIER_NOT_FOUND" });

  const id = nanoid();
  const now = new Date();
  const poCount = db.select().from(purchaseOrders).where(eq(purchaseOrders.branchId, req.auth!.branchId)).all().length;
  const poNumber = `PO-${String(poCount + 1).padStart(4, "0")}`;

  db.insert(purchaseOrders).values({ id, branchId: req.auth!.branchId, poNumber, supplierId: supplier.id, status: "draft", createdBy: req.auth!.userId, createdAt: now }).run();
  for (const item of parsed.data.items) {
    db.insert(purchaseOrderItems).values({ id: nanoid(), purchaseOrderId: id, productId: item.productId, quantity: item.quantity, unitCost: item.unitCost }).run();
  }
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "purchase_order_created", module: "Inventory", recordId: id, details: poNumber, ipAddress: req.ip });
  res.status(201).json({ id, poNumber });
});

function loadPoOrNull(id: string, branchId: string) {
  const po = db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)).get();
  if (!po || po.branchId !== branchId) return null;
  return po;
}

router.get("/purchase-orders/:id", requireAuth, requirePermission("purchasing:orders"), (req: AuthedRequest, res) => {
  const po = loadPoOrNull(req.params.id, req.auth!.branchId);
  if (!po) return res.status(404).json({ error: "NOT_FOUND" });
  const supplier = db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).get();
  const items = db.select({
    id: purchaseOrderItems.id, quantity: purchaseOrderItems.quantity, unitCost: purchaseOrderItems.unitCost,
    productId: purchaseOrderItems.productId, productName: products.name, productUnit: products.unit,
  })
    .from(purchaseOrderItems)
    .leftJoin(products, eq(purchaseOrderItems.productId, products.id))
    .where(eq(purchaseOrderItems.purchaseOrderId, po.id))
    .all();
  res.json({ ...po, supplier, items, total: items.reduce((s, i) => s + i.quantity * i.unitCost, 0) });
});

router.post("/purchase-orders/:id/send", requireAuth, requirePermission("purchasing:orders"), (req: AuthedRequest, res) => {
  const po = loadPoOrNull(req.params.id, req.auth!.branchId);
  if (!po) return res.status(404).json({ error: "NOT_FOUND" });
  if (po.status !== "draft") return res.status(409).json({ error: "INVALID_STATUS", status: po.status });

  const now = new Date();
  db.update(purchaseOrders).set({ status: "sent", sentAt: now }).where(eq(purchaseOrders.id, po.id)).run();
  db.update(suppliers).set({ lastOrderDate: now }).where(eq(suppliers.id, po.supplierId)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "purchase_order_sent", module: "Inventory", recordId: po.id, details: po.poNumber, ipAddress: req.ip });
  res.json({ ok: true });
});

// "Mark received (triggers stock transaction auto-entry)" -- every PO line
// item posts a real "in" stock transaction and bumps the product's
// currentStock, same mechanism as a manual adjustment.
router.post("/purchase-orders/:id/receive", requireAuth, requirePermission("purchasing:orders"), (req: AuthedRequest, res) => {
  const po = loadPoOrNull(req.params.id, req.auth!.branchId);
  if (!po) return res.status(404).json({ error: "NOT_FOUND" });
  if (po.status !== "sent") return res.status(409).json({ error: "INVALID_STATUS", status: po.status });

  const items = db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id)).all();
  for (const item of items) {
    const product = db.select().from(products).where(eq(products.id, item.productId)).get();
    if (!product) continue;
    db.update(products).set({ currentStock: product.currentStock + item.quantity, updatedAt: new Date() }).where(eq(products.id, product.id)).run();
    logStockChange(product.id, req.auth!.branchId, "in", item.quantity, po.poNumber, req.auth!.userId);
  }

  db.update(purchaseOrders).set({ status: "received", receivedAt: new Date() }).where(eq(purchaseOrders.id, po.id)).run();
  // The actual stock deltas are already itemized in stock_transactions
  // (logStockChange above, per line item) -- this is just the PO lifecycle
  // event itself, not a duplicate of that ledger.
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "purchase_order_received", module: "Inventory", recordId: po.id, details: po.poNumber, ipAddress: req.ip });
  res.json({ ok: true });
});

router.post("/purchase-orders/:id/cancel", requireAuth, requirePermission("purchasing:orders"), (req: AuthedRequest, res) => {
  const po = loadPoOrNull(req.params.id, req.auth!.branchId);
  if (!po) return res.status(404).json({ error: "NOT_FOUND" });
  if (po.status === "received") return res.status(409).json({ error: "ALREADY_RECEIVED" });
  db.update(purchaseOrders).set({ status: "cancelled" }).where(eq(purchaseOrders.id, po.id)).run();
  logAudit({ userId: req.auth!.userId, branchId: req.auth!.branchId, action: "purchase_order_cancelled", module: "Inventory", recordId: po.id, details: po.poNumber, ipAddress: req.ip });
  res.json({ ok: true });
});

export default router;
