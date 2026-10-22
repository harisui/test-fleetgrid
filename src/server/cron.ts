import { getServerEnv } from "@/lib/env";

/**
 * The check every scheduled route makes first. Vercel Cron calls them with
 * "Authorization: Bearer <CRON_SECRET>"; anything else is refused, and until the variable is
 * set the routes refuse every call. Returns the refusal, or null when the call may go on.
 */
export function refuseUnlessCron(request: Request): Response | null {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
