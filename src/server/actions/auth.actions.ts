"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ATTRIBUTION_COOKIE, parseAttribution } from "@/lib/attribution";
import { requireUser } from "@/lib/auth/guards";
import { clearPendingPhone, setPendingPhone } from "@/lib/auth/pending-phone";
import { homePathFor, LOGIN_PATH } from "@/lib/auth/routes";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";

/**
 * Sends a login code by SMS and keeps the number for the code screen in an httpOnly cookie,
 * never in the address. Returns the normalized phone number.
 */
export async function requestOtpAction(input: unknown): Promise<Result<{ phone: string }>> {
  return runAction(async () => {
    const { authService } = await getContainer();
    const result = await authService.requestOtp(input);
    await setPendingPhone(result.phone);
    return result;
  });
}

/** Checks the code and starts the session. Returns where to go next. */
export async function verifyOtpAction(input: unknown): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const { authService } = await getContainer();
    const { redirectTo } = await authService.verifyOtp(input);
    await clearPendingPhone();
    return { redirectTo };
  });
}

/** Creates the profile for a newly verified user, keeping where they came from, then clears that cookie. */
export async function chooseRoleAction(input: unknown): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { profileService } = await getContainer();
    const jar = await cookies();
    const attribution = parseAttribution(jar.get(ATTRIBUTION_COOKIE)?.value);
    const profile = await profileService.createProfile(user, input, attribution);
    if (attribution) jar.delete(ATTRIBUTION_COOKIE);
    return { redirectTo: homePathFor(profile) };
  });
}

export async function signOutAction(): Promise<void> {
  const { authService } = await getContainer();
  await authService.signOut().catch(() => undefined);
  redirect(LOGIN_PATH);
}
