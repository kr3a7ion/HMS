// Backend Blueprint B7 — document numbering and invoicing.
//
// The headline is gaplessness under concurrency, and it is tested twice
// because the two versions prove different things and neither is enough
// alone:
//
//   1. WITH REAL OS-LEVEL CONCURRENCY (worker threads, each with its own
//      SQLite connection to the same file). better-sqlite3 is synchronous and
//      Node runs one thread, so 100 HTTP requests in one process do NOT
//      contend the way two cashiers on two tills do. Workers do. This is the
//      test that would catch a missing BEGIN IMMEDIATE.
//
//   2. THROUGH THE REAL SERVICE over HTTP, which proves the actual code path
//      allocates and commits together -- something the worker test cannot
//      show, because a worker cannot load the TypeScript service.
import { test, describe, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { nanoid } from "nanoid";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;

const ROOM_50K = 5_000_000;

let server: http.Server;
let baseUrl: string;
let orgId: string;
let branchId: string;
let finCookie: string;
let finUserId: string;

async function loginAs(role: string) {
  const { db } = await import("../db/client.js");
  const { users } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");
  const id = nanoid();
  const email = `doc-${id}@example.com`.toLowerCase();
  db.insert(users).values({
    id, organizationId: orgId, branchId, email, role,
    passwordHash: await hashPassword("correct-password"),
    firstName: "Doc", lastName: "User", status: "active", createdAt: new Date(),
  }).run();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correct-password" }),
  });
  assert.equal(res.status, 200, `login should succeed for ${role}`);
  return { cookie: res.headers.get("set-cookie")!.split(";")[0], userId: id };
}

/** A checked-in stay with one ₦50,000 room charge plus whatever tax applies. */
async function makeFolio(rateKobo = ROOM_50K) {
  const { db } = await import("../db/client.js");
  const { guests, rooms, reservations } = await import("../db/schema.js");
  const { postChargeWithTax } = await import("../services/tax/posting.js");
  const { currentBusinessDate } = await import("../lib/businessDate.js");

  const roomId = nanoid();
  db.insert(rooms).values({ id: roomId, branchId, number: `D${Math.floor(Math.random() * 1_000_000)}`, type: "Standard" }).run();
  const guestId = nanoid();
  db.insert(guests).values({ id: guestId, branchId, firstName: "Invoice", lastName: "Guest", vip: false, blacklisted: false, createdAt: new Date() }).run();
  const reservationId = nanoid();
  db.insert(reservations).values({
    id: reservationId, branchId, guestId, roomId, status: "checked_in",
    checkInDate: new Date(Date.UTC(2026, 4, 1)), checkOutDate: new Date(Date.UTC(2026, 4, 3)),
    rateKobo, createdBy: finUserId, createdAt: new Date(),
  }).run();

  const posted = postChargeWithTax({
    reservationId, branchId, category: "Room", description: "Room — night 1",
    quantity: 1, unitPriceKobo: rateKobo, amountKobo: rateKobo,
    postedBy: finUserId, businessDate: currentBusinessDate(branchId),
  });
  return { reservationId, guestId, chargeId: posted.chargeId, totalKobo: posted.totalKobo };
}

beforeAll(async () => {
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("Failed to bind test server");
  baseUrl = `http://127.0.0.1:${address.port}`;

  const { db } = await import("../db/client.js");
  const { organizations, branches } = await import("../db/schema.js");
  orgId = nanoid();
  branchId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Doc Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "Abuja Branch", createdAt: new Date(),
    currentBusinessDate: new Date(Date.UTC(2026, 4, 1)), businessDateRollHour: 3,
  }).run();

  const fin = await loginAs("FIN");
  finCookie = fin.cookie;
  finUserId = fin.userId;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  const { sqlite } = await import("../db/client.js");
  sqlite.close();
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${testDbPath}${suffix}`, { force: true });
});

describe("numbering", () => {
  test("a number is formatted from the branch's own prefix", async () => {
    const { allocateNumber } = await import("../services/documents/sequence.js");
    const { immediateTransaction } = await import("../db/tx.js");

    const first = immediateTransaction(() => allocateNumber(branchId, "proforma"));
    const second = immediateTransaction(() => allocateNumber(branchId, "proforma"));

    // "ABU" from "Abuja Branch" -- the branch code is what makes numbers
    // unique estate-wide without any central coordinator, which matters
    // because a branch issues documents while offline.
    assert.match(first.formatted, /^ABU-PRO-\d{4}-00001$/);
    assert.match(second.formatted, /^ABU-PRO-\d{4}-00002$/);
    assert.equal(second.sequenceNumber, first.sequenceNumber + 1);
  });

  test("a failed transaction does not consume a number", async () => {
    const { allocateNumber } = await import("../services/documents/sequence.js");
    const { immediateTransaction } = await import("../db/tx.js");
    const { db } = await import("../db/client.js");
    const { documentSequences } = await import("../db/schema.js");
    const { and, eq } = await import("drizzle-orm");

    const readNext = () => db.select().from(documentSequences).where(and(
      eq(documentSequences.branchId, branchId),
      eq(documentSequences.documentType, "complaint"),
    )).get()?.nextNumber ?? 1;

    const before = readNext();
    assert.throws(() => immediateTransaction(() => {
      allocateNumber(branchId, "complaint");
      // Whatever the document write was, it failed.
      throw new Error("document write failed");
    }), /document write failed/);

    assert.equal(
      readNext(), before,
      "the bump must roll back with the document -- otherwise every failure leaves a permanent hole in the audit trail",
    );
  });
});

describe("gapless under real concurrency", () => {
  test("8 threads on separate connections allocate 200 numbers with no gaps and no duplicates", async () => {
    // REAL contention: each worker opens its own better-sqlite3 connection to
    // the same file, so these run simultaneously on separate OS threads and
    // genuinely fight over the same row. This is the arrangement that breaks
    // a read-then-write without BEGIN IMMEDIATE.
    //
    // WHAT IT CANNOT DO: load the TypeScript service. The worker executes the
    // same SQL sequence allocateNumber performs, so it proves the transaction
    // discipline is sufficient; the HTTP test below proves the service
    // actually uses it.
    const { db } = await import("../db/client.js");
    const { documentSequences } = await import("../db/schema.js");
    const { and, eq } = await import("drizzle-orm");

    // Give this test its own document type so it cannot interact with any
    // other test's sequence.
    const seqId = nanoid();
    db.insert(documentSequences).values({
      id: seqId, branchId, documentType: "trip", prefix: "ABU-TRP-2026-",
      nextNumber: 1, padWidth: 5, createdAt: new Date(),
    }).run();

    const require_ = createRequire(import.meta.url);
    const betterSqlitePath = require_.resolve("better-sqlite3");
    const workerPath = path.join(os.tmpdir(), `nexura-seq-worker-${nanoid()}.cjs`);
    fs.writeFileSync(workerPath, `
const { workerData, parentPort } = require("node:worker_threads");
const Database = require(workerData.betterSqlitePath);
// A generous busy timeout: with eight threads on one file, a writer WILL
// find the lock held. Waiting is correct; failing would be the bug.
const db = new Database(workerData.dbPath, { timeout: 20000 });
db.pragma("journal_mode = WAL");

const read = db.prepare("SELECT id, next_number FROM document_sequences WHERE branch_id = ? AND document_type = 'trip'");
const bump = db.prepare("UPDATE document_sequences SET next_number = ? WHERE id = ?");
const insert = db.prepare("INSERT INTO invoices (id, branch_id, invoice_number, sequence_number, business_date, invoice_type, bill_to_name, issued_at, subtotal_kobo, tax_total_kobo, total_kobo, paid_kobo, balance_kobo, status) VALUES (?, ?, ?, ?, 0, 'proforma', 'Concurrency', 0, 0, 0, 0, 0, 0, 'issued')");

const allocate = db.transaction(() => {
  const row = read.get(workerData.branchId);
  bump.run(row.next_number + 1, row.id);
  insert.run(
    workerData.prefix + "-" + row.next_number,
    workerData.branchId,
    "ABU-TRP-2026-" + String(row.next_number).padStart(5, "0"),
    row.next_number,
  );
  return row.next_number;
});

const taken = [];
for (let i = 0; i < workerData.count; i++) taken.push(allocate.immediate());
db.close();
parentPort.postMessage(taken);
`, "utf8");

    const WORKERS = 8;
    const PER_WORKER = 25;
    const results = await Promise.all(
      Array.from({ length: WORKERS }, (_, w) => new Promise<number[]>((resolve, reject) => {
        const worker = new Worker(workerPath, {
          workerData: { dbPath: testDbPath, branchId, betterSqlitePath, count: PER_WORKER, prefix: `w${w}` },
        });
        worker.once("message", resolve);
        worker.once("error", reject);
      })),
    );
    fs.rmSync(workerPath, { force: true });

    const allocated = results.flat().sort((a, b) => a - b);
    assert.equal(allocated.length, WORKERS * PER_WORKER, "every allocation must have returned a number");
    assert.equal(new Set(allocated).size, allocated.length, "no two documents may share a number");
    assert.deepEqual(
      allocated, Array.from({ length: WORKERS * PER_WORKER }, (_, i) => i + 1),
      "the numbers must be exactly 1..200 -- no gaps",
    );

    const sequence = db.select().from(documentSequences).where(and(
      eq(documentSequences.branchId, branchId),
      eq(documentSequences.documentType, "trip"),
    )).get()!;
    assert.equal(sequence.nextNumber, WORKERS * PER_WORKER + 1, "the sequence ends exactly where the allocations did");
  }, 120_000);

  test("100 invoices issued through the real service are sequential, with no gaps or duplicates", async () => {
    // HONEST SCOPE. These 100 requests interleave rather than truly run at
    // once (better-sqlite3 is synchronous, Node is one thread) -- the test
    // above is what covers real contention. What THIS one proves is that the
    // actual service path allocates from the sequence and commits the number
    // with the document, which the worker test cannot show.
    const folios: string[] = [];
    for (let i = 0; i < 100; i++) folios.push((await makeFolio(1_000_000 + i)).reservationId);

    const responses = await Promise.all(folios.map(reservationId =>
      fetch(`${baseUrl}/invoices`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
        body: JSON.stringify({ reservationId }),
      }),
    ));
    assert.ok(responses.every(r => r.status === 201), "every issuance must succeed");

    const bodies = await Promise.all(responses.map(r => r.json() as Promise<{ sequenceNumber: number; invoiceNumber: string }>));
    const numbers = bodies.map(b => b.sequenceNumber).sort((a, b) => a - b);

    assert.equal(new Set(numbers).size, 100, "no duplicate numbers");
    for (let i = 1; i < numbers.length; i++) {
      assert.equal(numbers[i], numbers[i - 1] + 1, `gap between ${numbers[i - 1]} and ${numbers[i]}`);
    }
    assert.ok(bodies.every(b => /^ABU-INV-\d{4}-\d{5}$/.test(b.invoiceNumber)));
  }, 120_000);
});

describe("issuance", () => {
  test("an invoice snapshots the folio, splitting net from tax", async () => {
    const { db } = await import("../db/client.js");
    const { taxCodes } = await import("../db/schema.js");
    db.insert(taxCodes).values({
      id: nanoid(), branchId, code: "VAT", name: "VAT", jurisdiction: "federal", taxType: "vat",
      rateBp: 750, isInclusive: false, compoundsOnJson: "[]", appliesToJson: "[]",
      computationOrder: 100, effectiveFrom: new Date(0), isActive: true, createdAt: new Date(),
    }).run();

    const folio = await makeFolio();
    const res = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId, billToTin: "12345678-0001" }),
    });
    assert.equal(res.status, 201);
    const invoice = await res.json() as any;

    assert.equal(invoice.subtotalKobo, 5_000_000, "net of tax");
    assert.equal(invoice.taxTotalKobo, 375_000, "7.5% VAT as its own total");
    assert.equal(invoice.totalKobo, 5_375_000);
    assert.equal(invoice.balanceKobo, 5_375_000, "nothing paid yet");
    assert.equal(invoice.billToTin, "12345678-0001", "a corporate buyer needs the TIN to reclaim VAT");

    // The base line comes before the tax line that hangs off it, so a guest
    // can read the document top to bottom and check it.
    assert.equal(invoice.lines.length, 2);
    assert.equal(invoice.lines[0].chargeKind, "base");
    assert.equal(invoice.lines[1].chargeKind, "tax");
    assert.ok(invoice.lines[1].taxCodeId, "the tax line names the code that produced it");
  });

  test("an invoice does not change when the folio does -- that is what credit notes are for", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;
    const totalAtIssuance = invoice.totalKobo;

    // Void the charge on the folio AFTER the invoice was issued.
    const { voidFolioCharge } = await import("../services/ledger.js");
    const { transaction } = await import("../db/tx.js");
    transaction(() => voidFolioCharge(folio.chargeId, {
      reasonCode: "posting_error", actorUserId: finUserId, branchId,
    }));

    const refetched = await fetch(`${baseUrl}/invoices/${invoice.id}`, { headers: { Cookie: finCookie } });
    const after = await refetched.json() as any;
    assert.equal(
      after.totalKobo, totalAtIssuance,
      "a document already in the guest's hands must not silently change under them",
    );
    assert.equal(after.lines.length, invoice.lines.length);
  });

  test("the same charge cannot be billed on two invoices", async () => {
    const folio = await makeFolio();
    const first = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    assert.equal(first.status, 201);

    const second = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    assert.equal(second.status, 409);
    assert.equal((await second.json() as any).error, "NOTHING_TO_INVOICE");
  });
});

describe("void", () => {
  test("preserves the number and blocks further payment", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    const voided = await fetch(`${baseUrl}/invoices/${invoice.id}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reason: "Issued to the wrong guest" }),
    });
    assert.equal(voided.status, 200);
    const after = await voided.json() as any;

    assert.equal(after.status, "void");
    assert.equal(
      after.invoiceNumber, invoice.invoiceNumber,
      "the number stays with the void -- 'where is invoice 47?' must always have an answer",
    );
    assert.equal(after.voidReason, "Issued to the wrong guest");
    assert.equal(after.balanceKobo, 0);

    const payment = await fetch(`${baseUrl}/invoices/${invoice.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ amountKobo: 100_000, method: "cash" }),
    });
    assert.equal(payment.status, 409);
    assert.equal((await payment.json() as any).error, "INVOICE_VOID");

    // And the charge is billable again, on a new document.
    const reissued = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    assert.equal(reissued.status, 201, "voiding releases the charges for a corrected invoice");
    const replacement = await reissued.json() as any;
    assert.notEqual(replacement.invoiceNumber, invoice.invoiceNumber, "a voided number is never reused");
  });

  test("an invoice with payments cannot be voided -- it needs a credit note", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    await fetch(`${baseUrl}/invoices/${invoice.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ amountKobo: 500_000, method: "cash" }),
    });

    const voided = await fetch(`${baseUrl}/invoices/${invoice.id}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reason: "Changed my mind" }),
    });
    assert.equal(voided.status, 409);
    assert.equal((await voided.json() as any).error, "INVOICE_HAS_PAYMENTS");
  });
});

describe("payments and receipts", () => {
  test("a payment reaches the folio, not just the invoice, and issues one numbered receipt", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    const res = await fetch(`${baseUrl}/invoices/${invoice.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ amountKobo: 2_000_000, method: "transfer", reference: "TRF-991" }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as any;

    assert.match(body.receipt.receiptNumber, /^ABU-RCP-\d{4}-\d{5}$/);
    assert.equal(body.receipt.amountKobo, 2_000_000);
    assert.equal(body.invoice.status, "partially_paid");
    assert.equal(body.invoice.paidKobo, 2_000_000);
    assert.equal(body.invoice.balanceKobo, invoice.totalKobo - 2_000_000);

    // The folio is the ledger. A payment recorded only against the invoice
    // would leave the guest's balance overstated and the day understated.
    const { folioSummary } = await import("../services/folio.js");
    assert.equal(folioSummary(folio.reservationId).totalPaidKobo, 2_000_000);
  });

  test("paying the balance in full marks the invoice paid", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    const res = await fetch(`${baseUrl}/invoices/${invoice.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ amountKobo: invoice.totalKobo, method: "cash" }),
    });
    const body = await res.json() as any;
    assert.equal(body.invoice.status, "paid");
    assert.equal(body.invoice.balanceKobo, 0);
  });

  test("overpaying is refused", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    const res = await fetch(`${baseUrl}/invoices/${invoice.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ amountKobo: invoice.totalKobo + 1, method: "cash" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json() as any).error, "PAYMENT_EXCEEDS_BALANCE");
  });

  test("one payment can only ever have one receipt", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;
    const paid = await (await fetch(`${baseUrl}/invoices/${invoice.id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ amountKobo: 1_000_000, method: "cash" }),
    })).json() as any;

    const duplicate = await fetch(`${baseUrl}/receipts`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ paymentId: paid.paymentId }),
    });
    assert.equal(duplicate.status, 409, "two receipts for one payment is how a payment gets counted twice");
    assert.equal((await duplicate.json() as any).error, "RECEIPT_ALREADY_ISSUED");
  });
});

describe("credit notes", () => {
  test("reduce the invoice balance and reference the invoice by number", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    const res = await fetch(`${baseUrl}/invoices/${invoice.id}/credit-note`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reason: "Room was not cleaned", amountKobo: 1_500_000 }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as any;

    assert.match(body.creditNoteNumber, /^ABU-CRN-\d{4}-\d{5}$/);
    assert.equal(body.invoice.balanceKobo, invoice.totalKobo - 1_500_000);
    assert.equal(body.invoice.status, "partially_paid");
    assert.equal(body.invoice.creditNotes.length, 1);
    assert.equal(body.invoice.creditNotes[0].invoiceId, invoice.id);
    assert.equal(body.invoice.creditedKobo, 1_500_000);
    // The invoice's own total is untouched: the document still says what it
    // said, and the credit note is the record of the reduction.
    assert.equal(body.invoice.totalKobo, invoice.totalKobo);
  });

  test("crediting more than was invoiced is refused", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    await fetch(`${baseUrl}/invoices/${invoice.id}/credit-note`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reason: "Partial", amountKobo: invoice.totalKobo - 100 }),
    });
    const second = await fetch(`${baseUrl}/invoices/${invoice.id}/credit-note`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reason: "Too much", amountKobo: 1_000 }),
    });
    assert.equal(second.status, 400);
    const body = await second.json() as any;
    assert.equal(body.error, "CREDIT_EXCEEDS_INVOICE");
    assert.equal(body.creditableKobo, 100);
  });

  test("a full credit note settles the invoice", async () => {
    const folio = await makeFolio();
    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    const invoice = await created.json() as any;

    const res = await fetch(`${baseUrl}/invoices/${invoice.id}/credit-note`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ reason: "Billed in error" }),
    });
    const body = await res.json() as any;
    assert.equal(body.amountKobo, invoice.totalKobo, "omitting the amount credits the whole invoice");
    assert.equal(body.invoice.balanceKobo, 0);
    assert.equal(body.invoice.status, "credit_noted");
  });
});

describe("sequence settings", () => {
  test("the prefix cannot be changed once the series is in use", async () => {
    const res = await fetch(`${baseUrl}/settings/document-sequences`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ documentType: "invoice", prefix: "NEW-" }),
    });
    assert.equal(res.status, 409, "invoices have already been issued under the current prefix");
    const body = await res.json() as any;
    assert.equal(body.error, "SEQUENCE_IN_USE");
    assert.ok(body.issued > 0);
  });

  test("an unused series can still be renamed", async () => {
    const res = await fetch(`${baseUrl}/settings/document-sequences`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ documentType: "complaint", prefix: "GP-CMP-", padWidth: 6 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.prefix, "GP-CMP-");
    assert.equal(body.padWidth, 6);
  });

  test("next_number is not editable at all", async () => {
    // Moving it forward creates a permanent gap; moving it back guarantees a
    // duplicate. Neither is a setting anyone should have.
    const before = await (await fetch(`${baseUrl}/settings/document-sequences`, { headers: { Cookie: finCookie } })).json() as any[];
    const invoiceSeq = before.find(s => s.documentType === "invoice");

    await fetch(`${baseUrl}/settings/document-sequences`, {
      method: "PATCH", headers: { "Content-Type": "application/json", Cookie: finCookie },
      body: JSON.stringify({ documentType: "invoice", prefix: invoiceSeq.prefix, nextNumber: 9_999 }),
    });

    const after = await (await fetch(`${baseUrl}/settings/document-sequences`, { headers: { Cookie: finCookie } })).json() as any[];
    assert.equal(after.find(s => s.documentType === "invoice").nextNumber, invoiceSeq.nextNumber);
  });
});

describe("permissions", () => {
  test("front desk can issue an invoice but cannot void one", async () => {
    const fd = await loginAs("FD");
    const folio = await makeFolio();

    const created = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fd.cookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    assert.equal(created.status, 201, "the guest is at the desk at check-out");
    const invoice = await created.json() as any;

    const voided = await fetch(`${baseUrl}/invoices/${invoice.id}/void`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fd.cookie },
      body: JSON.stringify({ reason: "oops" }),
    });
    assert.equal(voided.status, 403, "unwinding an issued document is a finance control");

    const credited = await fetch(`${baseUrl}/invoices/${invoice.id}/credit-note`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: fd.cookie },
      body: JSON.stringify({ reason: "oops" }),
    });
    assert.equal(credited.status, 403);
  });

  test("housekeeping cannot issue documents at all", async () => {
    const hk = await loginAs("HK");
    const folio = await makeFolio();
    const res = await fetch(`${baseUrl}/invoices`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: hk.cookie },
      body: JSON.stringify({ reservationId: folio.reservationId }),
    });
    assert.equal(res.status, 403);
  });
});
