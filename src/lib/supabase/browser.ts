import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import { getClientEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Supabase client for the browser. Allowed uses: the auth session, Realtime subscriptions
 * (Milestone 3), and sending a file to storage with a one-time upload token.
 * All other data access goes through server actions.
 */
export function createBrowserClient() {
  const env = getClientEnv();
  return createSsrBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
