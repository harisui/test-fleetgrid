import { AppError } from "@/server/errors/AppError";
import type {
  CarrierPatch,
  CreateCarrierInput,
  ICarrierRepository,
} from "@/server/repositories/CarrierRepository";
import type { Carrier } from "@/types/domain";

const TIMESTAMP = "2026-10-13T12:00:00.000Z";

/** In-memory stand-in for CarrierRepository. One row per profile, like the database. */
export class FakeCarrierRepository implements ICarrierRepository {
  readonly rows = new Map<string, Carrier>();
  failNextCreateWith: Error | null = null;
  /** Inserted at the moment the next create fails: the row another request won the race with. */
  raceWinner: Carrier | null = null;
  private sequence = 0;

  constructor(seed: Carrier[] = []) {
    for (const carrier of seed) this.rows.set(carrier.id, carrier);
  }

  async findByProfileId(profileId: string): Promise<Carrier | null> {
    return [...this.rows.values()].find((row) => row.profileId === profileId) ?? null;
  }

  async findById(id: string): Promise<Carrier | null> {
    return this.rows.get(id) ?? null;
  }

  async findByStripeCustomerId(customerId: string): Promise<Carrier | null> {
    return [...this.rows.values()].find((row) => row.stripeCustomerId === customerId) ?? null;
  }

  async listWithStripeCustomer(): Promise<Carrier[]> {
    return [...this.rows.values()].filter((row) => row.stripeCustomerId !== null);
  }

  async create(profileId: string, input: CreateCarrierInput): Promise<Carrier> {
    if (this.failNextCreateWith) {
      const error = this.failNextCreateWith;
      this.failNextCreateWith = null;
      if (this.raceWinner) this.rows.set(this.raceWinner.id, this.raceWinner);
      throw error;
    }
    if (await this.findByProfileId(profileId)) throw AppError.conflict();
    this.sequence += 1;
    const carrier: Carrier = {
      id: `c0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      profileId,
      ...input,
      stripeCustomerId: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    this.rows.set(carrier.id, carrier);
    return carrier;
  }

  async update(carrierId: string, patch: CarrierPatch): Promise<Carrier> {
    const existing = this.rows.get(carrierId);
    if (!existing) throw AppError.notFound();
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const updated: Carrier = { ...existing, ...defined };
    this.rows.set(carrierId, updated);
    return updated;
  }
}
