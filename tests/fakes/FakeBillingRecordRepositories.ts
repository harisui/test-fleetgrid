import type {
  BillingAcknowledgmentInput,
  IBillingAcknowledgmentRepository,
  ITrialCardRepository,
} from "@/server/repositories/BillingRecordRepository";

/** In-memory stand-in for the price acknowledgments (the database takes the carrier from the session). */
export class FakeBillingAcknowledgmentRepository implements IBillingAcknowledgmentRepository {
  readonly records: BillingAcknowledgmentInput[] = [];

  async record(input: BillingAcknowledgmentInput): Promise<{ id: string; acceptedAt: string }> {
    this.records.push(input);
    return { id: `ack-${this.records.length}`, acceptedAt: "2026-11-11T12:00:00.000Z" };
  }
}

/** In-memory stand-in for the card fingerprints that had a trial. */
export class FakeTrialCardRepository implements ITrialCardRepository {
  readonly rows = new Map<string, string>();

  async claim(fingerprint: string, carrierId: string): Promise<boolean> {
    if (!this.rows.has(fingerprint)) this.rows.set(fingerprint, carrierId);
    return this.rows.get(fingerprint) === carrierId;
  }
}
