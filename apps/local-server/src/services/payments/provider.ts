// Backend Blueprint B23 — the payment provider interface.
//
// Mirrors the lock-provider pattern deliberately: one interface, one adapter
// per gateway, one FAKE, and one conformance suite every adapter must pass.
// The value is not abstraction for its own sake — it is that the business
// logic (idempotency, offline handling, reconciliation) is written once and
// tested against the fake, so switching a property from Paystack to
// Moniepoint does not re-open any of it.
//
// CAPABILITIES ARE DECLARED, NOT ASSUMED. Nigerian gateways differ in ways
// that matter: some do POS terminals, some only online checkout, some support
// programmatic refunds and some require a phone call. Code that assumes a
// capability every provider happens to have today breaks on the one that does
// not, usually in front of a guest.
import type { Kobo } from "../../lib/money.js";

export type PaymentChannel = "card" | "transfer" | "ussd" | "pos_terminal" | "cash";

export type TransactionStatus =
  | "initiated"
  | "pending"
  /** Taken while the gateway was unreachable; must be confirmed later. */
  | "pending_verification"
  | "successful"
  | "failed"
  | "reversed"
  | "abandoned";

export interface ProviderCapabilities {
  provider: string;
  supportsOnline: boolean;
  supportsTerminal: boolean;
  supportsRefund: boolean;
  /** Channels this provider can actually take money through. */
  channels: PaymentChannel[];
  /** False for providers with no webhook at all (e.g. a manual/cash gateway). */
  supportsWebhook: boolean;
}

export interface InitiateInput {
  idempotencyKey: string;
  amountKobo: Kobo;
  currency: string;
  channel: PaymentChannel;
  reference: string;
  /** For online checkout flows. */
  customerEmail?: string;
  /** For a POS terminal push. */
  terminalId?: string;
  metadata?: Record<string, unknown>;
}

export interface InitiateResult {
  ok: boolean;
  status: TransactionStatus;
  gatewayReference?: string;
  /** Where to send the guest, for a hosted checkout. */
  checkoutUrl?: string;
  /** What to tell the clerk, for a terminal push. */
  instruction?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface VerifyResult {
  ok: boolean;
  status: TransactionStatus;
  amountKobo?: Kobo;
  feeKobo?: Kobo;
  channel?: PaymentChannel;
  rrn?: string;
  authCode?: string;
  maskedPan?: string;
  cardType?: string;
  failureReason?: string;
  raw?: unknown;
}

export interface ParsedWebhook {
  ok: boolean;
  /** The gateway's own event id — the key replay protection turns on. */
  eventId: string;
  eventType: string;
  gatewayReference?: string;
  status?: TransactionStatus;
  amountKobo?: Kobo;
  feeKobo?: Kobo;
  rejectionReason?: string;
}

export interface PaymentProvider {
  readonly capabilities: ProviderCapabilities;
  initiate(input: InitiateInput): Promise<InitiateResult>;
  verify(gatewayReference: string): Promise<VerifyResult>;
  refund(gatewayReference: string, amountKobo: Kobo, reason: string): Promise<{ ok: boolean; reference?: string; failureReason?: string }>;
  /**
   * Verifies the signature FIRST and returns `ok: false` if it does not match.
   *
   * Signature verification is not optional and is not a separate step a caller
   * might forget: an unsigned webhook is an unauthenticated instruction to
   * mark money as received, which is the most valuable forgery available
   * against a hotel.
   */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ParsedWebhook;
}

export class GatewayUnreachableError extends Error {
  constructor(provider: string, cause?: string) {
    super(`Payment gateway "${provider}" is unreachable${cause ? `: ${cause}` : ""}`);
    this.name = "GatewayUnreachableError";
  }
}
