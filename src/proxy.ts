import { carriesDocuments, DOCUMENT_RESPONSE_HEADERS } from "@/lib/documents/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_GATE_HEADER, ADMIN_HOST_ROBOTS, decideAdminHost, hostOf } from "@/lib/auth/admin-host";
import { captureAttribution } from "@/lib/attribution";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed middleware.ts to proxy.ts. This keeps the admin panel on its own host when
 * ADMIN_HOST is set (src/lib/auth/admin-host.ts), refreshes the session and protects /driver,
 * /carrier and /admin by role (the rules live in src/lib/auth/routes.ts), and on a first visit
 * to a public page keeps where the person came from (src/lib/attribution.ts).
 */
export async function proxy(request: NextRequest) {
  const host = decideAdminHost({
    // The Host header only: x-forwarded-host can be set by the client.
    host: hostOf(request.headers.get("host")),
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    adminHost: process.env.ADMIN_HOST,
    gateSecret: process.env.ADMIN_HOST_SECRET,
    gateHeader: request.headers.get(ADMIN_GATE_HEADER),
  });
  if (host.action === "refuse") return new NextResponse("Forbidden", { status: 403 });
  if (host.action === "redirect") return NextResponse.redirect(host.to, 308);
  if (host.action === "robots") {
    return new NextResponse(ADMIN_HOST_ROBOTS, { headers: { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex, nofollow" } });
  }

  const response = await updateSession(request);
  if (host.adminHost) {
    // The admin host is never indexed, and keeps no marketing attribution.
    response.headers.set("x-robots-tag", "noindex, nofollow");
  } else {
    captureAttribution(request, response, process.env.NODE_ENV === "production");
  }
  if (carriesDocuments(request.nextUrl.pathname)) {
    for (const [name, value] of Object.entries(DOCUMENT_RESPONSE_HEADERS)) response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images and the health check.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
