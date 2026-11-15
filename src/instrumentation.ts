/**
 * Runs once when the Next.js server starts.
 * Validates environment variables so a misconfigured deploy fails fast with a clear message,
 * then archives the published Terms versions (Milestone 6) so a version that needs everyone's
 * acceptance again takes effect at deploy, not at the first acceptance.
 */
export async function register() {
  const { getServerEnv } = await import("@/lib/env");
  getServerEnv();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ createAdminClient }, { TermsAdminRepository }, { publishTermsVersions }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/server/repositories/TermsRepository"),
    import("@/server/services/TermsService"),
  ]);
  // A failure is logged, not fatal: the site stays up and the next acceptance tries again.
  await publishTermsVersions(new TermsAdminRepository(createAdminClient())).catch((error: unknown) =>
    console.error("[FleetGrid] The Terms versions were not archived", error),
  );
}
