"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { homePathFor, LOGIN_PATH } from "@/lib/auth/routes";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";

/** Sends a login code by SMS. Returns the normalized phone number. */
export async function requestOtpAction(input: unknown): Promise<Result<{ phone: string }>> {
  return runAction(async () => {
    const { authService } = await getContainer();
    return authService.requestOtp(input);
  });
}

/** Checks the code and starts the session. Returns where to go next. */
export async function verifyOtpAction(input: unknown): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const { authService } = await getContainer();
    const { redirectTo } = await authService.verifyOtp(input);
    return { redirectTo };
  });
}

/** Creates the profile for a newly verified user. */
export async function chooseRoleAction(input: unknown): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { profileService } = await getContainer();
    const profile = await profileService.createProfile(user, input);
    return { redirectTo: homePathFor(profile) };
  });
}

export async function signOutAction(): Promise<void> {
  const { authService } = await getContainer();
  await authService.signOut().catch(() => undefined);
  redirect(LOGIN_PATH);
}
