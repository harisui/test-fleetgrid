import type { Attribution } from "@/lib/attribution";
import { chooseRoleSchema } from "@/lib/validation/phone.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { Profile, SessionUser, SignupSource, UserRole } from "@/types/domain";

export interface ProfileServiceOptions {
  /** CARRIER_DISABLED=true: no new carrier profiles while the carrier side is switched off. */
  carrierDisabled?: boolean;
  /** Finds the QR code a utm_content names, so the sign-up can be tied to the flyer. */
  findQrLinkBySlug?: (slug: string) => Promise<{ id: string } | null>;
}

export class ProfileService {
  constructor(
    private readonly profiles: IProfileRepository,
    private readonly options: ProfileServiceOptions = {},
  ) {}

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
   * The attribution (the first-touch cookie) is kept on the profile; a utm_content that
   * names a QR code ties the sign-up to that flyer.
   */
  async createProfile(user: SessionUser, input: unknown, attribution: Attribution | null = null): Promise<Profile> {
    const { role } = parseInput(chooseRoleSchema, input);
    if (role === "carrier" && this.options.carrierDisabled) {
      throw AppError.validation("Carrier sign-up is not open yet", {
        role: "Carrier sign-up is not open yet. Choose Driver.",
      });
    }

    const existing = await this.profiles.findById(user.id);
    if (existing) return this.resolveExisting(existing, role);

    const source = await this.sourceFrom(attribution);
    try {
      return await this.profiles.create({ id: user.id, phone: user.phone, role, source });
    } catch (error) {
      // Two submissions raced. The first one won, so treat this like an existing profile.
      if (error instanceof AppError && error.code === "CONFLICT") {
        const winner = await this.profiles.findById(user.id);
        if (winner) return this.resolveExisting(winner, role);
      }
      throw error;
    }
  }

  private async sourceFrom(attribution: Attribution | null): Promise<Partial<SignupSource>> {
    if (!attribution) return {};
    let qrLinkId: string | null = null;
    if (attribution.utmContent && this.options.findQrLinkBySlug) {
      try {
        qrLinkId = (await this.options.findQrLinkBySlug(attribution.utmContent.toLowerCase()))?.id ?? null;
      } catch {
        // The sign-up must never fail over the attribution: keep the tags, lose the link.
        qrLinkId = null;
      }
    }
    return { ...attribution, qrLinkId };
  }

  private resolveExisting(existing: Profile, requestedRole: UserRole): Profile {
    if (existing.role === requestedRole) return existing;
    throw AppError.conflict("Your account already has a role. Contact support to change it.");
  }
}
