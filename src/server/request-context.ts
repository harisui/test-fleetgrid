import { headers } from "next/headers";

/** The caller's address and browser, kept with an acceptance or acknowledgment. */
export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : (requestHeaders.get("x-real-ip") ?? null),
    userAgent: requestHeaders.get("user-agent"),
  };
}
