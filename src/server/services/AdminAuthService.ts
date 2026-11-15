import {
  ADMIN_SIGN_IN_MESSAGE,
  adminNameSchema,
  adminPasswordSchema,
  adminSignInSchema,
  TOTP_CODE_MESSAGE,
  totpCodeSchema,
} from "@/lib/validation/admin-auth.schema";
import { AppError, parseInput } from "@/server/errors/AppError";
import type { IAdminAuthRepository, TotpEnrollment } from "@/server/repositories/AdminAuthRepository";
import type { IAuthRepository } from "@/server/repositories/AuthRepository";
import type { IProfileRepository } from "@/server/repositories/ProfileRepository";

/**
 * Where an admin session stands (0039):
 * - "strong": signed in with a password and passed the authenticator step. The only state
 *   with admin access, here and in the database (admin_session_strong()).
 * - "needs-code": signed in with a password; the authenticator step comes next.
 * - "needs-password": signed in some other way (a phone code). It is signed out and sent to
 *   the email sign-in.
 */
export type AdminSessionLevel = "strong" | "needs-code" | "needs-password";

/** The second step: set up an authenticator the first time, then a code each sign-in. */
export type AdminVerifyState = { mode: "verify"; factorId: string } | { mode: "enroll" };

/**
 * The admin sign-in: email and password, then an authenticator app (user decision of
 * 2026-11-15). Drivers and carriers keep the phone code; an admin account gets no admin access
 * through it.
 */
export class AdminAuthService {
  constructor(
    private readonly auth: Pick<IAuthRepository, "getUser" | "signOut">,
    private readonly adminAuth: IAdminAuthRepository,
    private readonly profiles: Pick<IProfileRepository, "findById">,
  ) {}

  /** Email and password. Anything but an active admin account gets the same message. */
  async signIn(input: unknown): Promise<void> {
    const { email, password } = parseInput(adminSignInSchema, input);
    const refused = () => AppError.validation(ADMIN_SIGN_IN_MESSAGE, { password: ADMIN_SIGN_IN_MESSAGE });
    if (!(await this.adminAuth.signInWithPassword(email, password))) throw refused();
    const user = await this.auth.getUser();
    const profile = user ? await this.profiles.findById(user.id) : null;
    if (!profile || profile.role !== "admin" || profile.status === "blocked") {
      await this.auth.signOut().catch(() => undefined);
      throw refused();
    }
  }

  async sessionLevel(): Promise<AdminSessionLevel> {
    const { level, methods } = await this.adminAuth.assurance();
    if (!methods.includes("password")) return "needs-password";
    return level === "aal2" ? "strong" : "needs-code";
  }

  /** The second step for a password session: verify with the authenticator, or set one up. */
  async verifyState(): Promise<AdminVerifyState> {
    const [factor] = await this.adminAuth.verifiedTotpFactors();
    return factor ? { mode: "verify", factorId: factor.id } : { mode: "enroll" };
  }

  /** A new authenticator to scan; only before one is confirmed. */
  async startEnrollment(): Promise<TotpEnrollment> {
    if ((await this.sessionLevel()) === "needs-password") throw AppError.forbidden("Sign in with your email and password first");
    if ((await this.adminAuth.verifiedTotpFactors()).length > 0) {
      throw AppError.conflict("An authenticator app is already set up for this account");
    }
    return this.adminAuth.startTotpEnrollment();
  }

  /** The 6-digit code: finishes the set-up, or this sign-in. */
  async verifyCode(input: unknown): Promise<void> {
    if ((await this.sessionLevel()) === "needs-password") throw AppError.forbidden("Sign in with your email and password first");
    const { factorId, code } = parseInput(totpCodeSchema, input);
    if (!(await this.adminAuth.verifyTotp(factorId, code))) {
      throw AppError.validation(TOTP_CODE_MESSAGE, { code: "That code didn't work. Check your app and try the newest code." });
    }
  }

  /** How many authenticator apps the signed-in admin has confirmed. */
  async authenticatorCount(): Promise<number> {
    return (await this.adminAuth.verifiedTotpFactors()).length;
  }

  /** A new display name, from a strong session only. */
  async changeName(input: unknown): Promise<void> {
    await this.requireStrong();
    const { name } = parseInput(adminNameSchema, input);
    await this.adminAuth.updateName(name);
  }

  /** A new phone: a second authenticator to scan; the old one stays until the new one works. */
  async startReplacingAuthenticator(): Promise<TotpEnrollment> {
    await this.requireStrong();
    return this.adminAuth.startTotpEnrollment();
  }

  /** The new authenticator's code. Once it is confirmed, every other authenticator is removed. */
  async finishReplacingAuthenticator(input: unknown): Promise<void> {
    await this.requireStrong();
    const { factorId, code } = parseInput(totpCodeSchema, input);
    if (!(await this.adminAuth.verifyTotp(factorId, code))) {
      throw AppError.validation(TOTP_CODE_MESSAGE, { code: "That code didn't work. Check your app and try the newest code." });
    }
    for (const factor of await this.adminAuth.verifiedTotpFactors()) {
      if (factor.id !== factorId) await this.adminAuth.removeTotp(factor.id);
    }
  }

  private async requireStrong(): Promise<void> {
    if ((await this.sessionLevel()) !== "strong") throw AppError.forbidden("Sign in with your email and password first");
  }

  /** A new password, from a strong session only. */
  async changePassword(input: unknown): Promise<void> {
    await this.requireStrong();
    const { password } = parseInput(adminPasswordSchema, input);
    await this.adminAuth.updatePassword(password);
  }
}
