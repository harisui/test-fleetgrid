"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { Profile } from "@/types/domain";

/** Approves, blocks or reopens a driver's account. */
export async function setDriverStatusAction(input: unknown): Promise<Result<Profile>> {
  return runAction(async () => {
    const { user } = await requireRole("admin");
    const { adminService } = await getContainer();
    const profile = await adminService.setDriverStatus(user.id, input);
    revalidatePath("/admin", "layout");
    return profile;
  });
}
