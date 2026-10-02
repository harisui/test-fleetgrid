import { AppError } from "@/server/errors/AppError";
import type {
  CreateProfileInput,
  IProfileRepository,
} from "@/server/repositories/ProfileRepository";
import type { Profile } from "@/types/domain";

const TIMESTAMP = "2026-10-01T12:00:00.000Z";

/** In-memory stand-in for ProfileRepository. Mirrors the database's uniqueness rules. */
export class FakeProfileRepository implements IProfileRepository {
  readonly rows = new Map<string, Profile>();
  /** Set to make the next create() fail, to simulate a race or an outage. */
  failNextCreateWith: Error | null = null;

  constructor(seed: Profile[] = []) {
    for (const profile of seed) this.rows.set(profile.id, profile);
  }

  async findById(id: string): Promise<Profile | null> {
    return this.rows.get(id) ?? null;
  }

  async create(input: CreateProfileInput): Promise<Profile> {
    if (this.failNextCreateWith) {
      const error = this.failNextCreateWith;
      this.failNextCreateWith = null;
      throw error;
    }
    if (this.rows.has(input.id)) throw AppError.conflict();
    if ([...this.rows.values()].some((row) => row.phone === input.phone)) {
      throw AppError.conflict();
    }
    const profile: Profile = {
      id: input.id,
      phone: input.phone,
      role: input.role,
      status: "pending",
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    };
    this.rows.set(profile.id, profile);
    return profile;
  }
}
