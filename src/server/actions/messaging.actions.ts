"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { SmsMessage } from "@/types/domain";

/** Sends a failed text again, once, after every check runs again on the server. */
export async function resendMessageAction(input: unknown): Promise<Result<SmsMessage>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { messagingService } = await getContainer();
    const message = await messagingService.resend(user.id, input);
    revalidatePath("/admin/messaging");
    return message;
  });
}
