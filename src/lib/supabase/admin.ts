import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database.types";

/**
 * Service role client. Bypasses Row Level Security.
 * Server only: importing this file from a client component fails the build.
 * Use it only for trusted server work (webhooks, admin tasks), never for user requests.
 */
export function createAdminClient() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
