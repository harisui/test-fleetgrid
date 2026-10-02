"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { Driver } from "@/types/domain";

/** Saves one onboarding step for the signed-in driver. Returns the updated card. */
export async function saveOnboardingStepAction(
  step: number,
  input: unknown,
): Promise<Result<Driver>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { driverService } = await getContainer();
    const driver = await driverService.saveStep(user.id, step, input);
    revalidatePath("/driver", "layout");
    return driver;
  });
}

/** Edits the whole card from the profile page. */
export async function updateCardAction(input: unknown): Promise<Result<Driver>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { driverService } = await getContainer();
    const driver = await driverService.updateCard(user.id, input);
    revalidatePath("/driver", "layout");
    return driver;
  });
}
