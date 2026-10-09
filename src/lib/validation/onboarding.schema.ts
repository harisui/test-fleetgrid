import { z } from "zod";
import {
  FULL_NAME_MAX_LENGTH,
  SERVICE_RADIUS_MAX_MILES,
  SERVICE_RADIUS_MIN_MILES,
  YEARS_EXPERIENCE_MAX,
} from "@/lib/constants";
import { normalizeEndorsements } from "@/lib/onboarding/options";
import type { SavableStepId } from "@/lib/onboarding/steps";
import {
  CDL_HELD_CLASSES,
  ENDORSEMENTS,
  EQUIPMENT_TYPES,
  MVR_STATUSES,
  TRANSMISSION_TYPES,
} from "@/types/domain";

/**
 * One schema per onboarding screen. Each screen saves on its own, so a driver can leave after
 * any page and resume there. Error messages say what to do, in plain words.
 */

const unique = <T>(values: T[]) => [...new Set(values)];

/** A whole number from a chip or a typed field. Blank is "missing", never zero. */
const wholeNumber = (options: { required: string; min: [number, string]; max: [number, string] }) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce
      .number({ error: options.required })
      .int("Enter a whole number")
      .min(...options.min)
      .max(...options.max),
  );

export const nameScreenSchema = z.object({
  fullName: z
    .string({ error: "Enter your name" })
    .trim()
    .min(2, "Enter your name")
    .max(FULL_NAME_MAX_LENGTH, `Name must be ${FULL_NAME_MAX_LENGTH} characters or fewer`),
});

export const ZIP_MESSAGE = "Enter a 5-digit ZIP code, like 60601";

/** Accepts "60601", "60601-1234", "60601 1234" and spaces. Keeps the first five digits. */
export function normalizeZip(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 9 ? digits.slice(0, 5) : digits;
}

export const zipSchema = z.preprocess(
  normalizeZip,
  z.string({ error: ZIP_MESSAGE }).regex(/^\d{5}$/, ZIP_MESSAGE),
);

/** Shown when five digits are typed that the bundled dataset does not know. */
export const ZIP_UNKNOWN_MESSAGE = "We could not find that ZIP. Check the number.";

/** The ZIP alone. City, state and coordinates come from the dataset on the server. */
export const zipScreenSchema = z.object({ zip: zipSchema });

export const distanceScreenSchema = z.object({
  serviceRadiusMiles: wholeNumber({
    required: "Pick how far you will travel",
    min: [SERVICE_RADIUS_MIN_MILES, `Distance must be at least ${SERVICE_RADIUS_MIN_MILES} miles`],
    max: [SERVICE_RADIUS_MAX_MILES, `Distance must be ${SERVICE_RADIUS_MAX_MILES} miles or less`],
  }),
});

export const CDL_CLASS_MESSAGE = "Pick your CDL class";
export const TRANSMISSION_MESSAGE = "Pick automatic only, or automatic and manual";
export const EQUIPMENT_MESSAGE = "Pick at least one kind of equipment";
export const TWIC_MESSAGE = "Tap Yes or No for the TWIC card";
export const MEDICAL_CARD_MESSAGE = "Tap Yes or No for the medical card";
export const MVR_MESSAGE = "Pick None, 1 or 2 minor, or 3 or more";

/** A yes-or-no chip answer. Only a real boolean counts; "true" or 1 is not a tap. */
const yesNo = (message: string) => z.boolean({ error: message });

/** A, B or C. FleetGrid lists CDL drivers only at launch, so "none" is not an answer here. */
export const cdlClassScreenSchema = z.object({
  cdlClass: z.enum(CDL_HELD_CLASSES, { error: CDL_CLASS_MESSAGE }),
});

export const experienceScreenSchema = z.object({
  yearsExperience: wholeNumber({
    required: "Pick how many years you have driven",
    min: [0, "Years cannot be negative"],
    max: [YEARS_EXPERIENCE_MAX, `Years must be ${YEARS_EXPERIENCE_MAX} or less`],
  }),
});

export const recordScreenSchema = z.object({
  mvrStatus: z.enum(MVR_STATUSES, { error: MVR_MESSAGE }),
});

export const credentialsScreenSchema = z.object({
  twicActive: yesNo(TWIC_MESSAGE),
  medicalCardActive: yesNo(MEDICAL_CARD_MESSAGE),
});

export const endorsementsScreenSchema = z.object({
  endorsements: z
    .array(z.enum(ENDORSEMENTS), { error: "Pick your endorsements, or None" })
    .default([])
    .transform(normalizeEndorsements),
});

export const transmissionScreenSchema = z.object({
  transmission: z.enum(TRANSMISSION_TYPES, { error: TRANSMISSION_MESSAGE }),
});

export const equipmentScreenSchema = z.object({
  equipmentTypes: z
    .array(z.enum(EQUIPMENT_TYPES), { error: EQUIPMENT_MESSAGE })
    .min(1, EQUIPMENT_MESSAGE)
    .transform(unique),
});

export const consentScreenSchema = z.object({
  consent: z.literal(true, { error: "Tap the box to agree before you finish" }),
});

export const SCREEN_SCHEMAS = {
  name: nameScreenSchema,
  zip: zipScreenSchema,
  distance: distanceScreenSchema,
  cdlClass: cdlClassScreenSchema,
  experience: experienceScreenSchema,
  record: recordScreenSchema,
  credentials: credentialsScreenSchema,
  endorsements: endorsementsScreenSchema,
  transmission: transmissionScreenSchema,
  equipment: equipmentScreenSchema,
  consent: consentScreenSchema,
} as const satisfies Record<SavableStepId, z.ZodType>;

export type NameScreenInput = z.infer<typeof nameScreenSchema>;
export type ZipScreenInput = z.infer<typeof zipScreenSchema>;
export type DistanceScreenInput = z.infer<typeof distanceScreenSchema>;
export type CdlClassScreenInput = z.infer<typeof cdlClassScreenSchema>;
export type ExperienceScreenInput = z.infer<typeof experienceScreenSchema>;
export type RecordScreenInput = z.infer<typeof recordScreenSchema>;
export type CredentialsScreenInput = z.infer<typeof credentialsScreenSchema>;
export type EndorsementsScreenInput = z.infer<typeof endorsementsScreenSchema>;
export type TransmissionScreenInput = z.infer<typeof transmissionScreenSchema>;
export type EquipmentScreenInput = z.infer<typeof equipmentScreenSchema>;
export type ConsentScreenInput = z.infer<typeof consentScreenSchema>;
