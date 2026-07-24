// Central server's own signing key -- Auth doc Part 4.2: "Signed with
// central server's signing key" (distinct from any branch's local key,
// Part 1.3's whole point being that a branch's key never leaves the
// property and the central key is never trusted for local decisions).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const keysDir = path.resolve(process.cwd(), "data", "keys");
const privateKeyPath = path.join(keysDir, "central_private.pem");
const publicKeyPath = path.join(keysDir, "central_public.pem");

function generateKeyPair() {
  fs.mkdirSync(keysDir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });
  fs.writeFileSync(publicKeyPath, publicKey);
  console.log("[auth] Generated new central signing key pair (first boot).");
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

export const centralSigningKeys = loadOrGenerateKeyPair();
