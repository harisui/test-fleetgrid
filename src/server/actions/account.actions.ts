"use server";

import { requireUser } from "@/lib/auth/guards";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";

/** Texts a deletion code to the signed-in person's number. Returns that number. */
export async function requestAccountCodeAction(): Promise<Result<{ phone: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { accountService } = await getContainer();
    return accountService.requestDeletionCode(user);
  });
}

/**
 * Deletes the signed-in person's own account, files included, once the code they were
 * texted checks out. Any role, any environment.
 */
export async function deleteMyAccountAction(
  input: unknown,
): Promise<Result<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { accountService } = await getContainer();
    await accountService.deleteOwnAccount(user, input);
    return { redirectTo: LOGIN_PATH };
  });
}
