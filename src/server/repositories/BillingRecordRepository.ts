import { BaseRepository } from "@/server/repositories/BaseRepository";

export interface BillingAcknowledgmentInput {
  version: string;
  withTrial: boolean;
  ip: string | null;
  userAgent: string | null;
}

export interface IBillingAcknowledgmentRepository {
  /** The signed-in carrier read the price disclosure (0040). One record per checkout start. */
  record(input: BillingAcknowledgmentInput): Promise<{ id: string; acceptedAt: string }>;
}

/** As the signed-in carrier: record_billing_acknowledgment() takes the carrier from the session. */
export class BillingAcknowledgmentRepository extends BaseRepository implements IBillingAcknowledgmentRepository {
  async record(input: BillingAcknowledgmentInput): Promise<{ id: string; acceptedAt: string }> {
    const result = await this.supabase.rpc("record_billing_acknowledgment", {
      p_version: input.version,
      p_with_trial: input.withTrial,
      ...(input.ip ? { p_ip: input.ip } : {}),
      ...(input.userAgent ? { p_user_agent: input.userAgent } : {}),
    });
    const row = this.unwrap(result);
    return { id: row.id, acceptedAt: row.accepted_at };
  }
}

export interface ITrialCardRepository {
  /**
   * Claims the card for this carrier's trial. True when the card is new or already this
   * carrier's; false when another carrier's trial used it.
   */
  claim(fingerprint: string, carrierId: string): Promise<boolean>;
}

/** Service role only (0040): card fingerprints that had a trial. Never card data. */
export class TrialCardRepository extends BaseRepository implements ITrialCardRepository {
  async claim(fingerprint: string, carrierId: string): Promise<boolean> {
    const inserted = await this.supabase
      .from("trial_card_fingerprints")
      .upsert({ fingerprint, carrier_id: carrierId }, { onConflict: "fingerprint", ignoreDuplicates: true });
    this.unwrapMaybe(inserted);
    const result = await this.supabase.from("trial_card_fingerprints").select("carrier_id").eq("fingerprint", fingerprint).single();
    return this.unwrap(result).carrier_id === carrierId;
  }
}
