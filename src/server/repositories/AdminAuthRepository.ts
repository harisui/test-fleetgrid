import { AppError } from "@/server/errors/AppError";
import { BaseRepository } from "@/server/repositories/BaseRepository";

/** How the current session signed in, as Supabase Auth reports it. */
export interface SessionAssurance {
  /** "aal2" once the authenticator step passed in this session. */
  level: "aal1" | "aal2" | null;
  /** The ways this session proved who it is, for example ["password", "totp"] or ["otp"]. */
  methods: string[];
}

export interface TotpFactor {
  id: string;
  friendlyName: string | null;
}

export interface TotpEnrollment {
  factorId: string;
  /** An SVG image as a data URL, to scan with the authenticator app. */
  qrCode: string;
  /** The same key as text, for typing in by hand. */
  secret: string;
}

export interface IAdminAuthRepository {
  /** Starts a session with email and password. False when they do not match. */
  signInWithPassword(email: string, password: string): Promise<boolean>;
  assurance(): Promise<SessionAssurance>;
  /** The authenticator apps this account has confirmed. */
  verifiedTotpFactors(): Promise<TotpFactor[]>;
  /** A new authenticator to scan; any half-finished one is removed first. */
  startTotpEnrollment(): Promise<TotpEnrollment>;
  /** Checks a code against an authenticator. False when it is wrong or expired. */
  verifyTotp(factorId: string, code: string): Promise<boolean>;
  /** Sets a new password for the signed-in account (needs the authenticator step). */
  updatePassword(password: string): Promise<void>;
  /** The display name kept on the sign-in account. */
  updateName(name: string): Promise<void>;
  /** Removes one authenticator from the signed-in account. */
  removeTotp(factorId: string): Promise<void>;
}

const TOTP_NAME = "FleetGrid admin";

/** Supabase Auth's password and multi-factor calls, for the admin sign-in (0039). */
export class AdminAuthRepository extends BaseRepository implements IAdminAuthRepository {
  async signInWithPassword(email: string, password: string): Promise<boolean> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (!error) return true;
    if (error.status === 429 || error.code?.includes("rate_limit")) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.", { cause: error });
    }
    if (error.status !== undefined && error.status >= 400 && error.status < 500) return false;
    throw AppError.internal(error);
  }

  async assurance(): Promise<SessionAssurance> {
    const { data, error } = await this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw AppError.internal(error);
    const level = data.currentLevel;
    return {
      level: level === "aal1" ? "aal1" : level === "aal2" ? "aal2" : null,
      // Entries are objects ({ method }) or, on some versions, bare method names.
      methods: (data.currentAuthenticationMethods ?? []).map((entry) => (typeof entry === "string" ? entry : entry.method)),
    };
  }

  async verifiedTotpFactors(): Promise<TotpFactor[]> {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error) throw AppError.internal(error);
    return data.totp.map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? null }));
  }

  async startTotpEnrollment(): Promise<TotpEnrollment> {
    const { data: factors, error: listError } = await this.supabase.auth.mfa.listFactors();
    if (listError) throw AppError.internal(listError);
    for (const factor of factors.all) {
      if (factor.factor_type === "totp" && factor.status !== "verified") {
        await this.supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
    }
    // Labels must differ per account: a replacement sits beside the old one until it is confirmed.
    const friendlyName = `${TOTP_NAME} ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
    const { data, error } = await this.supabase.auth.mfa.enroll({ factorType: "totp", friendlyName, issuer: "FleetGrid" });
    if (error) throw AppError.internal(error);
    return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }

  async verifyTotp(factorId: string, code: string): Promise<boolean> {
    const { error } = await this.supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (!error) return true;
    if (error.status === 429 || error.code?.includes("rate_limit")) {
      throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a minute and try again.", { cause: error });
    }
    if (error.status !== undefined && error.status >= 400 && error.status < 500) return false;
    throw AppError.internal(error);
  }

  async updateName(name: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ data: { full_name: name } });
    if (error) throw AppError.internal(error);
  }

  async removeTotp(factorId: string): Promise<void> {
    const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
    if (error) throw AppError.internal(error);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) {
      if (error.code === "weak_password" || error.code === "same_password") {
        throw AppError.validation(error.message, { password: error.message });
      }
      throw AppError.internal(error);
    }
  }
}
