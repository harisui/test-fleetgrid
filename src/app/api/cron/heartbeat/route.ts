import { createAdminClient } from "@/lib/supabase/admin";
import { buildContainer } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/** A ZIP the dataset always has: downtown Houston, the launch area. */
const HEARTBEAT_ZIP = "77002";

/** A cold server's first database call has been seen to fail once; one more try covers that. */
const RETRY_AFTER_MS = 1000;

/**
 * The daily heartbeat (vercel.json). Supabase pauses a free-tier project after seven days
 * without database activity, which would take the site and its logins down; one cheap read
 * a day keeps it awake. Through the service, so the query stays in its repository: the
 * launch-area check for a fixed ZIP is one function call in the database. Pro has no pause
 * and makes this unnecessary; it stays harmless there. A second failure is thrown, so the
 * cron run shows red.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { zipLookupService } = buildContainer(createAdminClient());
  let place;
  try {
    place = await zipLookupService.lookup(HEARTBEAT_ZIP);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
    place = await zipLookupService.lookup(HEARTBEAT_ZIP);
  }
  return Response.json({ ok: true, database: "reachable", inServiceArea: place?.inServiceArea ?? null });
}
