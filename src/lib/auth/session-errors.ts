import { isAuthRetryableFetchError } from "@supabase/supabase-js";

/**
 * What an error from `supabase.auth.getUser()` means for the person, in one place, so the
 * proxy and the server guards agree:
 *
 * - "signed-out": there is no usable session. No cookie, an expired refresh, or a session for
 *   a user that no longer exists (an account deleted while its browser stayed open). The
 *   person really has to sign in, and the dead cookie should be cleared so it cannot loop.
 * - "unavailable": the auth server could not answer (network failure, timeout, 5xx). The
 *   person may well be signed in. Sending them to /login would be wrong; the page shows the
 *   error screen and a retry instead.
 */
export type AuthFailure = "signed-out" | "unavailable";

interface AuthErrorLike {
  status?: number;
  name?: string;
}

export function classifyAuthError(error: unknown): AuthFailure {
  if (isAuthRetryableFetchError(error)) return "unavailable";
  const status = (error as AuthErrorLike | null)?.status;
  // A plain fetch failure, or anything that is not a 4xx from the auth server.
  if (typeof status !== "number" || status === 0 || status >= 500) return "unavailable";
  return "signed-out";
}
