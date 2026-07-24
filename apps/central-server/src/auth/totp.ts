// Auth doc 3.5: "Multi-factor authentication (TOTP) -- mandatory, no
// bypass" for the Platform Owner. A real RFC 6238 (TOTP) / RFC 4226 (HOTP)
// implementation against Node's built-in crypto -- no third-party MFA
// library, so there's nothing here to trust blind. Compatible with Google
// Authenticator, Authy, 1Password, etc. (all implement the same RFCs).
import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

// RFC 4648 base32, no padding -- the near-universal way authenticator apps
// expect a TOTP secret to be presented for manual entry.
function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// 20 random bytes = 160 bits, the RFC 4226 recommended HOTP secret length.
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpOtpauthUrl(secret: string, email: string): string {
  const label = encodeURIComponent(`Nexura Admin:${email}`);
  const issuer = encodeURIComponent("Nexura");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// RFC 4226 HOTP: HMAC-SHA1 over an 8-byte big-endian counter, then dynamic
// truncation to a DIGITS-length decimal code.
function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(truncated % 10 ** DIGITS).padStart(DIGITS, "0");
}

function currentStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / STEP_SECONDS);
}

export function generateTotp(secret: string, atMs: number = Date.now()): string {
  return hotp(secret, currentStep(atMs));
}

// One step of drift tolerance either side (+/- 30s) -- standard practice for
// TOTP verification given clock skew between server and phone.
export function verifyTotp(secret: string, code: string, atMs: number = Date.now(), window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const step = currentStep(atMs);
  for (let offset = -window; offset <= window; offset++) {
    if (crypto.timingSafeEqual(Buffer.from(hotp(secret, step + offset)), Buffer.from(code))) return true;
  }
  return false;
}
