import { driverListSchema, driverStatusSchema } from "@/lib/validation/admin.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { DriverReviewRow, IAdminRepository } from "@/server/repositories/AdminRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { IServiceAreaRepository } from "@/server/repositories/ServiceAreaRepository";
import type { Profile } from "@/types/domain";

/** A driver under review: the card, the profile and whether the yard is in a launch area. */
export interface DriverReview extends DriverReviewRow {
  inServiceArea: boolean | null;
}

/**
 * Driver review (the first piece of the admin panel, pulled forward from Milestone 3 so
 * carriers have approved drivers to find). Approve lists a driver to subscribed carriers;
 * block hides them and signs them out; pending puts them back in the queue.
 */
export class AdminService {
  constructor(
    private readonly admin: IAdminRepository,
    private readonly profiles: IProfileRepository,
    private readonly serviceAreas: IServiceAreaRepository,
  ) {}

  async listDrivers(adminId: string, input: unknown): Promise<DriverReview[]> {
    await this.requireAdmin(adminId);
    const { status } = parseInput(driverListSchema, input);
    const rows = await this.admin.listDrivers({ status });
    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        inServiceArea:
          row.driver.lat === null || row.driver.lng === null
            ? null
            : await this.serviceAreas.contains(row.driver.lat, row.driver.lng),
      })),
    );
  }

  async setDriverStatus(adminId: string, input: unknown): Promise<Profile> {
    await this.requireAdmin(adminId);
    const { profileId, status } = parseInput(driverStatusSchema, input);
    const target = await this.profiles.findById(profileId);
    if (!target || target.role !== "driver") throw AppError.notFound("Driver not found");
    if (target.status === status) return target;
    return this.admin.setProfileStatus(profileId, status);
  }

  private async requireAdmin(adminId: string): Promise<Profile> {
    const profile = await this.profiles.findById(adminId);
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      throw AppError.forbidden("Only FleetGrid staff can do this");
    }
    return profile;
  }
}
