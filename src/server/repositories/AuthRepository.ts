import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";
import type { SessionUser } from "@/types/domain";

interface AuthErrorLike {
  status?: number;
  code?: string;
  message: string;
}

export interface IAuthRepository {
  /** Sends a one-time code by SMS. Creates the auth user on first use. */
  sendOtp(phone: string): Promise<void>;
  /** Verifies the code and starts a session (cookies are set by the Supabase client). */
  verifyOtp(phone: string, code: string): Promise<SessionUser>;
  getUser(): Promise<SessionUser | null>;
  signOut(): Promise<void>;
}

/** Supabase stores phones without the leading plus. The app uses E.164 everywhere. */
export function toE164(phone: string): string {
  return phone.startsWith("+") ? phone : `+${phone}`;
}

/** Wraps Supabase Auth (phone OTP). */
export class AuthRepository extends BaseRepository implements IAuthRepository {
  async sendOtp(phone: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOtp({ phone });
    if (error) throw this.toAuthError(error, "phone", "We could not send a code to that number");
  }

  async verifyOtp(phone: string, code: string): Promise<SessionUser> {
    const { data, error } = await this.supabase.auth.verifyOtp({ phone, token: code, type: "sms" });
    if (error) throw this.toAuthError(error, "code", "That code is incorrect or has expired");
    if (!data.user?.phone) throw AppError.internal(new Error("verifyOtp returned no user"));
    return { id: data.user.id, phone: toE164(data.user.phone) };
  }

  async getUser(): Promise<SessionUser | null> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user?.phone) return null;
    return { id: data.user.id, phone: toE164(data.user.phone) };
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw AppError.internal(error);
  }

  private toAuthError(
    error: AuthErrorLike,
    field: "phone" | "code",
    invalidMessage: string,
  ): AppError {
    if (error.status === 429 || error.code?.includes("rate_limit")) {
      return new AppError(
        "RATE_LIMITED",
        "Too many attempts. Please wait a minute and try again.",
        {
          cause: error,
        },
      );
    }
    if (error.status !== undefined && error.status >= 400 && error.status < 500) {
      return new AppError("VALIDATION", invalidMessage, {
        cause: error,
        fieldErrors: { [field]: invalidMessage },
      });
    }
    return AppError.internal(error);
  }
}
