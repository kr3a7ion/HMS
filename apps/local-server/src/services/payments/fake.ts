// Backend Blueprint B23 — the fake provider, and the conformance target.
//
// NOT A MOCK IN A TEST FILE. This is a real implementation of the interface
// that lives in the product, for three reasons:
//
//   1. A property with no gateway account still has to take cash and record
//      it. `provider: "manual"` uses this.
//   2. The business logic -- idempotency, offline handling, reconciliation --
//      is written once and tested against this, so it is exercised without a
//      live gateway and without a card being charged in CI.
//   3. It is the CONFORMANCE TARGET. Every real adapter must behave the same
//      way at the seams this exposes, and the same test suite runs against
//      all of them.
//
// It is deliberately controllable: `scenario` makes a caller reproduce a
// decline, a timeout, or an unreachable gateway on demand, because those
// paths are the ones that matter and the ones nobody can trigger against a
// live gateway.
import crypto from "node:crypto";
import type {
  InitiateInput, InitiateResult, ParsedWebhook, PaymentProvider,
  ProviderCapabilities, VerifyResult,
} from "./provider.js";
import { GatewayUnreachableError } from "./provider.js";
import { formatNaira, type Kobo } from "../../lib/money.js";

export type FakeScenario = "success" | "decline" | "unreachable" | "pending";

interface FakeRecord {
  reference: string;
  amountKobo: Kobo;
  status: "successful" | "failed" | "pending";
  channel: InitiateInput["channel"];
}

export class FakePaymentProvider implements PaymentProvider {
  readonly capabilities: ProviderCapabilities = {
    provider: "fake",
    supportsOnline: true,
    supportsTerminal: true,
    supportsRefund: true,
    channels: ["card", "transfer", "ussd", "pos_terminal", "cash"],
    supportsWebhook: true,
  };

  /**
   * Transactions this fake gateway believes it has.
   *
   * MODULE-LEVEL, not per-instance. `providerFor()` constructs a fresh
   * provider on every call, so a per-instance map meant `verify()` never
   * recognised a reference `initiate()` had just produced -- the fake forgot
   * everything between two calls that a real gateway would obviously
   * remember. A stand-in that cannot model "the gateway knows about this
   * charge" is not a useful stand-in.
   */
  private static readonly ledger = new Map<string, FakeRecord>();
  private get ledger() { return FakePaymentProvider.ledger; }

  /** Test seam: forget everything, the way a fresh gateway account would. */
  static reset() { FakePaymentProvider.ledger.clear(); }

  constructor(
    private scenario: FakeScenario = "success",
    private readonly webhookSecret = "fake-webhook-secret",
  ) {}

  setScenario(scenario: FakeScenario) { this.scenario = scenario; }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    if (this.scenario === "unreachable") {
      // Thrown, not returned: an unreachable gateway is not a declined
      // payment, and the caller has to take a completely different branch
      // (offer cash / terminal) rather than telling the guest their card
      // was refused.
      throw new GatewayUnreachableError("fake", "simulated network failure");
    }

    const reference = `FAKE-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
    const status = this.scenario === "decline" ? "failed"
      : this.scenario === "pending" ? "pending"
      : "successful";
    this.ledger.set(reference, { reference, amountKobo: input.amountKobo, status, channel: input.channel });

    if (status === "failed") {
      return { ok: false, status: "failed", gatewayReference: reference, failureReason: "Card declined by issuer" };
    }
    return {
      ok: true,
      status: status === "pending" ? "pending" : "successful",
      gatewayReference: reference,
      checkoutUrl: input.channel === "card" ? `https://fake-gateway.test/pay/${reference}` : undefined,
      instruction: input.channel === "pos_terminal"
        // formatNaira, not an open-coded `/ 100` -- invariant 2, and the
        // lint caught this exact line. Every kobo→naira conversion goes
        // through money.ts so there is one rounding policy to point at.
        ? `Push ${formatNaira(input.amountKobo)} to terminal ${input.terminalId ?? "(unassigned)"}`
        : undefined,
    };
  }

  async verify(gatewayReference: string): Promise<VerifyResult> {
    if (this.scenario === "unreachable") throw new GatewayUnreachableError("fake");
    const record = this.ledger.get(gatewayReference);
    if (!record) return { ok: false, status: "failed", failureReason: "Unknown reference" };
    if (record.status === "pending") return { ok: false, status: "pending" };
    if (record.status === "failed") return { ok: false, status: "failed", failureReason: "Card declined by issuer" };

    // A 1.5% fee, which is roughly the Nigerian card rate and enough to make
    // the settlement arithmetic non-trivial in tests.
    const feeKobo = Math.round(record.amountKobo * 0.015);
    return {
      ok: true, status: "successful",
      amountKobo: record.amountKobo, feeKobo, channel: record.channel,
      rrn: `RRN${gatewayReference.slice(-8)}`,
      authCode: "A1B2C3",
      maskedPan: "506099******1234",
      cardType: "verve",
    };
  }

  async refund(gatewayReference: string, amountKobo: Kobo) {
    if (this.scenario === "unreachable") throw new GatewayUnreachableError("fake");
    if (!this.ledger.has(gatewayReference)) return { ok: false, failureReason: "Unknown reference" };
    return { ok: true, reference: `FAKE-RFD-${crypto.randomBytes(4).toString("hex").toUpperCase()}` };
  }

  /** Signs a body the way this fake's webhooks are signed. For tests. */
  sign(body: string): string {
    return crypto.createHmac("sha512", this.webhookSecret).update(body).digest("hex");
  }

  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ParsedWebhook {
    const signature = headers["x-fake-signature"];
    if (!signature) {
      return { ok: false, eventId: "", eventType: "", rejectionReason: "Missing signature header" };
    }
    const expected = this.sign(rawBody);
    // timingSafeEqual, not ===: a byte-by-byte comparison that short-circuits
    // leaks the signature one character at a time to anyone willing to send a
    // few thousand webhooks.
    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, eventId: "", eventType: "", rejectionReason: "Signature mismatch" };
    }

    try {
      const parsed = JSON.parse(rawBody) as {
        id?: string; event?: string;
        data?: { reference?: string; status?: string; amount?: number; fees?: number };
      };
      if (!parsed.id) return { ok: false, eventId: "", eventType: "", rejectionReason: "Event has no id" };
      return {
        ok: true,
        eventId: parsed.id,
        eventType: parsed.event ?? "charge.success",
        gatewayReference: parsed.data?.reference,
        status: parsed.data?.status === "success" ? "successful"
          : parsed.data?.status === "failed" ? "failed" : "pending",
        amountKobo: parsed.data?.amount,
        feeKobo: parsed.data?.fees,
      };
    } catch {
      return { ok: false, eventId: "", eventType: "", rejectionReason: "Body is not valid JSON" };
    }
  }
}

/**
 * The `manual` provider: cash and anything settled outside this system.
 *
 * Not a degraded fake -- it is the correct implementation for a property with
 * no gateway account, which is most of the target market on day one. It
 * declares honestly that it has no online capability and no webhook, so the
 * code that checks capabilities routes around it rather than calling
 * something that would silently do nothing.
 */
export class ManualPaymentProvider implements PaymentProvider {
  readonly capabilities: ProviderCapabilities = {
    provider: "manual",
    supportsOnline: false,
    supportsTerminal: false,
    supportsRefund: false,
    channels: ["cash", "transfer", "pos_terminal"],
    supportsWebhook: false,
  };

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    // Nothing to call. The money moves outside this system -- the clerk takes
    // notes, or the guest taps a standalone terminal -- so the transaction is
    // recorded as successful the moment it is entered, and the accuracy of
    // that rests on the person entering it. Said plainly rather than dressed
    // up as a gateway confirmation.
    return {
      ok: true,
      status: "successful",
      gatewayReference: `MANUAL-${input.idempotencyKey.slice(0, 12)}`,
      instruction: "Recorded manually — no gateway confirmation exists for this payment",
    };
  }

  async verify(): Promise<VerifyResult> {
    return { ok: true, status: "successful" };
  }

  async refund() {
    return { ok: false, failureReason: "A manual payment must be refunded outside the system, then recorded here" };
  }

  parseWebhook(): ParsedWebhook {
    return { ok: false, eventId: "", eventType: "", rejectionReason: "The manual provider has no webhooks" };
  }
}
