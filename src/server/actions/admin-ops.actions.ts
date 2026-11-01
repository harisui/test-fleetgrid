"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { runAction, type Result } from "@/server/errors/AppError";
import type { AreaPreview } from "@/server/services/AdminOpsService";
import type { Profile, ServiceArea } from "@/types/domain";

type CarrierChange = "approveCarrier" | "blockCarrier" | "reopenCarrier";

async function carrierChange(method: CarrierChange, input: unknown): Promise<Result<Profile>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    const profile = await adminOpsService[method](user.id, input);
    revalidatePath("/admin/carriers");
    return profile;
  });
}

export async function approveCarrierAction(input: unknown): Promise<Result<Profile>> {
  return carrierChange("approveCarrier", input);
}

export async function blockCarrierAction(input: unknown): Promise<Result<Profile>> {
  return carrierChange("blockCarrier", input);
}

export async function reopenCarrierAction(input: unknown): Promise<Result<Profile>> {
  return carrierChange("reopenCarrier", input);
}

/** Deletes a driver's or carrier's account for good (typed REMOVE to confirm). */
export async function removeAccountAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    await adminOpsService.removeAccount(user.id, input);
    revalidatePath("/admin", "layout");
    return null;
  });
}

export async function pauseDriverAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    await adminOpsService.setDriverPaused(user.id, input, true);
    revalidatePath("/admin/drivers");
    return null;
  });
}

export async function unpauseDriverAction(input: unknown): Promise<Result<null>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    await adminOpsService.setDriverPaused(user.id, input, false);
    revalidatePath("/admin/drivers");
    return null;
  });
}

export async function previewAreaAction(input: unknown): Promise<Result<AreaPreview>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    return adminOpsService.previewArea(user.id, input);
  });
}

export async function createAreaAction(input: unknown): Promise<Result<ServiceArea>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    const area = await adminOpsService.createArea(user.id, input);
    revalidatePath("/admin/service-areas");
    return area;
  });
}

export async function updateAreaAction(input: unknown): Promise<Result<ServiceArea>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    const area = await adminOpsService.updateArea(user.id, input);
    revalidatePath("/admin/service-areas");
    return area;
  });
}

export async function setAreaActiveAction(input: unknown): Promise<Result<ServiceArea>> {
  return runAction(async () => {
    const { user } = await requireAdmin();
    const { adminOpsService } = await getContainer();
    const area = await adminOpsService.setAreaActive(user.id, input);
    revalidatePath("/admin/service-areas");
    return area;
  });
}
