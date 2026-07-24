// Local signing key — Auth doc Part 1.3: "Never leaves the property. Never
// sent to the central server. Generated at provisioning time."
// Generated on first boot if absent. Stored as plaintext PEM with 0600
// permissions for now -- the Auth doc's hardware-ID-derived disk encryption
// (Part 9.2) is real production hardening that belongs with Phase 4's
// distribution work, not this Phase 1 proof, and is called out here rather
// than silently skipped.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const keysDir = path.resolve(process.cwd(), "data", "keys");
const privateKeyPath = path.join(keysDir, "local_private.pem");
const publicKeyPath = path.join(keysDir, "local_public.pem");

function generateKeyPair() {
  fs.mkdirSync(keysDir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey);
  console.log("[auth] Generated new local signing key pair (first boot / provisioning).");
  return { privateKey, publicKey };
}

function loadOrGenerateKeyPair() {
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    return {
      privateKey: fs.readFileSync(privateKeyPath, "utf8"),
      publicKey: fs.readFileSync(publicKeyPath, "utf8"),
    };
  }
  return generateKeyPair();
}

export const localSigningKeys = loadOrGenerateKeyPair();
