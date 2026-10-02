import { homePathFor } from "@/lib/auth/routes";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/phone.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IAuthRepository } from "@/server/repositories/AuthRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";
import type { Profile, SessionUser } from "@/types/domain";

export interface VerifyOtpResult {
  user: SessionUser;
  profile: Profile | null;
  /** Where to send the user next. */
  redirectTo: string;
}

export class AuthService {
  constructor(
    private readonly auth: IAuthRepository,
    private readonly profiles: IProfileRepository,
  ) {}

  /** Validates and normalizes the phone, then sends a code. Returns the E.164 number. */
  async requestOtp(input: unknown): Promise<{ phone: string }> {
    const { phone } = parseInput(requestOtpSchema, input);

    await this.auth.sendOtp(phone);
    return { phone };
  }

  /** Verifies the code, starts the session and works out where the user goes next. */
  async verifyOtp(input: unknown): Promise<VerifyOtpResult> {
    const { phone, code } = parseInput(verifyOtpSchema, input);

    const user = await this.auth.verifyOtp(phone, code);
    const profile = await this.profiles.findById(user.id);

    if (profile?.status === "blocked") {
      await this.auth.signOut();
      throw AppError.forbidden("Your account has been blocked. Contact support for help.");
    }

    return { user, profile, redirectTo: homePathFor(profile) };
  }

  async getCurrentUser(): Promise<SessionUser | null> {
    return this.auth.getUser();
  }

  /** The signed-in user with their profile, or null when signed out. */
  async getSession(): Promise<{ user: SessionUser; profile: Profile | null } | null> {
    const user = await this.auth.getUser();
    if (!user) return null;
    return { user, profile: await this.profiles.findById(user.id) };
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
