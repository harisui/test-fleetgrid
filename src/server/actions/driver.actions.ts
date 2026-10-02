"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { PreparedUpload } from "@/server/services/DocumentService";
import type { Driver, DriverDocument } from "@/types/domain";

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

/** Step 1 of an upload: validates the file details and returns a one-time upload token. */
export async function prepareDocumentUploadAction(input: unknown): Promise<Result<PreparedUpload>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { documentService } = await getContainer();
    return documentService.prepareUpload(user.id, input);
  });
}

/** Step 2 of an upload: checks the stored file and records it. */
export async function confirmDocumentUploadAction(input: unknown): Promise<Result<DriverDocument>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { documentService } = await getContainer();
    const document = await documentService.confirmUpload(user.id, input);
    revalidatePath("/driver", "layout");
    return document;
  });
}

/** A link to view one of the driver's own documents. It expires after 60 seconds. */
export async function getDocumentPreviewUrlAction(
  input: unknown,
): Promise<Result<{ url: string }>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { documentService } = await getContainer();
    return { url: await documentService.getPreviewUrl(user.id, input) };
  });
}

export async function deleteDocumentAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { documentService } = await getContainer();
    await documentService.delete(user.id, input);
    revalidatePath("/driver", "layout");
    return null;
  });
}
