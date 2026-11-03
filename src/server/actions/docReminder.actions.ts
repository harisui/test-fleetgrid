"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { DocReminderPreview } from "@/server/services/DocReminderService";
import type { NoticeBatch } from "@/types/domain";

/** The missing-documents reminder (CR-5): a driver id or none, and the typed SEND {N}. No text body. */

export async function previewDocReminderAction(input: unknown): Promise<Result<DocReminderPreview>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { docReminderService } = await getContainer();
    return docReminderService.preview(user.id, input);
  });
}

export async function sendDocReminderAction(input: unknown): Promise<Result<NoticeBatch>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { docReminderService } = await getContainer();
    const batch = await docReminderService.send(user.id, input);
    revalidatePath("/admin/drivers");
    revalidatePath("/admin/messaging", "layout");
    return batch;
  });
}
