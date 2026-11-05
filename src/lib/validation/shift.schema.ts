import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { YEARS_EXPERIENCE_MAX } from "@/lib/constants";
import { normalizeUsPhone } from "@/lib/phone";
import { SHIFT_TIME_ZONE } from "@/lib/shifts/texts";
import { zipSchema } from "@/lib/validation/onboarding.schema";
import { CDL_HELD_CLASSES, ENDORSEMENTS, EQUIPMENT_TYPES } from "@/types/domain";

/**
 * Posting a shift (T3.3). The date and times are Houston time, as the carrier types them; an
 * end at or before the start means the shift runs past midnight. What a shift asks for is
 * decision 3 of 2026-11-01: class, endorsements, years and equipment, and TWIC, medical card
 * and manual as optional checks. Pay is an optional line for My shifts, never in a text.
 */

export const SHIFT_DATE_MESSAGE = "Pick the date of the shift";
export const SHIFT_TIME_MESSAGE = "Enter a time, like 06:00";
export const SHIFT_START_PAST_MESSAGE = "The shift must start in the future";
export const WORK_MESSAGE = "Describe the work in at least 10 characters";
export const ONSITE_NAME_MESSAGE = "Enter who the driver should ask for on site";
export const SHIFT_OUTSIDE_AREA_MESSAGE = "This ZIP is outside the areas FleetGrid serves.";
export const ONSITE_PHONE_MESSAGE = "Enter a 10-digit US number for the on-site contact";

const checkbox = z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean());

const list = <T extends string>(values: readonly [T, ...T[]]) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? [] : [value].flat()),
    z.array(z.enum(values)).transform((items) => [...new Set(items)]),
  );

const time = z.string({ error: SHIFT_TIME_MESSAGE }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, SHIFT_TIME_MESSAGE);

export const shiftPostSchema = z
  .object({
    zip: zipSchema,
    date: z.string({ error: SHIFT_DATE_MESSAGE }).regex(/^\d{4}-\d{2}-\d{2}$/, SHIFT_DATE_MESSAGE),
    startTime: time,
    endTime: time,
    cdlClass: z.enum(CDL_HELD_CLASSES, { error: "Pick the CDL class the shift needs" }),
    endorsements: list(ENDORSEMENTS),
    minYears: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? 0 : value),
      z.coerce
        .number({ error: "Enter the years as a number" })
        .int("Enter whole years")
        .min(0, "Years cannot be negative")
        .max(YEARS_EXPERIENCE_MAX, `Years must be ${YEARS_EXPERIENCE_MAX} or less`),
    ),
    equipmentTypes: list(EQUIPMENT_TYPES),
    twicRequired: checkbox,
    medicalRequired: checkbox,
    manualRequired: checkbox,
    payText: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? null : value),
      z.string().trim().max(80, "Keep the pay line to 80 characters").nullish().transform((value) => value ?? null),
    ),
    workDescription: z
      .string({ error: WORK_MESSAGE })
      .trim()
      .min(10, WORK_MESSAGE)
      .max(500, "Keep the description to 500 characters"),
    onsiteContactName: z
      .string({ error: ONSITE_NAME_MESSAGE })
      .trim()
      .min(2, ONSITE_NAME_MESSAGE)
      .max(100, "Keep the name to 100 characters"),
    onsiteContactPhone: z
      .string({ error: ONSITE_PHONE_MESSAGE })
      .transform((value, context) => {
        const phone = normalizeUsPhone(value);
        if (!phone) {
          context.addIssue({ code: "custom", message: ONSITE_PHONE_MESSAGE });
          return z.NEVER;
        }
        return phone;
      }),
  })
  .transform((input) => {
    const startsAt = fromZonedTime(`${input.date}T${input.startTime}:00`, SHIFT_TIME_ZONE);
    let endsAt = fromZonedTime(`${input.date}T${input.endTime}:00`, SHIFT_TIME_ZONE);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    return { ...input, startsAt, endsAt };
  });

export type ShiftPostInput = z.infer<typeof shiftPostSchema>;
export type ShiftPostFormValues = z.input<typeof shiftPostSchema>;

export const RELEASE_REASONS = ["no_show", "twic_gate"] as const;
export type ReleaseReason = (typeof RELEASE_REASONS)[number];

export const releaseShiftSchema = z.object({
  shiftId: z.uuid({ error: "Shift not found" }),
  reason: z.enum(RELEASE_REASONS).default("no_show"),
});

export const shiftIdSchema = z.object({ shiftId: z.uuid({ error: "Shift not found" }) });

export const cancelShiftSchema = z.object({
  shiftId: z.uuid({ error: "Shift not found" }),
  reason: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(300, "Keep the reason to 300 characters").nullish().transform((value) => value ?? null),
  ),
});

/** The fake provider's "simulate a reply" control (local and previews only). */
export const simulateReplySchema = z.object({
  shiftId: z.uuid(),
  driverId: z.uuid(),
  body: z.string().trim().min(1, "Type a reply").max(160),
});
