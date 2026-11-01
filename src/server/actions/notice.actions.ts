"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { DriverChoice } from "@/server/repositories/NoticeRepository";
import type { NoticePreview } from "@/server/services/NoticeService";
import type { NoticeBatch } from "@/types/domain";

/**
 * Send notice (CR-3). None of these takes a text body: only the category and the choices
 * (validated by strict schemas), the typed SEND {N} and a driver search.
 */

export async function previewNoticeAction(choices: unknown): Promise<Result<NoticePreview>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { noticeService } = await getContainer();
    return noticeService.preview(user.id, choices);
  });
}

export async function sendNoticeAction(input: unknown): Promise<Result<NoticeBatch>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { noticeService } = await getContainer();
    const batch = await noticeService.send(user.id, input);
    revalidatePath("/admin/messaging", "layout");
    return batch;
  });
}

/** Search one driver by name or phone, for the security notice. Only names and masked numbers go back. */
export async function searchNoticeDriversAction(input: unknown): Promise<Result<(Omit<DriverChoice, "phone"> & { phoneLast4: string })[]>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { noticeService } = await getContainer();
    const drivers = await noticeService.searchDrivers(user.id, input);
    return drivers.map(({ phone, ...driver }) => ({ ...driver, phoneLast4: phone.slice(-4) }));
  });
}
