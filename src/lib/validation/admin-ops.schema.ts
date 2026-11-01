import { z } from "zod";
import { zipSchema } from "@/lib/validation/onboarding.schema";

/** The admin's Milestone 3 pages: carriers, shifts, service areas, driver pause and removal. */

export const carrierIdSchema = z.object({ carrierId: z.uuid({ error: "Carrier not found" }) });
export const areaIdSchema = z.object({ areaId: z.uuid({ error: "Area not found" }) });

export const CARRIER_FILTERS = ["", "subscribed", "unpaid", "blocked"] as const;
export const SHIFT_FILTERS = ["", "open", "booked", "cancelled", "expired"] as const;

const blank = (value: unknown) => (value === undefined || value === null ? "" : value);
const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const adminCarriersQuerySchema = z.object({
  status: z.preprocess((v) => blank(first(v)), z.enum(CARRIER_FILTERS).catch("")),
  open: z.preprocess(first, z.uuid().optional().catch(undefined)),
});

export const adminShiftsQuerySchema = z.object({
  status: z.preprocess((v) => blank(first(v)), z.enum(SHIFT_FILTERS).catch("")),
  open: z.preprocess(first, z.uuid().optional().catch(undefined)),
});

export const AREA_NAME_MESSAGE = "Name the area, like Houston, TX";
export const AREA_RADIUS_MESSAGE = "The radius is 5 to 250 miles";

export const serviceAreaSchema = z.object({
  name: z.string({ error: AREA_NAME_MESSAGE }).trim().min(2, AREA_NAME_MESSAGE).max(80, "Keep the name to 80 characters"),
  centerZip: zipSchema,
  radiusMiles: z.coerce
    .number({ error: AREA_RADIUS_MESSAGE })
    .int(AREA_RADIUS_MESSAGE)
    .min(5, AREA_RADIUS_MESSAGE)
    .max(250, AREA_RADIUS_MESSAGE),
});

export const areaPreviewSchema = serviceAreaSchema.pick({ centerZip: true, radiusMiles: true });

export const updateAreaSchema = serviceAreaSchema.extend({ areaId: z.uuid({ error: "Area not found" }) });

export const areaActiveSchema = z.object({ areaId: z.uuid({ error: "Area not found" }), isActive: z.boolean() });

export const removeAccountSchema = z.object({
  profileId: z.uuid({ error: "Account not found" }),
  confirm: z.literal("REMOVE", { error: "Type REMOVE to confirm" }),
});

export type AdminCarriersQuery = z.infer<typeof adminCarriersQuerySchema>;
export type AdminShiftsQuery = z.infer<typeof adminShiftsQuerySchema>;
export type ServiceAreaFormValues = z.input<typeof serviceAreaSchema>;
