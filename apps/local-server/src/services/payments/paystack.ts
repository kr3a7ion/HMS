// Backend Blueprint B23 — Paystack adapter.
//
// WRITTEN TO THE DOCUMENTED API, NOT VERIFIED AGAINST A LIVE ONE. There are no
// Paystack credentials in this environment, so every HTTP path below is
// unexercised: the request shapes, field names and signature scheme come from
// Paystack's published documentation and are correct as far as reading can
// make them, which is not the same as correct.
//
// What IS verified is everything around it — idempotency, webhook replay
// safety, the offline path, reconciliation — because those are tested against
// FakePaymentProvider, which implements the same interface. The seam is the
// point: this file can be wrong without the money logic being wrong, and
// pointing it at a Paystack test account is a configuration change rather
// than a rewrite.
//
// Paystack works in kobo natively, which is why `amount` passes through
// unconverted. That is a genuine convenience and also a trap worth naming:
// Flutterwave uses naira, so its adapter must convert and this one must not.
import crypto from "node:crypto";
import type {
  InitiateInput, InitiateResult, ParsedWebhook, PaymentProvider,
  ProviderCapabilities, VerifyResult,
} from "./provider.js";
import { GatewayUnreachableError } from "./provider.js";
import type { Kobo } from "../../lib/money.js";

const BASE_URL = "https://api.paystack.co";
const TIMEOUT_MS = 15_000;

export interface PaystackConfig {
  secretKey: string;
  publicKey?: string;
  /** Paystack signs with the SECRET key; kept separate in case that changes. */
  webhookSecret?: string;
}

export class PaystackProvider implements PaymentProvider {
  readonly capabilities: ProviderCapabilities = {
    provider: "paystack",
    supportsOnline: true,
    // Paystack Terminal exists but needs separate provisioning per device;
    // declared false until a property actually has one, so the UI does not
    // offer a button that cannot work.
    supportsTerminal: false,
    supportsRefund: true,
    channels: ["card", "transfer", "ussd"],
    supportsWebhook: true,
  };

  constructor(private readonly config: PaystackConfig) {}

  private async call(path: string, init: RequestInit): Promise<{ ok: boolean; body: any; status: number }> {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, body, status: res.status };
    } catch (err) {
      // A timeout or DNS failure is UNREACHABLE, not declined. The caller has
      // to offer cash rather than telling the guest their card was refused.
      throw new GatewayUnreachableError("paystack", err instanceof Error ? err.message : String(err));
    }
  }

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const { ok, body } = await this.call("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        // Paystack is kobo-native, so no conversion. Flutterwave is not.
        amount: input.amountKobo,
        currency: input.currency,
        email: input.customerEmail ?? "guest@nexura.local",
        reference: input.reference,
        channels: input.channel === "card" ? ["card"] : [input.channel],
        metadata: { ...input.metadata, idempotencyKey: input.idempotencyKey },
      }),
    });

    if (!ok || !body?.status) {
      return { ok: false, status: "failed", failureReason: body?.message ?? "Paystack rejected the initialisation", raw: body };
    }
    return {
      ok: true,
      status: "pending",
      gatewayReference: body.data?.reference ?? input.reference,
      checkoutUrl: body.data?.authorization_url,
      raw: body,
    };
  }

  async verify(gatewayReference: string): Promise<VerifyResult> {
    const { ok, body } = await this.call(`/transaction/verify/${encodeURIComponent(gatewayReference)}`, { method: "GET" });
    if (!ok || !body?.status) {
      return { ok: false, status: "failed", failureReason: body?.message ?? "Verification failed", raw: body };
    }

    const data = body.data ?? {};
    const status = data.status === "success" ? "successful"
      : data.status === "failed" ? "failed"
      : data.status === "abandoned" ? "abandoned"
      : "pending";

    return {
      ok: status === "successful",
      status,
      amountKobo: typeof data.amount === "number" ? data.amount : undefined,
      feeKobo: typeof data.fees === "number" ? data.fees : undefined,
      channel: data.channel === "card" ? "card" : data.channel === "bank_transfer" ? "transfer" : undefined,
      rrn: data.authorization?.receipt_number ?? undefined,
      authCode: data.authorization?.authorization_code ?? undefined,
      maskedPan: data.authorization?.bin && data.authorization?.last4
        ? `${data.authorization.bin}******${data.authorization.last4}`
        : undefined,
      cardType: data.authorization?.card_type ?? undefined,
      failureReason: status === "successful" ? undefined : data.gateway_response,
      raw: body,
    };
  }

  async refund(gatewayReference: string, amountKobo: Kobo, reason: string) {
    const { ok, body } = await this.call("/refund", {
      method: "POST",
      body: JSON.stringify({ transaction: gatewayReference, amount: amountKobo, merchant_note: reason }),
    });
    return ok && body?.status
      ? { ok: true, reference: body.data?.id ? String(body.data.id) : undefined }
      : { ok: false, failureReason: body?.message ?? "Refund rejected" };
  }

  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ParsedWebhook {
    const signature = headers["x-paystack-signature"];
    if (!signature) {
      return { ok: false, eventId: "", eventType: "", rejectionReason: "Missing x-paystack-signature" };
    }
    // Paystack signs the raw body with HMAC-SHA512 keyed on the secret key.
    // The RAW body matters: re-serialising the parsed JSON produces different
    // bytes and the signature will not match.
    const expected = crypto
      .createHmac("sha512", this.config.webhookSecret ?? this.config.secretKey)
      .update(rawBody)
      .digest("hex");

    const a = Buffer.from(signature, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, eventId: "", eventType: "", rejectionReason: "Signature mismatch" };
    }

    try {
      const parsed = JSON.parse(rawBody) as {
        event?: string;
        data?: { id?: number; reference?: string; status?: string; amount?: number; fees?: number };
      };
      // Paystack has no top-level event id, so the transaction id is used as
      // the replay key -- which is what makes a redelivery of the same charge
      // a duplicate rather than a second payment.
      const eventId = parsed.data?.id != null
        ? `${parsed.event}:${parsed.data.id}`
        : `${parsed.event}:${parsed.data?.reference ?? ""}`;
      if (!parsed.data?.reference) {
        return { ok: false, eventId, eventType: parsed.event ?? "", rejectionReason: "Event carries no transaction reference" };
      }
      return {
        ok: true,
        eventId,
        eventType: parsed.event ?? "unknown",
        gatewayReference: parsed.data.reference,
        status: parsed.data.status === "success" ? "successful"
          : parsed.data.status === "failed" ? "failed" : "pending",
        amountKobo: parsed.data.amount,
        feeKobo: parsed.data.fees,
      };
    } catch {
      return { ok: false, eventId: "", eventType: "", rejectionReason: "Body is not valid JSON" };
    }
  }
}
