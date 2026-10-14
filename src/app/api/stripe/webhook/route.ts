import { createAdminClient } from "@/lib/supabase/admin";
import { buildContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";

/**
 * Stripe's webhook. The raw body is needed for the signature check, so the request is read
 * as text. A bad signature is 400; a duplicate event is 200 (already done); a failure while
 * applying the event is 500, which makes Stripe retry.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  // The webhook has no user session; the service writes through the service role.
  const { subscriptionService } = buildContainer(createAdminClient());
  try {
    const outcome = await subscriptionService.handleWebhook(rawBody, signature);
    return Response.json({ received: true, ...outcome });
  } catch (error) {
    if (error instanceof AppError && error.code === "VALIDATION") {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[FleetGrid] Stripe webhook failed:", error);
    return Response.json({ error: "Webhook failed" }, { status: 500 });
  }
}
