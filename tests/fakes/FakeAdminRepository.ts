import { AppError } from "@/server/errors/AppError";
import type { DriverReviewRow, IAdminRepository } from "@/server/repositories/AdminRepository";
import type { AccountStatus, Profile } from "@/types/domain";

/** In-memory stand-in for AdminRepository over a list of driver cards with their profiles. */
export class FakeAdminRepository implements IAdminRepository {
  readonly rows: DriverReviewRow[];
  readonly statusChanges: { profileId: string; status: AccountStatus }[] = [];

  constructor(
    rows: DriverReviewRow[] = [],
    /** The profile store the service reads, kept in step like the one database would be. */
    private readonly profiles?: { rows: Map<string, Profile> },
  ) {
    this.rows = [...rows];
  }

  async listDrivers(filter: { status?: AccountStatus }): Promise<DriverReviewRow[]> {
    return this.rows
      .filter((row) => !filter.status || row.profile.status === filter.status)
      .sort((a, b) => b.driver.createdAt.localeCompare(a.driver.createdAt));
  }

  async setProfileStatus(profileId: string, status: AccountStatus): Promise<Profile> {
    const row = this.rows.find((candidate) => candidate.profile.id === profileId);
    if (!row) throw AppError.notFound();
    this.statusChanges.push({ profileId, status });
    row.profile = { ...row.profile, status };
    this.profiles?.rows.set(profileId, row.profile);
    return row.profile;
  }
}
