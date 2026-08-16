// Backend Blueprint B23 — the gateway webhook.
//
// ON ITS OWN MOUNT, not under /payments. `/payments/webhook/:provider` and
// `/payments/:id/verify` are genuinely ambiguous -- a POST to
// /payments/webhook/verify could match either, and which one wins depends on
// registration order. Relying on that is the kind of thing that survives
// review and breaks when someone reorders a file.
//
// PUBLIC by necessity: a gateway has no session. It is authenticated by HMAC
// SIGNATURE over the raw body instead, and an unsigned call is refused with a
// 401 before anything in it is trusted.
import { Router, raw } from "express";
import { immediateTransaction } from "../db/tx.js";
import { isHandlerError } from "../lib/handlerError.js";
import { handleWebhook } from "../services/payments/index.js";

const router = Router();

// `raw`, not `json`: the signature covers the exact bytes the gateway sent,
// and re-serialising parsed JSON produces different bytes that will never
// match.
router.post("/:provider", raw({ type: "*/*", limit: "256kb" }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }

  try {
    const outcome = immediateTransaction(() => handleWebhook(req.params.provider, rawBody, headers));
    if (outcome.outcome === "rejected") return res.status(401).json(outcome);
    // 200 for applied, duplicate AND ignored: a gateway retries anything that
    // is not 2xx, so answering non-2xx to a duplicate guarantees it keeps
    // arriving forever.
    res.json(outcome);
  } catch (err) {
    if (isHandlerError(err)) return res.status(err.status).json({ error: err.code, ...err.detail });
    throw err;
  }
});

export default router;
