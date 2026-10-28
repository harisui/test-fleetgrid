import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/qr/hash";
import { buildScanService } from "@/server/container";

/**
 * The short link on every printed QR code: /q/<slug>. Logs the scan (address hashed) and
 * sends the visitor on with the UTM tags; an unknown or inactive code goes to the home page
 * untagged. No session is needed, so the scan is written with the service role.
 */
export async function GET(request: NextRequest, context: RouteContext<"/q/[slug]">): Promise<Response> {
  const { slug } = await context.params;
  let to = "/";
  try {
    const outcome = await buildScanService().resolveScan({
      slug,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });
    to = outcome.to;
  } catch (error) {
    // A logging failure must never strand a person who scanned a flyer.
    console.error("[FleetGrid] QR scan failed:", error);
  }
  return Response.redirect(new URL(to, request.nextUrl.origin), 302);
}
