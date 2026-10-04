"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { PreparedUpload } from "@/server/services/DocumentService";
import type { ZipLookup } from "@/server/services/ZipLookupService";
import type { DriverDocument, LocatedDriver } from "@/types/domain";

/** Saves one onboarding screen for the signed-in driver. Returns the updated card. */
export async function saveOnboardingScreenAction(
  stepId: unknown,
  input: unknown,
): Promise<Result<LocatedDriver>> {
  return runAction(async () => {
    const { user } = await requireRole("driver");
    const { driverService } = await getContainer();
    const driver = await driverService.saveScreen(user.id, stepId, input);
    revalidatePath("/driver", "layout");
    return driver;
  });
}

/**
 * City and state for a ZIP the driver typed, and whether it sits in a launch area, or null
 * when it is not a known US ZIP.
 */
export async function lookupZipAction(zip: unknown): Promise<Result<ZipLookup | null>> {
  return runAction(async () => {
    await requireRole("driver");
    const { zipLookupService } = await getContainer();
    return zipLookupService.lookup(zip);
  });
}

/** Edits the whole card from the profile page. */
export async function updateCardAction(input: unknown): Promise<Result<LocatedDriver>> {
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
