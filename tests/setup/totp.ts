import { createHmac } from "node:crypto";

/** Decodes an RFC 4648 base32 secret, as authenticator apps receive it. */
function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value === -1) throw new Error(`Not base32: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * The 6-digit code an authenticator app shows for this secret now (RFC 6238: SHA-1, 30 seconds),
 * the way the admin sign-in (0039) checks it. Tests only.
 */
export function totpCode(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hash = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hash[hash.length - 1]! & 0x0f;
  const value = ((hash[offset]! & 0x7f) << 24) | (hash[offset + 1]! << 16) | (hash[offset + 2]! << 8) | hash[offset + 3]!;
  return String(value % 1_000_000).padStart(6, "0");
}
