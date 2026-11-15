"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_VERIFY_PATH, ROLE_HOME } from "@/lib/auth/routes";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { AppError, runAction, type Result } from "@/server/errors/AppError";
import type { TotpEnrollment } from "@/server/repositories/AdminAuthRepository";

/** A signed-in admin account (any sign-in method): the second step works on these only. */
async function requireAdminAccount(): Promise<void> {
  const { authService } = await getContainer();
  const session = await authService.getSession();
  if (!session?.profile || session.profile.role !== "admin" || session.profile.status === "blocked") {
    throw AppError.forbidden("Sign in with your email and password first");
  }
}

/** Email and password (0039). The authenticator step comes next. */
export async function adminSignInAction(input: unknown): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const { adminAuthService } = await getContainer();
    await adminAuthService.signIn(input);
    return { redirectTo: ADMIN_VERIFY_PATH };
  });
}

/** The first sign-in: a new authenticator to scan. */
export async function startTotpEnrollmentAction(): Promise<Result<TotpEnrollment>> {
  return runAction(async () => {
    await requireAdminAccount();
    const { adminAuthService } = await getContainer();
    return adminAuthService.startEnrollment();
  });
}

/** The 6-digit code from the authenticator app. */
export async function verifyTotpAction(input: unknown): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    await requireAdminAccount();
    const { adminAuthService } = await getContainer();
    await adminAuthService.verifyCode(input);
    revalidatePath("/admin", "layout");
    return { redirectTo: ROLE_HOME.admin };
  });
}

/** A new display name, from a fully signed-in admin. */
export async function changeAdminNameAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    await requireAdmin();
    const { adminAuthService } = await getContainer();
    await adminAuthService.changeName(input);
    revalidatePath("/admin", "layout");
    return null;
  });
}

/** A new phone: the QR code for a second authenticator. */
export async function startReplacingAuthenticatorAction(): Promise<Result<TotpEnrollment>> {
  return runAction(async () => {
    await requireAdmin();
    const { adminAuthService } = await getContainer();
    return adminAuthService.startReplacingAuthenticator();
  });
}

/** The new authenticator's code; the old one is removed once it works. */
export async function finishReplacingAuthenticatorAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    await requireAdmin();
    const { adminAuthService } = await getContainer();
    await adminAuthService.finishReplacingAuthenticator(input);
    return null;
  });
}

/** A new password, from a fully signed-in admin. */
export async function changeAdminPasswordAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    await requireAdmin();
    const { adminAuthService } = await getContainer();
    await adminAuthService.changePassword(input);
    return null;
  });
}
