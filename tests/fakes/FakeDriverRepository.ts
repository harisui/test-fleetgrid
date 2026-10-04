import { AppError } from "@/server/errors/AppError";
import type {
  CreateDriverInput,
  DriverPatch,
  IDriverRepository,
} from "@/server/repositories/DriverRepository";
import type { Driver } from "@/types/domain";

const TIMESTAMP = "2026-10-01T12:00:00.000Z";

/** In-memory stand-in for DriverRepository. Mirrors the database defaults and one-card rule. */
export class FakeDriverRepository implements IDriverRepository {
  readonly rows = new Map<string, Driver>();
  failNextCreateWith: Error | null = null;
  private sequence = 0;

  constructor(seed: Driver[] = []) {
    for (const driver of seed) this.rows.set(driver.profileId, driver);
  }

  async findByProfileId(profileId: string): Promise<Driver | null> {
    return this.rows.get(profileId) ?? null;
  }

  async create(profileId: string, input: CreateDriverInput): Promise<Driver> {
    if (this.failNextCreateWith) {
      const error = this.failNextCreateWith;
      this.failNextCreateWith = null;
      throw error;
    }
    if (this.rows.has(profileId)) throw AppError.conflict();

    this.sequence += 1;
    const driver: Driver = {
      id: `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      profileId,
      fullName: input.fullName,
      operatorTypes: [],
      cdlClass: "none",
      endorsements: [],
      yearsExperience: null,
      city: input.city ?? null,
      state: input.state ?? null,
      zip: input.zip ?? null,
      serviceRadiusMiles: input.serviceRadiusMiles ?? 50,
      lat: null,
      lng: null,
      availability: [],
      certifications: [],
      bio: null,
      smsOptIn: false,
      smsOptInAt: null,
      smsOptInText: null,
      smsOptedOut: false,
      smsOptedOutAt: null,
      onboardingStep: input.onboardingStep,
      cardCompleted: false,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    this.rows.set(profileId, driver);
    return driver;
  }

  async update(profileId: string, patch: DriverPatch): Promise<Driver> {
    const existing = this.rows.get(profileId);
    if (!existing) throw AppError.notFound();

    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const updated: Driver = { ...existing, ...defined };
    this.rows.set(profileId, updated);
    return updated;
  }
}
