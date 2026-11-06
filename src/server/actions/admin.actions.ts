"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_DRIVERS_PATH } from "@/lib/admin/options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { Profile } from "@/types/domain";

type Change = "approveDriver" | "blockDriver" | "reopenDriver" | "markDriverReviewed" | "markDriverForRereview";

async function change(method: Change, input: unknown): Promise<Result<Profile>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminService } = await getContainer();
    const profile = await adminService[method](user.id, input);
    revalidatePath(ADMIN_DRIVERS_PATH);
    return profile;
  });
}

/** Lists the driver to subscribed carriers. Refused while their card is not finished. */
export async function approveDriverAction(input: unknown): Promise<Result<Profile>> {
  return change("approveDriver", input);
}

/** Hides the driver from carriers and signs them out at their next request. */
export async function blockDriverAction(input: unknown): Promise<Result<Profile>> {
  return change("blockDriver", input);
}

/** Back to the review queue. */
/** Clears Re-review needed on a Roster-Ready driver. No text goes out. */
export async function markDriverReviewedAction(input: unknown): Promise<Result<Profile>> {
  return change("markDriverReviewed", input);
}

/** Brings Re-review needed back on a Roster-Ready driver. No text goes out. */
export async function markDriverForRereviewAction(input: unknown): Promise<Result<Profile>> {
  return change("markDriverForRereview", input);
}

export async function reopenDriverAction(input: unknown): Promise<Result<Profile>> {
  return change("reopenDriver", input);
}
