import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideRoute, needsAuthCheck } from "@/lib/auth/routes";
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
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  if (!needsAuthCheck(pathname)) return response;

  let role: UserRole | null = null;
  if (user) {
    const profile = await new ProfileRepository(supabase).findById(user.id).catch(() => null);
    role = profile?.role ?? null;
  }

  const decision = decideRoute({ pathname, signedIn: Boolean(user), role });
  if (decision.action === "allow") return response;

  const url = request.nextUrl.clone();
  url.pathname = decision.to;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  // Keep any refreshed session cookies on the redirect.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
