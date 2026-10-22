import { createAdminClient } from "@/lib/supabase/admin";
import { buildContainer } from "@/server/container";
import { refuseUnlessCron } from "@/server/cron";

/**
 * The scheduled reconcile (vercel.json, once a day): every carrier whose stored subscription
 * has gone stale is read from Stripe again, so a cancellation or a declined renewal whose
 * webhook never arrived is still recorded.
 */
export async function GET(request: Request): Promise<Response> {
  const refused = refuseUnlessCron(request);
  if (refused) return refused;
  const { subscriptionService } = buildContainer(createAdminClient());
  const outcome = await subscriptionService.reconcileAll();
  console.log("[FleetGrid] Subscriptions reconciled", outcome);
  return Response.json({ ok: true, ...outcome });
}
