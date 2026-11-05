import { isLocalSupabaseUrl, type ServerEnv } from "@/lib/env";

/** Every simulated number starts here; a +1 555 number can never reach a real phone. */
export const FAKE_PHONE_PREFIX = "+1555";

/**
 * The fake phone inbox shows every driver's texts and replies as any of them, so it opens only
 * with the fake sender, never on production, and only against the local database: a preview on a
 * hosted project would hand both to anyone holding the link.
 */
export function devPhonesEnabled(
  env: Pick<ServerEnv, "VERCEL_ENV" | "NEXT_PUBLIC_SUPABASE_URL">,
  senderKind: "twilio" | "fake" | "held",
): boolean {
  return senderKind === "fake" && env.VERCEL_ENV !== "production" && isLocalSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
}
