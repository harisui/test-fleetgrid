import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContainer } from "@/server/container";

/**
 * The scheduled reconcile (vercel.json, once a day): every carrier whose stored subscription
 * has gone stale is read from Stripe again, so a cancellation or a declined renewal whose
 * webhook never arrived is still recorded. Vercel Cron calls it with
 * "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { subscriptionService } = buildContainer(createAdminClient());
  const outcome = await subscriptionService.reconcileAll();
  console.log("[FleetGrid] Subscriptions reconciled", outcome);
  return Response.json({ ok: true, ...outcome });
}
