import { createHash } from "node:crypto";

/** The salt when IP_HASH_SALT is not set. Production sets its own (see .env.example). */
export const DEFAULT_IP_HASH_SALT = "fleetgrid-qr-scans";

/**
 * A one-way hash of a visitor's address, salted, so scans can be told apart without keeping
 * the address itself. Null for a request without one.
 */
export function hashIp(ip: string | null | undefined, salt: string = DEFAULT_IP_HASH_SALT): string | null {
  const trimmed = ip?.trim();
  if (!trimmed) return null;
  return createHash("sha256").update(`${salt}:${trimmed}`).digest("hex");
}

/** The client address from the proxy headers Vercel sets, or null. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip")?.trim() || null;
}
