import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Jeton aléatoire cryptographique en base64url (liens de signature, etc.). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
