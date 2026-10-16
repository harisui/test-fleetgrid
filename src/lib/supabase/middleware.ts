import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRoute, needsAuthCheck } from "@/lib/auth/routes";
import { classifyAuthError } from "@/lib/auth/session-errors";
import { isCarrierDisabled } from "@/lib/carrier/availability";
import { getClientEnv } from "@/lib/env";
import { ProfileRepository } from "@/server/repositories/ProfileRepository";
import type { Database } from "@/types/database.types";
import type { UserRole } from "@/types/domain";

/**
 * Runs on every matched request (see src/proxy.ts):
 *   1. refreshes the Supabase session cookies,
 *   2. applies the route rules in src/lib/auth/routes.ts.
 *
 * This is the first line of defence for page access. Data is protected independently by
 * Row Level Security and by the service layer.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const env = getClientEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Always call getUser(): it validates the token with the auth server and refreshes it.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // A session cookie whose user or session no longer exists (an account deleted while the
  // browser stayed open, a revoked refresh) is dead: clear it here, the one place that can
  // write cookies, so the person gets one clean trip to /login instead of a loop.
  const hasAuthCookie = request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
  if (error && hasAuthCookie && classifyAuthError(error) === "signed-out") {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }

  const { pathname } = request.nextUrl;
  if (!needsAuthCheck(pathname)) return response;

  // The auth server could not answer: the person may be signed in. Let the page's own guard
  // decide, which shows the error screen rather than /login.
  if (error && classifyAuthError(error) === "unavailable") return response;

  let role: UserRole | null = null;
  if (user) {
    try {
      const profile = await new ProfileRepository(supabase).findById(user.id);
      role = profile?.role ?? null;
    } catch {
      // The profile could not be read (a database hiccup), which is not the same as having
      // no profile: do not send a signed-in person to the role picker. The page decides.
      return response;
    }
  }

  const decision = decideRoute({
    pathname,
    signedIn: Boolean(user),
    role,
    carrierDisabled: isCarrierDisabled(),
  });
  if (decision.action === "allow") return response;

  const url = request.nextUrl.clone();
  url.pathname = decision.to;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Keep any refreshed session cookies on the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
