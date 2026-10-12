import {
  isAccessStatus,
  type ISubscriptionRepository,
  type SubscriptionUpsert,
} from "@/server/repositories/SubscriptionRepository";
import type { Subscription } from "@/types/domain";

/** In-memory stand-in for SubscriptionRepository, keyed by the Stripe subscription id. */
export class FakeSubscriptionRepository implements ISubscriptionRepository {
  readonly rows = new Map<string, Subscription>();
  readonly upserts: SubscriptionUpsert[] = [];
  private sequence = 0;

  constructor(seed: Subscription[] = []) {
    for (const subscription of seed) this.rows.set(subscription.stripeSubscriptionId, subscription);
  }

  private byCarrier(carrierId: string): Subscription[] {
    return [...this.rows.values()]
      .filter((row) => row.carrierId === carrierId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findCurrentByCarrierId(carrierId: string): Promise<Subscription | null> {
    return this.byCarrier(carrierId)[0] ?? null;
  }

  async findActiveByCarrierId(carrierId: string): Promise<Subscription | null> {
    return this.byCarrier(carrierId).find((row) => isAccessStatus(row.status)) ?? null;
  }

  async findByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return this.rows.get(stripeSubscriptionId) ?? null;
  }

  async upsert(input: SubscriptionUpsert): Promise<Subscription> {
    this.upserts.push(input);
    this.sequence += 1;
    const existing = this.rows.get(input.stripeSubscriptionId);
    const now = new Date(Date.UTC(2026, 9, 13, 12, 0, this.sequence)).toISOString();
    const subscription: Subscription = {
      id: existing?.id ?? `s0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(input.stripeSubscriptionId, subscription);
    return subscription;
  }
}
