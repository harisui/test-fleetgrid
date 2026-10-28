import type { NextRequest } from "next/server";
import { captureAttribution } from "@/lib/attribution";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed middleware.ts to proxy.ts. This refreshes the session and protects
 * /driver, /carrier and /admin by role (the rules live in src/lib/auth/routes.ts), and on a
 * first visit to a public page keeps where the person came from (src/lib/attribution.ts).
 */
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  captureAttribution(request, response, process.env.NODE_ENV === "production");
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images and the health check.
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
