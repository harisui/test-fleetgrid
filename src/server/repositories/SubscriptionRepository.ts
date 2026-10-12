import { ALLOWED_SUB_STATUSES } from "@/lib/constants";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { Database } from "@/types/database.types";
import type { Subscription, SubscriptionStatus } from "@/types/domain";

type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];

/** What the webhook knows about a subscription. Written as a whole, keyed by the Stripe id. */
export interface SubscriptionUpsert {
  carrierId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export interface ISubscriptionRepository {
  /** The carrier's most recently updated subscription, whatever its status. */
  findCurrentByCarrierId(carrierId: string): Promise<Subscription | null>;
  /** The subscription that grants access, if any (active or trialing). */
  findActiveByCarrierId(carrierId: string): Promise<Subscription | null>;
  findByStripeId(stripeSubscriptionId: string): Promise<Subscription | null>;
  /** Service role only: the webhook's view replaces whatever was stored. */
  upsert(input: SubscriptionUpsert): Promise<Subscription>;
}

export const isAccessStatus = (status: SubscriptionStatus): boolean =>
  (ALLOWED_SUB_STATUSES as readonly SubscriptionStatus[]).includes(status);

export function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    carrierId: row.carrier_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    status: row.status,
    priceId: row.price_id,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SubscriptionRepository extends BaseRepository implements ISubscriptionRepository {
  async findCurrentByCarrierId(carrierId: string): Promise<Subscription | null> {
    const result = await this.supabase
      .from("subscriptions")
      .select("*")
      .eq("carrier_id", carrierId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapSubscription(row) : null;
  }

  async findActiveByCarrierId(carrierId: string): Promise<Subscription | null> {
    const result = await this.supabase
      .from("subscriptions")
      .select("*")
      .eq("carrier_id", carrierId)
      .in("status", [...ALLOWED_SUB_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapSubscription(row) : null;
  }

  async findByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    const result = await this.supabase
      .from("subscriptions")
      .select("*")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    const row = this.unwrapMaybe(result);
    return row ? mapSubscription(row) : null;
  }

  async upsert(input: SubscriptionUpsert): Promise<Subscription> {
    const result = await this.supabase
      .from("subscriptions")
      .upsert(
        {
          carrier_id: input.carrierId,
          stripe_subscription_id: input.stripeSubscriptionId,
          stripe_customer_id: input.stripeCustomerId,
          status: input.status,
          price_id: input.priceId,
          current_period_end: input.currentPeriodEnd,
          cancel_at_period_end: input.cancelAtPeriodEnd,
          canceled_at: input.canceledAt,
        },
        { onConflict: "stripe_subscription_id" },
      )
      .select("*")
      .single();
    return mapSubscription(this.unwrap(result));
  }
}
