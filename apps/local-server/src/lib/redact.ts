// Backend Blueprint B17.6 — PII redaction for logs and the audit trail.
//
// THE SPECIFIC PROBLEM. A failed login wrote the attempted email verbatim into
// audit_log.details. That log is readable by anyone holding admin:operations,
// and it accumulates:
//   * passwords, because people type them into the email field;
//   * personal email addresses of people who are not staff;
//   * a list of every account name someone has tried, which is a target list.
//
// None of that is needed to investigate. What an investigator actually needs
// is "were these attempts against the SAME target?", and a stable hash answers
// that without storing the value.
//
// NDPA relevance (Production blueprint §4.7): logs are personal data too, and
// a retention policy over a log full of plaintext identifiers is much harder
// to defend than one over hashes.
import crypto from "node:crypto";
import { localSigningKeys } from "../auth/keys.js";

/**
 * A short, stable, non-reversible tag for an identifier.
 *
 * Salted with the property's own signing key, so the same email produces the
 * same tag on this server and a DIFFERENT tag on another property's server.
 * That matters: an unsalted hash of an email is trivially reversible by
 * anyone with a wordlist, which would defeat the entire point.
 *
 * 12 hex characters — enough that a collision inside one property's audit log
 * is not a practical concern, short enough to read in a log line.
 */
export function hashIdentifier(value: string): string {
  return crypto
    .createHmac("sha256", localSigningKeys.publicKey)
    .update(value.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

/** Masks an email for display: `ada.okafor@example.com` → `ad***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.slice(0, Math.min(2, local.length))}***${domain}`;
}

/** Masks a phone number, keeping the last 3 digits: `080****567`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-3)}`;
}
