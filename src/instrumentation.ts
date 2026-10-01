/**
 * Runs once when the Next.js server starts.
 * Validates environment variables so a misconfigured deploy fails fast with a clear message.
 */
export async function register() {
  const { getServerEnv } = await import("@/lib/env");
  getServerEnv();
}
