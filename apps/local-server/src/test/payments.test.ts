// Backend Blueprint B23 — payments, idempotency, webhooks and settlement.
//
// WHAT IS AND IS NOT PROVEN HERE, stated once:
//
//   PROVEN, with real logic and real database writes: that a retry never
//   double-charges, that a replayed webhook posts one payment, that an
//   unsigned webhook is refused, that an unreachable gateway does not block a
//   checkout, and that a payout missing a transaction is detected as variance.
//
//   NOT PROVEN: the Paystack adapter's HTTP calls. There are no gateway
//   credentials in this environment, so that file is written to the published
//   API and is unexercised. Everything above runs against FakePaymentProvider,
//   which implements the same interface — the seam exists precisely so the
//   money logic can be verified without a live card being charged in CI.
import { test, describe, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { nanoid } from "nanoid";
import os from "node:os";
import path from "node:path";

const testDbPath = path.join(os.tmpdir(), `nexura-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.NEXURA_DB_PATH = testDbPath;
process.env.NEXURA_KEYS_DIR = path.join(os.tmpdir(), `nexura-keys-${Date.now()}-${Math.random().toString(36).slice(2)}`);

let server: http.Server;
let baseUrl: string;
let orgId: string;
let branchId: string;
let userId: string;
let reservationId: string;

beforeAll(async () => {
  const { app } = await import("../app.js");
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});

beforeEach(async () => {
  const { db } = await import("../db/client.js");
  const {
    organizations, branches, users, guests, rooms, reservations,
    paymentGateways, paymentTransactions, paymentWebhookEvents, settlementBatches,
  } = await import("../db/schema.js");
  const { hashPassword } = await import("../auth/passwords.js");

  // A clean slate per test: idempotency and replay are both about "has this
  // been seen before", so leftovers from a previous test would make the
  // assertions meaningless.
  for (const table of [paymentWebhookEvents, settlementBatches, paymentTransactions, paymentGateways]) {
    db.delete(table).run();
  }

  orgId = nanoid(); branchId = nanoid(); userId = nanoid(); reservationId = nanoid();
  db.insert(organizations).values({ id: orgId, name: "Pay Org", createdAt: new Date() }).run();
  db.insert(branches).values({
    id: branchId, organizationId: orgId, name: "Pay Branch", createdAt: new Date(),
    currentBusinessDate: new Date(), businessDateRollHour: 3,
  }).run();
  db.insert(users).values({
    id: userId, organizationId: orgId, branchId, email: `pay-${userId}@example.com`.toLowerCase(),
    passwordHash: await hashPassword("x"), role: "FIN",
    firstName: "Pay", lastName: "Tester", status: "active", createdAt: new Date(),
  }).run();

  const roomId = nanoid();
  const guestId = nanoid();
  db.insert(rooms).values({ id: roomId, branchId, number: `P${Math.floor(Math.random() * 1e6)}`, type: "Standard" }).run();
  db.insert(guests).values({
    id: guestId, branchId, firstName: "Pay", lastName: "Guest",
    vip: false, blacklisted: false, createdAt: new Date(),
  }).run();
  db.insert(reservations).values({
    id: reservationId, branchId, guestId, roomId, status: "checked_in",
    checkInDate: new Date(), checkOutDate: new Date(Date.now() + 86_400_000),
    rateKobo: 5_000_000, createdBy: userId, createdAt: new Date(),
  }).run();
});

/** Configures the fake gateway with a chosen scenario. */
async function useGateway(scenario: "success" | "decline" | "unreachable" | "pending" = "success") {
  const { upsertGateway } = await import("../services/payments/index.js");
  return upsertGateway({
    branchId, provider: "fake", displayName: "Fake Gateway",
    config: { scenario, webhookSecret: "fake-webhook-secret" },
    supportsTerminal: true, supportsOnline: true, supportsRefund: true,
  });
}

async function initiate(overrides: Record<string, unknown> = {}) {
  const { initiatePayment } = await import("../services/payments/index.js");
  return initiatePayment({
    branchId,
    reservationId,
    amountKobo: 8_500_000,
    channel: "card",
    idempotencyKey: `key-${nanoid()}`,
    actorUserId: userId,
    ...overrides,
  } as never);
}

describe("idempotency — the property that matters most", () => {
  test("a duplicate initiation with the SAME key produces ONE transaction", async () => {
    // The real scenario: the clerk sees a spinner, the guest's phone shows a
    // debit alert, and the clerk presses the button again because from where
    // they are standing nothing happened.
    await useGateway("success");
    const key = `retry-${nanoid()}`;

    const first = await initiate({ idempotencyKey: key });
    const second = await initiate({ idempotencyKey: key });

    assert.equal(first.idempotentReplay, false);
    assert.equal(second.idempotentReplay, true, "the retry is recognised, not charged again");
    assert.equal(second.transactionId, first.transactionId);

    const { db } = await import("../db/client.js");
    const { paymentTransactions } = await import("../db/schema.js");
    const rows = db.select().from(paymentTransactions).all();
    assert.equal(rows.length, 1, "exactly one transaction exists — the guest was charged once");
  });

  test("different keys produce different transactions", async () => {
    // The converse matters too: a guest paying twice on purpose (a deposit,
    // then the balance) must not be silently deduplicated.
    await useGateway("success");
    const a = await initiate();
    const b = await initiate();
    assert.notEqual(a.transactionId, b.transactionId);
  });

  test("a missing idempotency key is REFUSED, not generated", async () => {
    // Generating one here would make every call unique and silently remove
    // the protection the caller believes it has.
    await useGateway("success");
    await assert.rejects(
      () => initiate({ idempotencyKey: "" }),
      (err: any) => err.code === "IDEMPOTENCY_KEY_REQUIRED",
    );
  });

  test("the retry returns the ORIGINAL outcome, including a failure", async () => {
    // A retried declined payment must still read as declined. Returning a
    // fresh "initiated" would have the clerk waiting for a result that
    // already exists.
    await useGateway("decline");
    const key = `declined-${nanoid()}`;
    const first = await initiate({ idempotencyKey: key });
    const retry = await initiate({ idempotencyKey: key });

    assert.equal(first.status, "failed");
    assert.equal(retry.status, "failed");
    assert.equal(retry.idempotentReplay, true);
  });
});

describe("offline — a checkout is never blocked", () => {
  test("cash still works when the gateway is unreachable", async () => {
    // An unreachable gateway is NOT a declined card. Conflating them would
    // have a clerk tell a guest their card was refused when it was never
    // presented.
    await useGateway("unreachable");
    const result = await initiate({ channel: "cash" });

    assert.equal(result.offline, true);
    assert.equal(result.status, "pending_verification");
    assert.ok(!result.failureReason, "cash is not a failure — the money is in the drawer");
    assert.match(result.instruction ?? "", /verified automatically/);
  });

  test("a POS terminal also works offline — it settles independently", async () => {
    await useGateway("unreachable");
    const result = await initiate({ channel: "pos_terminal", terminalId: "TERM-01" });
    assert.equal(result.status, "pending_verification");
    assert.equal(result.offline, true);
  });

  test("card is refused offline, and says what to do instead", async () => {
    // Card genuinely needs the gateway. The honest answer is to route the
    // clerk to a channel that works, not to pretend.
    await useGateway("unreachable");
    const result = await initiate({ channel: "card" });

    assert.equal(result.status, "failed");
    assert.equal(result.offline, true);
    assert.match(result.failureReason ?? "", /Take cash, or use a standalone POS terminal/);
  });

  test("offline payments appear on the reconnect worklist", async () => {
    await useGateway("unreachable");
    await initiate({ channel: "cash" });

    const { pendingVerification } = await import("../services/payments/index.js");
    const pending = pendingVerification(branchId);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].takenOffline, true);
  });

  test("verification failing does NOT mark a real payment as failed", async () => {
    // Marking a transaction failed because we could not ASK about it would
    // delete a payment that actually happened.
    await useGateway("unreachable");
    const taken = await initiate({ channel: "cash" });

    const { verifyPayment } = await import("../services/payments/index.js");
    const outcome = await verifyPayment(taken.transactionId, userId);

    assert.equal(outcome.changed, false);
    assert.equal(outcome.status, "pending_verification", "left alone for a later sweep");
  });
});

describe("verification and the folio", () => {
  test("a successful verification posts to the folio exactly once", async () => {
    await useGateway("success");
    const taken = await initiate();

    const { verifyPayment } = await import("../services/payments/index.js");
    const first = await verifyPayment(taken.transactionId, userId);
    assert.equal(first.status, "successful");
    assert.ok(first.paymentId);

    const { folioSummary } = await import("../services/folio.js");
    assert.equal(folioSummary(reservationId).totalPaidKobo, 8_500_000);

    // Verifying again must not post a second ledger row.
    const second = await verifyPayment(taken.transactionId, userId);
    assert.equal(second.changed, false);
    assert.equal(second.paymentId, first.paymentId);
    assert.equal(folioSummary(reservationId).totalPaidKobo, 8_500_000, "still charged once");
  });
});

describe("webhooks", () => {
  /** Signs a body the way the fake gateway signs its webhooks. */
  function signedBody(payload: object, secret = "fake-webhook-secret") {
    const body = JSON.stringify(payload);
    return { body, signature: crypto.createHmac("sha512", secret).update(body).digest("hex") };
  }

  test("an UNSIGNED webhook is rejected", async () => {
    // An unsigned webhook is an unauthenticated instruction to mark money as
    // received — the most valuable forgery available against a hotel.
    await useGateway("success");
    const { handleWebhook } = await import("../services/payments/index.js");

    const outcome = handleWebhook("fake", JSON.stringify({ id: "evt_1" }), {});
    assert.equal(outcome.outcome, "rejected");
    assert.match(outcome.detail, /signature/i);
  });

  test("a webhook signed with the WRONG secret is rejected", async () => {
    await useGateway("success");
    const { handleWebhook } = await import("../services/payments/index.js");
    const { body, signature } = signedBody({ id: "evt_2", data: { reference: "x" } }, "not-the-secret");

    const outcome = handleWebhook("fake", body, { "x-fake-signature": signature });
    assert.equal(outcome.outcome, "rejected");
  });

  test("a REPLAYED webhook posts exactly one payment", async () => {
    // A gateway retries until it gets a 200 and will deliver the same event
    // many times. The second delivery must be a no-op, not a second payment.
    await useGateway("success");
    const taken = await initiate();

    const { db } = await import("../db/client.js");
    const { paymentTransactions } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const reference = db.select().from(paymentTransactions)
      .where(eq(paymentTransactions.id, taken.transactionId)).get()!.gatewayReference!;

    const { handleWebhook } = await import("../services/payments/index.js");
    const { body, signature } = signedBody({
      id: "evt_replay_1", event: "charge.success",
      data: { reference, status: "success", amount: 8_500_000, fees: 127_500 },
    });

    const first = handleWebhook("fake", body, { "x-fake-signature": signature });
    const second = handleWebhook("fake", body, { "x-fake-signature": signature });
    const third = handleWebhook("fake", body, { "x-fake-signature": signature });

    assert.equal(first.outcome, "applied");
    assert.equal(second.outcome, "duplicate");
    assert.equal(third.outcome, "duplicate");

    const { folioSummary } = await import("../services/folio.js");
    assert.equal(folioSummary(reservationId).totalPaidKobo, 8_500_000, "one payment, three deliveries");
  });

  test("a webhook for an unknown transaction is ignored, not rejected", async () => {
    // A gateway account shared across properties delivers events this branch
    // has never heard of. Answering non-2xx would make the gateway retry them
    // forever.
    await useGateway("success");
    const { handleWebhook } = await import("../services/payments/index.js");
    const { body, signature } = signedBody({
      id: "evt_unknown", event: "charge.success",
      data: { reference: "SOMEONE-ELSES-REF", status: "success", amount: 100 },
    });

    const outcome = handleWebhook("fake", body, { "x-fake-signature": signature });
    assert.equal(outcome.outcome, "ignored");
  });
});

describe("settlement reconciliation", () => {
  async function successfulTransaction(amountKobo: number) {
    const { verifyPayment } = await import("../services/payments/index.js");
    const taken = await initiate({ amountKobo, idempotencyKey: `settle-${nanoid()}` });
    await verifyPayment(taken.transactionId, userId);

    const { db } = await import("../db/client.js");
    const { paymentTransactions } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    return db.select().from(paymentTransactions).where(eq(paymentTransactions.id, taken.transactionId)).get()!;
  }

  test("a clean payout reconciles with zero variance", async () => {
    await useGateway("success");
    const a = await successfulTransaction(5_000_000);
    const b = await successfulTransaction(3_000_000);

    const { recordSettlement } = await import("../services/payments/settlement.js");
    const result = recordSettlement({
      branchId, batchReference: `BATCH-${nanoid(6)}`, settlementDate: new Date(),
      grossKobo: 8_000_000, feeKobo: 120_000, netKobo: 7_880_000,
      transactionReferences: [a.gatewayReference!, b.gatewayReference!],
    });

    assert.equal(result.matchedCount, 2);
    assert.equal(result.varianceKobo, 0);
    assert.equal(result.reconciled, true);
    assert.deepEqual(result.missingFromPayout, []);
  });

  test("a transaction MISSING from the payout is detected", async () => {
    // The failure this exists for: the gateway charged the card on Monday and
    // the Wednesday payout does not mention it. Without this, a missing
    // ₦30,000 looks exactly like a fee.
    await useGateway("success");
    const paid = await successfulTransaction(5_000_000);
    const dropped = await successfulTransaction(3_000_000);

    const { recordSettlement } = await import("../services/payments/settlement.js");
    const result = recordSettlement({
      branchId, batchReference: `BATCH-${nanoid(6)}`, settlementDate: new Date(),
      grossKobo: 5_000_000, feeKobo: 75_000, netKobo: 4_925_000,
      transactionReferences: [paid.gatewayReference!],   // `dropped` is absent
    });

    assert.equal(result.reconciled, false, "a payout missing a transaction is not clean");
    assert.equal(result.missingFromPayout.length, 1);
    assert.equal(result.missingFromPayout[0].id, dropped.id);
    assert.match(result.batchReference, /BATCH-/);

    // And the dropped transaction stays UNSETTLED, so it appears in the next
    // reconciliation rather than quietly ageing out.
    const { db } = await import("../db/client.js");
    const { paymentTransactions } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const reread = db.select().from(paymentTransactions).where(eq(paymentTransactions.id, dropped.id)).get()!;
    assert.equal(reread.settlementStatus, "unsettled");
  });

  test("a payout claiming a transaction we never recorded is flagged", async () => {
    await useGateway("success");
    const known = await successfulTransaction(5_000_000);

    const { recordSettlement } = await import("../services/payments/settlement.js");
    const result = recordSettlement({
      branchId, batchReference: `BATCH-${nanoid(6)}`, settlementDate: new Date(),
      grossKobo: 5_000_000, feeKobo: 75_000, netKobo: 4_925_000,
      transactionReferences: [known.gatewayReference!, "GHOST-REFERENCE"],
    });

    assert.deepEqual(result.unknownReferences, ["GHOST-REFERENCE"]);
    assert.equal(result.reconciled, false);
  });

  test("an amount mismatch surfaces as variance rather than being absorbed", async () => {
    // It would be easy to make the numbers agree by adjusting the recorded
    // side. That turns a detectable loss into a silent one.
    await useGateway("success");
    const a = await successfulTransaction(5_000_000);

    const { recordSettlement } = await import("../services/payments/settlement.js");
    const result = recordSettlement({
      branchId, batchReference: `BATCH-${nanoid(6)}`, settlementDate: new Date(),
      grossKobo: 4_500_000,   // ₦5,000 short
      feeKobo: 75_000, netKobo: 4_425_000,
      transactionReferences: [a.gatewayReference!],
    });

    assert.equal(result.varianceKobo, -500_000);
    assert.equal(result.reconciled, false);
    assert.match(result.batchReference, /BATCH-/);
  });

  test("signing off acknowledges a variance, it does not erase it", async () => {
    await useGateway("success");
    const a = await successfulTransaction(5_000_000);

    const { recordSettlement, markReconciled } = await import("../services/payments/settlement.js");
    const batch = recordSettlement({
      branchId, batchReference: `BATCH-${nanoid(6)}`, settlementDate: new Date(),
      grossKobo: 4_500_000, feeKobo: 0, netKobo: 4_500_000,
      transactionReferences: [a.gatewayReference!],
    });

    const signed = markReconciled(batch.batchId, branchId, userId, "Chargeback confirmed with the bank");
    assert.ok(signed.reconciledAt);
    assert.equal(signed.varianceKobo, -500_000, "the variance stays on the record");
    assert.match(signed.varianceNotes ?? "", /Chargeback confirmed/);
  });

  test("recording the same payout twice is refused", async () => {
    await useGateway("success");
    const { recordSettlement } = await import("../services/payments/settlement.js");
    const reference = `BATCH-${nanoid(6)}`;
    recordSettlement({
      branchId, batchReference: reference, settlementDate: new Date(),
      grossKobo: 0, feeKobo: 0, netKobo: 0, transactionReferences: [],
    });
    assert.throws(
      () => recordSettlement({
        branchId, batchReference: reference, settlementDate: new Date(),
        grossKobo: 0, feeKobo: 0, netKobo: 0, transactionReferences: [],
      }),
      (err: any) => err.code === "BATCH_ALREADY_RECORDED",
    );
  });
});

describe("provider capabilities", () => {
  test("the manual provider declares honestly that it has no gateway", async () => {
    // A property with no gateway account is most of the target market on day
    // one. Declaring `supportsOnline: false` is what stops the UI offering a
    // card button that cannot work.
    const { ManualPaymentProvider } = await import("../services/payments/fake.js");
    const manual = new ManualPaymentProvider();

    assert.equal(manual.capabilities.supportsOnline, false);
    assert.equal(manual.capabilities.supportsWebhook, false);
    assert.ok(manual.capabilities.channels.includes("cash"));
    assert.ok(!manual.capabilities.channels.includes("card"));

    const webhook = manual.parseWebhook();
    assert.equal(webhook.ok, false);
    assert.match(webhook.rejectionReason ?? "", /no webhooks/);
  });

  test("a channel the provider cannot take is refused up front", async () => {
    await useGateway("success");
    const { upsertGateway } = await import("../services/payments/index.js");
    upsertGateway({ branchId, provider: "manual", displayName: "Cash Only" });

    await assert.rejects(
      () => initiate({ provider: "manual", channel: "card" }),
      (err: any) => err.code === "CHANNEL_NOT_SUPPORTED",
    );
  });
});
