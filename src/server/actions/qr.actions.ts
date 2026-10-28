"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ANALYTICS_PATH } from "@/lib/admin/analytics-options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { QrLink } from "@/types/domain";

/** Makes a QR code for one flyer location. Returns the record; the sheet then shows the code. */
export async function createQrLinkAction(input: unknown): Promise<Result<QrLink>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { qrService } = await getContainer();
    const link = await qrService.createLink(user.id, input);
    revalidatePath(ADMIN_ANALYTICS_PATH);
    return link;
  });
}

/** Switches a code off or on. */
export async function setQrLinkActiveAction(input: unknown): Promise<Result<QrLink>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { qrService } = await getContainer();
    const link = await qrService.setActive(user.id, input);
    revalidatePath(ADMIN_ANALYTICS_PATH);
    return link;
  });
}
