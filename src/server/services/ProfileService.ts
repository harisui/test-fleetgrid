import { chooseRoleSchema } from "@/lib/validation/phone.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { Profile, SessionUser, UserRole } from "@/types/domain";

export class ProfileService {
  constructor(private readonly profiles: IProfileRepository) {}

  async getProfile(userId: string): Promise<Profile | null> {
    return this.profiles.findById(userId);
  }

  /** Returns the profile or throws NOT_FOUND. */
  async requireProfile(userId: string): Promise<Profile> {
    const profile = await this.profiles.findById(userId);
    if (!profile) throw AppError.notFound("Profile not found");
    return profile;
  }

  /** Returns the profile if it has one of the allowed roles and is not blocked. */
  async requireRole(userId: string, ...roles: UserRole[]): Promise<Profile> {
    const profile = await this.profiles.findById(userId);
    if (!profile || !roles.includes(profile.role)) throw AppError.forbidden();
    if (profile.status === "blocked") {
      throw AppError.forbidden("Your account has been blocked. Contact support for help.");
    }
    return profile;
  }

  /**
   * Creates the profile for a newly verified user. Driver or carrier only.
   * Submitting the same role twice is safe. Choosing a different role later is not allowed.
   */
  async createProfile(user: SessionUser, input: unknown): Promise<Profile> {
    const { role } = parseInput(chooseRoleSchema, input);

    const existing = await this.profiles.findById(user.id);
    if (existing) return this.resolveExisting(existing, role);

    try {
      return await this.profiles.create({ id: user.id, phone: user.phone, role });
    } catch (error) {
      // Two submissions raced. The first one won, so treat this like an existing profile.
      if (error instanceof AppError && error.code === "CONFLICT") {
        const winner = await this.profiles.findById(user.id);
        if (winner) return this.resolveExisting(winner, role);
      }
      throw error;
    }
  }

  private resolveExisting(existing: Profile, requestedRole: UserRole): Profile {
    if (existing.role === requestedRole) return existing;
    throw AppError.conflict("Your account already has a role. Contact support to change it.");
  }
}
