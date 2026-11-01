"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { CDL_HELD_CLASSES, ENDORSEMENTS, EQUIPMENT_TYPES, type Shift } from "@/types/domain";
import { simulateReplySchema } from "@/lib/validation/shift.schema";
import { buildTextingServices, getContainer, smsProviderKind } from "@/server/container";
import { AppError, parseInput, runAction, type Result } from "@/server/errors/AppError";
import type { InboundResult } from "@/server/services/InboundService";
import type { PostedShift } from "@/server/services/ShiftService";
import { z } from "zod";

/** Posts the shift and broadcasts it, or holds it for 7 AM. */
export async function postShiftAction(input: unknown): Promise<Result<PostedShift>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { shiftService } = await getContainer();
    const posted = await shiftService.postShift(user.id, input);
    revalidatePath("/carrier/shifts");
    return posted;
  });
}

const countSchema = z.object({
  zip: z.string().regex(/^\d{5}$/),
  cdlClass: z.enum(CDL_HELD_CLASSES).catch("A"),
  endorsements: z.array(z.enum(ENDORSEMENTS)).catch([]),
  minYears: z.coerce.number().int().min(0).max(60).catch(0),
  equipmentTypes: z.array(z.enum(EQUIPMENT_TYPES)).catch([]),
  twicRequired: z.boolean().catch(false),
  medicalRequired: z.boolean().catch(false),
  manualRequired: z.boolean().catch(false),
});

/** "N drivers match" while the form is filled in. */
export async function countShiftMatchesAction(input: unknown): Promise<Result<number>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const parsed = countSchema.safeParse(input);
    if (!parsed.success) throw AppError.validation();
    const { shiftService } = await getContainer();
    return shiftService.countMatches(user.id, parsed.data);
  });
}

export async function cancelShiftAction(input: unknown): Promise<Result<Shift>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { shiftService } = await getContainer();
    const shift = await shiftService.cancelShift(user.id, input);
    revalidatePath("/carrier/shifts", "layout");
    return shift;
  });
}

/** The booked driver did not show: count it, reopen and send the shift again. */
export async function releaseShiftAction(input: unknown): Promise<Result<PostedShift>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    const { shiftService } = await getContainer();
    const posted = await shiftService.releaseShift(user.id, input);
    revalidatePath("/carrier/shifts", "layout");
    return posted;
  });
}

/** The fake sender's "reply as a driver" (local and previews only). */
export async function simulateReplyAction(input: unknown): Promise<Result<InboundResult>> {
  return runAction(async () => {
    const { user } = await requireRole("carrier");
    if (smsProviderKind() !== "fake") throw AppError.forbidden("Only in test mode");
    const { shiftId, driverId, body } = parseInput(simulateReplySchema, input);
    const { shiftService } = await getContainer();
    const detail = await shiftService.getCarrierShift(user.id, { shiftId });
    if (!detail.recipients.some((recipient) => recipient.driverId === driverId)) throw AppError.notFound();
    const { inboundService, drivers } = buildTextingServices();
    const driver = await drivers.findById(driverId);
    if (!driver) throw AppError.notFound();
    const result = await inboundService.handle({
      sid: `SMsim${randomUUID().replaceAll("-", "")}`,
      from: driver.phone,
      to: "fake",
      body,
    });
    revalidatePath(`/carrier/shifts/${shiftId}`);
    return result;
  });
}
