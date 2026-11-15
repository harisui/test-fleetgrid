"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import { requestContext } from "@/server/request-context";

/** The signed-in driver accepts the current Terms on the Terms page. */
export async function acceptDriverTermsAction(accepted: unknown): Promise<Result<null>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { termsService } = await getContainer();
    await termsService.accept(user.id, "gate", accepted, await requestContext());
    revalidatePath("/driver", "layout");
    return null;
  });
}

/** A driver accepts through a one-time link. No session: the link names the driver. */
export async function acceptTermsByLinkAction(token: unknown, accepted: unknown): Promise<Result<null>> {
  return runAction(async () => {
    const { termsService } = await getContainer();
    await termsService.acceptByLink(typeof token === "string" ? token : "", accepted, await requestContext());
    return null;
  });
}

/** Texts a fresh Terms link to every driver still waiting, or to one driver. */
export async function sendTermsLinksAction(driverId?: unknown): Promise<Result<{ sent: number; failed: number }>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { termsService } = await getContainer();
    const result = await termsService.sendLinks(user.id, typeof driverId === "string" ? driverId : undefined);
    revalidatePath("/admin", "layout");
    return result;
  });
}
