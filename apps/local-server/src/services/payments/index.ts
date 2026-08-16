// Backend Blueprint B23 — taking a payment.
//
// THE ONE PROPERTY THAT MATTERS MOST: a retry never double-charges.
//
// A card payment that times out is the NORMAL case on a Nigerian hotel's
// uplink, not an edge case. The clerk sees a spinner, the guest's phone shows
// a debit alert, and the clerk presses the button again because from where
// they are standing nothing happened. Without an idempotency key that second
// press takes a second ₦85,000 off a real person's card, and the property
// finds out when they complain — by which time the money is with the bank and
// the fix is a manual refund.
//
// So `idempotencyKey` is UNIQUE per branch at the database level, and a repeat
// initiation returns the ORIGINAL transaction. The uniqueness constraint is
// the guarantee; the lookup below is the friendlier error a moment earlier.
//
// SECOND PROPERTY: a checkout is never blocked on gateway reachability. Card
// and transfer need the gateway; cash and a standalone POS terminal do not. An
// unreachable gateway routes to those rather than failing the payment, and the
// transaction records as `pending_verification` for later reconciliation. A
// guest must always be able to leave.
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  paymentGateways, paymentTransactions, paymentWebhookEvents,
  payments, reservations, branches,
} from "../../db/schema.js";
import { currentBusinessDate } from "../../lib/businessDate.js";
import { HandlerError } from "../../lib/handlerError.js";
import { logger } from "../../lib/logger.js";
import { decryptSecret, encryptSecret } from "../../lib/secrets.js";
import type { Kobo } from "../../lib/money.js";
import {
  GatewayUnreachableError, type PaymentChannel, type PaymentProvider, type TransactionStatus,
} from "./provider.js";
import { FakePaymentProvider, ManualPaymentProvider } from "./fake.js";
import { PaystackProvider } from "./paystack.js";

/** Channels that still work with no uplink at all. */
export const OFFLINE_CAPABLE_CHANNELS: PaymentChannel[] = ["cash", "pos_terminal"];

export function providerFor(gateway: typeof paymentGateways.$inferSelect): PaymentProvider {
  const config = gateway.configEncrypted
    ? JSON.parse(decryptSecret(gateway.configEncrypted) ?? "{}") as Record<string, string>
    : {};

  switch (gateway.provider) {
    case "paystack":
      return new PaystackProvider({
        secretKey: config.secretKey ?? "",
        publicKey: config.publicKey,
        webhookSecret: config.webhookSecret,
      });
    case "fake":
      return new FakePaymentProvider((config.scenario as never) ?? "success", config.webhookSecret);
    case "manual":
    default:
      return new ManualPaymentProvider();
  }
}

export function activeGateway(branchId: string, provider?: string) {
  const rows = db.select().from(paymentGateways).where(and(
    eq(paymentGateways.branchId, branchId),
    eq(paymentGateways.isActive, true),
  )).all();
  if (provider) return rows.find(g => g.provider === provider) ?? null;
  // Prefer a real gateway over the manual fallback, so a property that has
  // one does not silently record everything as cash.
  return rows.find(g => g.provider !== "manual") ?? rows[0] ?? null;
}

export function upsertGateway(input: {
  branchId: string;
  provider: string;
  displayName: string;
  config?: Record<string, string>;
  supportsTerminal?: boolean;
  supportsOnline?: boolean;
  supportsRefund?: boolean;
}) {
  const existing = db.select().from(paymentGateways).where(and(
    eq(paymentGateways.branchId, input.branchId),
    eq(paymentGateways.provider, input.provider),
  )).get();

  // The config holds API secret keys that can move real money out of the
  // property's account, so it is encrypted at rest like the door-lock
  // credentials rather than sitting in a readable column.
  const configEncrypted = input.config ? encryptSecret(JSON.stringify(input.config)) : existing?.configEncrypted ?? null;

  if (existing) {
    db.update(paymentGateways).set({
      displayName: input.displayName,
      configEncrypted,
      supportsTerminal: input.supportsTerminal ?? existing.supportsTerminal,
      supportsOnline: input.supportsOnline ?? existing.supportsOnline,
      supportsRefund: input.supportsRefund ?? existing.supportsRefund,
      updatedAt: new Date(),
    }).where(eq(paymentGateways.id, existing.id)).run();
    return existing.id;
  }

  const id = nanoid();
  db.insert(paymentGateways).values({
    id, branchId: input.branchId, provider: input.provider,
    displayName: input.displayName, configEncrypted,
    isActive: true,
    supportsTerminal: input.supportsTerminal ?? false,
    supportsOnline: input.supportsOnline ?? true,
    supportsRefund: input.supportsRefund ?? false,
    createdAt: new Date(),
  }).run();
  return id;
}

export interface InitiatePaymentInput {
  branchId: string;
  reservationId?: string | null;
  amountKobo: Kobo;
  channel: PaymentChannel;
  /** Supplied by the caller. THE anti-double-charge key. */
  idempotencyKey: string;
  provider?: string;
  customerEmail?: string;
  terminalId?: string;
  actorUserId: string;
}

export interface InitiatePaymentResult {
  transactionId: string;
  status: TransactionStatus;
  gatewayReference: string | null;
  checkoutUrl?: string;
  instruction?: string;
  /** True when this call returned an EXISTING transaction rather than a new one. */
  idempotentReplay: boolean;
  /** True when the gateway could not be reached and an offline path was used. */
  offline: boolean;
  failureReason?: string;
}

/**
 * Starts a payment. CALLER MUST WRAP IN immediateTransaction.
 *
 * Returns the existing transaction unchanged when the idempotency key has
 * been seen before — the retry case, and the reason this function exists in
 * this shape.
 */
export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) {
    throw new HandlerError(400, "INVALID_AMOUNT");
  }
  if (!input.idempotencyKey?.trim()) {
    // Refused rather than generated. Generating one here would make every
    // call unique and silently remove the protection the caller thinks it
    // has -- the key has to come from whatever the clerk pressed.
    throw new HandlerError(400, "IDEMPOTENCY_KEY_REQUIRED", {
      message: "Every payment initiation must carry an idempotency key, so a retry cannot double-charge.",
    });
  }

  // ── The retry case, checked first ──────────────────────────────────────
  const existing = db.select().from(paymentTransactions).where(and(
    eq(paymentTransactions.branchId, input.branchId),
    eq(paymentTransactions.idempotencyKey, input.idempotencyKey),
  )).get();
  if (existing) {
    logger.info({ transactionId: existing.id, key: input.idempotencyKey },
      "[payments] Idempotent replay — returning the original transaction, no second charge");
    return {
      transactionId: existing.id,
      status: existing.status as TransactionStatus,
      gatewayReference: existing.gatewayReference,
      idempotentReplay: true,
      offline: existing.takenOffline,
      failureReason: existing.failureReason ?? undefined,
    };
  }

  const gateway = activeGateway(input.branchId, input.provider);
  if (!gateway) throw new HandlerError(409, "NO_PAYMENT_GATEWAY", {
    message: "No payment gateway is configured for this branch. Configure one, or record the payment as cash.",
  });

  const provider = providerFor(gateway);
  if (!provider.capabilities.channels.includes(input.channel)) {
    throw new HandlerError(400, "CHANNEL_NOT_SUPPORTED", {
      provider: gateway.provider,
      supported: provider.capabilities.channels,
    });
  }

  const transactionId = nanoid();
  const reference = `NX-${transactionId}`;

  // The row is written BEFORE the gateway is called, so a call that times out
  // still leaves a record. A transaction that exists only in the gateway's
  // system is money the property cannot see.
  db.insert(paymentTransactions).values({
    id: transactionId,
    branchId: input.branchId,
    reservationId: input.reservationId ?? null,
    gatewayId: gateway.id,
    idempotencyKey: input.idempotencyKey,
    initiatedBy: input.actorUserId,
    amountKobo: input.amountKobo,
    currency: "NGN",
    channel: input.channel,
    status: "initiated",
    initiatedAt: new Date(),
    terminalId: input.terminalId ?? null,
  }).run();

  try {
    const result = await provider.initiate({
      idempotencyKey: input.idempotencyKey,
      amountKobo: input.amountKobo,
      currency: "NGN",
      channel: input.channel,
      reference,
      customerEmail: input.customerEmail,
      terminalId: input.terminalId,
      metadata: { reservationId: input.reservationId },
    });

    db.update(paymentTransactions).set({
      gatewayReference: result.gatewayReference ?? reference,
      status: result.status,
      failureReason: result.failureReason ?? null,
      rawResponseJson: result.raw ? JSON.stringify(result.raw).slice(0, 8_000) : null,
      ...(result.status === "successful" ? { completedAt: new Date() } : {}),
    }).where(eq(paymentTransactions.id, transactionId)).run();

    return {
      transactionId,
      status: result.status,
      gatewayReference: result.gatewayReference ?? reference,
      checkoutUrl: result.checkoutUrl,
      instruction: result.instruction,
      idempotentReplay: false,
      offline: false,
      failureReason: result.failureReason,
    };
  } catch (err) {
    if (!(err instanceof GatewayUnreachableError)) throw err;

    // ── OFFLINE. Never block the checkout. ────────────────────────────────
    //
    // An unreachable gateway is NOT a declined card, and conflating the two
    // would have a clerk tell a guest their card was refused when it was
    // never presented. If the channel can work without an uplink, the
    // payment stands and is flagged for verification; if it cannot, the
    // caller is told to offer one that can.
    const offlineCapable = OFFLINE_CAPABLE_CHANNELS.includes(input.channel);
    db.update(paymentTransactions).set({
      status: offlineCapable ? "pending_verification" : "failed",
      takenOffline: true,
      gatewayReference: reference,
      failureReason: offlineCapable ? null : "Gateway unreachable — take cash or use a standalone terminal",
    }).where(eq(paymentTransactions.id, transactionId)).run();

    logger.warn({ transactionId, channel: input.channel, offlineCapable },
      "[payments] Gateway unreachable — " + (offlineCapable ? "recorded pending verification" : "channel needs the gateway"));

    return {
      transactionId,
      status: offlineCapable ? "pending_verification" : "failed",
      gatewayReference: reference,
      idempotentReplay: false,
      offline: true,
      instruction: offlineCapable
        ? "Recorded offline. It will be verified automatically when the connection returns."
        : undefined,
      failureReason: offlineCapable
        ? undefined
        : "The payment gateway is unreachable. Take cash, or use a standalone POS terminal.",
    };
  }
}

/**
 * Writes the folio payment for a successful transaction.
 *
 * IDEMPOTENT on `payment_id`: a transaction that already produced a ledger row
 * never produces a second one, whatever calls this — verification, a webhook,
 * or a reconnect sweep all converge here and only the first writes.
 */
export function postPaymentToFolio(transactionId: string, actorUserId: string | null): string | null {
  const transaction = db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.id, transactionId)).get();
  if (!transaction) return null;
  if (transaction.paymentId) return transaction.paymentId;   // already posted
  if (transaction.status !== "successful") return null;
  if (!transaction.reservationId) return null;

  // A webhook passes null: it arrives from the gateway with no session. The
  // folio row is attributed to the clerk who INITIATED the transaction, which
  // is both true and the name a cash reconciliation needs. (Falling back to
  // the branch id here was a real bug -- a branch id in a user column, caught
  // by a foreign-key violation in the replayed-webhook test.)
  const receivedBy = actorUserId ?? transaction.initiatedBy;
  if (!receivedBy) return null;

  const paymentId = nanoid();
  db.insert(payments).values({
    id: paymentId,
    reservationId: transaction.reservationId,
    amountKobo: transaction.amountKobo,
    method: transaction.channel === "cash" ? "cash"
      : transaction.channel === "transfer" ? "transfer" : "card",
    receivedBy,
    receivedAt: new Date(),
    businessDate: currentBusinessDate(transaction.branchId),
  }).run();

  db.update(paymentTransactions).set({ paymentId })
    .where(eq(paymentTransactions.id, transactionId)).run();
  return paymentId;
}

export interface VerifyOutcome {
  transactionId: string;
  status: TransactionStatus;
  paymentId: string | null;
  changed: boolean;
  detail: string;
}

/** Polls the gateway and, on success, posts to the folio exactly once. */
export async function verifyPayment(transactionId: string, actorUserId: string | null): Promise<VerifyOutcome> {
  const transaction = db.select().from(paymentTransactions)
    .where(eq(paymentTransactions.id, transactionId)).get();
  if (!transaction) throw new HandlerError(404, "TRANSACTION_NOT_FOUND");

  if (transaction.status === "successful" && transaction.paymentId) {
    return {
      transactionId, status: "successful", paymentId: transaction.paymentId,
      changed: false, detail: "Already verified and posted",
    };
  }

  const gateway = transaction.gatewayId
    ? db.select().from(paymentGateways).where(eq(paymentGateways.id, transaction.gatewayId)).get()
    : null;
  if (!gateway) throw new HandlerError(409, "GATEWAY_NOT_FOUND");

  try {
    const result = await providerFor(gateway).verify(transaction.gatewayReference ?? "");
    db.update(paymentTransactions).set({
      status: result.status,
      feeKobo: result.feeKobo ?? transaction.feeKobo,
      rrn: result.rrn ?? transaction.rrn,
      authCode: result.authCode ?? transaction.authCode,
      maskedPan: result.maskedPan ?? transaction.maskedPan,
      cardType: result.cardType ?? transaction.cardType,
      failureReason: result.failureReason ?? null,
      // Verified means it is no longer an unconfirmed offline record.
      takenOffline: result.status === "successful" ? false : transaction.takenOffline,
      ...(result.status === "successful" ? { completedAt: new Date() } : {}),
    }).where(eq(paymentTransactions.id, transactionId)).run();

    const paymentId = result.status === "successful"
      ? postPaymentToFolio(transactionId, actorUserId)
      : null;

    return {
      transactionId, status: result.status, paymentId,
      changed: true,
      detail: result.status === "successful"
        ? `Confirmed by the gateway${paymentId ? " and posted to the folio" : ""}`
        : result.failureReason ?? `Gateway reports ${result.status}`,
    };
  } catch (err) {
    if (err instanceof GatewayUnreachableError) {
      // Verification failing does NOT change the transaction. An offline
      // payment stays pending_verification and is retried later; marking it
      // failed because we could not ask would delete a real payment.
      return {
        transactionId, status: transaction.status as TransactionStatus,
        paymentId: transaction.paymentId, changed: false,
        detail: "Gateway unreachable — leaving the transaction unchanged for a later sweep",
      };
    }
    throw err;
  }
}

export interface WebhookOutcome {
  outcome: "applied" | "duplicate" | "ignored" | "rejected";
  detail: string;
  transactionId?: string;
  paymentId?: string | null;
}

/**
 * Handles a gateway webhook: signature-verified and replay-safe.
 *
 * A gateway retries until it gets a 200 and will happily deliver the same
 * event a dozen times. Recording the event id is what makes the second
 * delivery a no-op rather than a second folio payment.
 */
export function handleWebhook(
  providerName: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
): WebhookOutcome {
  // A webhook carries no session and no branch id, so the branch is inferred
  // from the gateway configured for this provider. This server serves exactly
  // one branch (the Auth doc's one-server-per-branch model), so there is at
  // most one such gateway -- resolving via the GATEWAY rather than picking
  // the first branch row also keeps this correct if a database somehow holds
  // more than one.
  const gateway = db.select().from(paymentGateways).where(and(
    eq(paymentGateways.provider, providerName),
    eq(paymentGateways.isActive, true),
  )).get() ?? null;
  if (!gateway) {
    return { outcome: "rejected", detail: `No active "${providerName}" gateway is configured` };
  }
  const branch = { id: gateway.branchId };

  const parsed = providerFor(gateway).parseWebhook(rawBody, headers);
  if (!parsed.ok) {
    // An unsigned or badly-signed webhook is an UNAUTHENTICATED INSTRUCTION
    // TO MARK MONEY AS RECEIVED — the most valuable forgery available against
    // a hotel. Recorded so a pattern of them is visible, then refused.
    db.insert(paymentWebhookEvents).values({
      id: nanoid(), branchId: branch?.id ?? null, provider: providerName,
      eventId: `rejected-${nanoid()}`, eventType: parsed.eventType || "unknown",
      receivedAt: new Date(), processedAt: new Date(),
      outcome: "rejected", detail: parsed.rejectionReason ?? "Signature verification failed",
    }).run();
    logger.warn({ provider: providerName, reason: parsed.rejectionReason }, "[payments] Rejected an unverified webhook");
    return { outcome: "rejected", detail: parsed.rejectionReason ?? "Signature verification failed" };
  }

  // Replay check, by the gateway's own event id.
  const seen = db.select().from(paymentWebhookEvents).where(and(
    eq(paymentWebhookEvents.provider, providerName),
    eq(paymentWebhookEvents.eventId, parsed.eventId),
  )).get();
  if (seen) {
    return { outcome: "duplicate", detail: `Event ${parsed.eventId} was already processed` };
  }

  const transaction = parsed.gatewayReference
    ? db.select().from(paymentTransactions)
        .where(eq(paymentTransactions.gatewayReference, parsed.gatewayReference)).get()
    : null;

  const eventRowId = nanoid();
  if (!transaction) {
    db.insert(paymentWebhookEvents).values({
      id: eventRowId, branchId: branch?.id ?? null, provider: providerName,
      eventId: parsed.eventId, eventType: parsed.eventType,
      gatewayReference: parsed.gatewayReference ?? null,
      receivedAt: new Date(), processedAt: new Date(),
      outcome: "ignored", detail: "No matching transaction on this property",
    }).run();
    return { outcome: "ignored", detail: "No matching transaction" };
  }

  db.update(paymentTransactions).set({
    status: parsed.status ?? transaction.status,
    feeKobo: parsed.feeKobo ?? transaction.feeKobo,
    takenOffline: parsed.status === "successful" ? false : transaction.takenOffline,
    ...(parsed.status === "successful" ? { completedAt: new Date() } : {}),
  }).where(eq(paymentTransactions.id, transaction.id)).run();

  const paymentId = parsed.status === "successful"
    ? postPaymentToFolio(transaction.id, null)
    : null;

  db.insert(paymentWebhookEvents).values({
    id: eventRowId, branchId: branch?.id ?? null, provider: providerName,
    eventId: parsed.eventId, eventType: parsed.eventType,
    gatewayReference: parsed.gatewayReference ?? null,
    receivedAt: new Date(), processedAt: new Date(),
    outcome: "applied",
    detail: `${parsed.eventType} → ${parsed.status}${paymentId ? ` (posted ${paymentId})` : ""}`,
  }).run();

  return { outcome: "applied", detail: `${parsed.eventType} applied`, transactionId: transaction.id, paymentId };
}

/** Transactions taken offline that still need confirming. */
export function pendingVerification(branchId: string) {
  return db.select().from(paymentTransactions).where(and(
    eq(paymentTransactions.branchId, branchId),
    eq(paymentTransactions.status, "pending_verification"),
  )).all();
}

export function listTransactions(branchId: string, filters: { status?: string; from?: Date; to?: Date } = {}) {
  let rows = db.select().from(paymentTransactions).where(eq(paymentTransactions.branchId, branchId)).all();
  if (filters.status) rows = rows.filter(t => t.status === filters.status);
  if (filters.from) rows = rows.filter(t => t.initiatedAt >= filters.from!);
  if (filters.to) rows = rows.filter(t => t.initiatedAt <= filters.to!);
  return rows.sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());
}
