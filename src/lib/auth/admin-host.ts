/**
 * The admin subdomain (user decision of 2026-11-15). With ADMIN_HOST set (Production only, for
 * example "admin.fleetgridus.com"), the admin panel lives on that host alone: Cloudflare Access
 * guards it, and the public site does not show there.
 *
 * - On the admin host: "/" and every public, driver or carrier page (the phone sign-in too) go
 *   to /admin. The admin pages, the admin sign-in (0039) and what they need (the API, Next.js
 *   assets) are served.
 * - On any other host: the admin pages go to the same path on the admin host.
 * - Without ADMIN_HOST (local, tests, previews): nothing changes.
 *
 * Cloudflare Access only guards requests that pass through Cloudflare, and anyone can send a
 * request straight to Vercel with that Host header. So with ADMIN_HOST_SECRET set, Cloudflare
 * adds it as the x-admin-gate header (a Transform Rule on the admin host) and any admin-host
 * request without it is refused.
 */

/** The admin pages: served only on the admin host. */
const ADMIN_PATHS = ["/admin", "/admin-sign-in", "/admin-verify"];
/** Paths the admin host serves; everything else there goes to /admin. */
const ADMIN_HOST_PATHS = [...ADMIN_PATHS, "/api", "/_next", "/forbidden"];

/** The header Cloudflare adds on the admin host, carrying ADMIN_HOST_SECRET. */
export const ADMIN_GATE_HEADER = "x-admin-gate";

export type AdminHostDecision =
  | { action: "pass"; adminHost: boolean }
  | { action: "redirect"; to: string }
  | { action: "robots" }
  | { action: "refuse" };

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** The host without a port, lower case. */
export function hostOf(header: string | null): string {
  return (header ?? "").split(":")[0]!.trim().toLowerCase();
}

/** Compares in constant time, so the secret cannot be guessed one character at a time. */
function sameSecret(given: string | null, expected: string): boolean {
  if (given === null || given.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) difference |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

export function decideAdminHost(input: {
  host: string;
  pathname: string;
  search: string;
  adminHost: string | undefined;
  gateSecret?: string | undefined;
  gateHeader?: string | null;
}): AdminHostDecision {
  const adminHost = input.adminHost?.trim().toLowerCase();
  if (!adminHost) return { action: "pass", adminHost: false };

  if (input.host === adminHost) {
    const secret = input.gateSecret?.trim();
    if (secret && !sameSecret(input.gateHeader ?? null, secret)) return { action: "refuse" };
    if (input.pathname === "/robots.txt") return { action: "robots" };
    if (ADMIN_HOST_PATHS.some((base) => under(input.pathname, base))) return { action: "pass", adminHost: true };
    return { action: "redirect", to: `https://${adminHost}/admin` };
  }

  if (ADMIN_PATHS.some((base) => under(input.pathname, base))) {
    return { action: "redirect", to: `https://${adminHost}${input.pathname}${input.search}` };
  }
  return { action: "pass", adminHost: false };
}

/** robots.txt on the admin host: nothing to crawl. */
export const ADMIN_HOST_ROBOTS = "User-agent: *\nDisallow: /\n";
