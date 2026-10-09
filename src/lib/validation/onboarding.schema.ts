import { z } from "zod";
import {
  BIO_MAX_LENGTH,
  CERTIFICATION_MAX_LENGTH,
  CERTIFICATIONS_MAX_COUNT,
  FULL_NAME_MAX_LENGTH,
  SERVICE_RADIUS_MAX_MILES,
  SERVICE_RADIUS_MIN_MILES,
  YEARS_EXPERIENCE_MAX,
} from "@/lib/constants";
import { normalizeEndorsements } from "@/lib/onboarding/options";
import type { SavableStepId } from "@/lib/onboarding/steps";
import {
  AVAILABILITY_TYPES,
  CDL_CLASSES,
  DRIVING_STYLES,
  EMPLOYMENT_TYPES,
  ENDORSEMENTS,
  EQUIPMENT_TYPES,
  MVR_STATUSES,
  OPERATOR_TYPES,
  TRANSMISSION_TYPES,
  type CdlClass,
  type OperatorType,
} from "@/types/domain";

/**
 * One schema per onboarding screen. Each screen saves on its own, so a driver can leave after
 * any question and resume there. Error messages say what to do, in plain words.
 */

const unique = <T>(values: T[]) => [...new Set(values)];

/** Empty or whitespace-only strings become null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => (value ? value : null));

/** A whole number from a chip, a stepper or a typed field. Blank is "missing", never zero. */
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

export const workTypeScreenSchema = z.object({
  operatorTypes: z
    .array(z.enum(OPERATOR_TYPES), { error: "Pick at least one kind of work" })
    .min(1, "Pick at least one kind of work")
    .transform(unique),
});

export const EMPLOYMENT_MESSAGE = "Pick W-2, 1099 or either";
export const DRIVING_STYLE_MESSAGE = "Pick at least one kind of driving";
export const TRANSMISSION_MESSAGE = "Pick automatic only, or automatic and manual";
export const EQUIPMENT_MESSAGE = "Pick at least one kind of equipment";
export const TWIC_MESSAGE = "Tap Yes or No for the TWIC card";
export const MEDICAL_CARD_MESSAGE = "Tap Yes or No for the medical card";
export const CLEARINGHOUSE_MESSAGE = "Tap Registered or Not yet";
export const MVR_MESSAGE = "Pick None, 1 or 2 minor, or 3 or more";

/** A yes-or-no chip answer. Only a real boolean counts; "true" or 1 is not a tap. */
const yesNo = (message: string) => z.boolean({ error: message });

export const employmentTypeScreenSchema = z.object({
  employmentType: z.enum(EMPLOYMENT_TYPES, { error: EMPLOYMENT_MESSAGE }),
});

export const drivingStyleScreenSchema = z.object({
  drivingStyles: z
    .array(z.enum(DRIVING_STYLES), { error: DRIVING_STYLE_MESSAGE })
    .min(1, DRIVING_STYLE_MESSAGE)
    .transform(unique),
});

export const equipmentScreenSchema = z.object({
  transmission: z.enum(TRANSMISSION_TYPES, { error: TRANSMISSION_MESSAGE }),
  equipmentTypes: z
    .array(z.enum(EQUIPMENT_TYPES), { error: EQUIPMENT_MESSAGE })
    .min(1, EQUIPMENT_MESSAGE)
    .transform(unique),
});

export const credentialsScreenSchema = z.object({
  twicActive: yesNo(TWIC_MESSAGE),
  medicalCardActive: yesNo(MEDICAL_CARD_MESSAGE),
});

export const complianceScreenSchema = z.object({
  clearinghouseRegistered: yesNo(CLEARINGHOUSE_MESSAGE),
  mvrStatus: z.enum(MVR_STATUSES, { error: MVR_MESSAGE }),
});

export const experienceScreenSchema = z.object({
  yearsExperience: wholeNumber({
    required: "Pick how many years you have done this work",
    min: [0, "Years cannot be negative"],
    max: [YEARS_EXPERIENCE_MAX, `Years must be ${YEARS_EXPERIENCE_MAX} or less`],
  }),
});

export const availabilityScreenSchema = z.object({
  availability: z
    .array(z.enum(AVAILABILITY_TYPES), { error: "Pick at least one option" })
    .min(1, "Pick at least one option")
    .transform(unique),
});

export const CDL_CONFLICT_MESSAGE =
  "CDL driver work needs a CDL. Pick your class, or change your work type.";

/** A driver who does CDL driver work cannot say they have no CDL. */
export function hasCdlConflict(
  operatorTypes: readonly OperatorType[],
  cdlClass: CdlClass | null | undefined,
): boolean {
  return operatorTypes.includes("cdl_driver") && cdlClass === "none";
}

export const cdlClassScreenSchema = z.object({
  cdlClass: z.enum(CDL_CLASSES, { error: "Pick your CDL class" }),
});

/** The CDL class screen, checked against the work types saved on the earlier screen. */
export function cdlClassScreenSchemaFor(operatorTypes: readonly OperatorType[]) {
  return cdlClassScreenSchema.refine((value) => !hasCdlConflict(operatorTypes, value.cdlClass), {
    message: CDL_CONFLICT_MESSAGE,
    path: ["cdlClass"],
  });
}

export const endorsementsScreenSchema = z.object({
  endorsements: z
    .array(z.enum(ENDORSEMENTS), { error: "Pick your endorsements, or None" })
    .default([])
    .transform(normalizeEndorsements),
});

export const certificationsScreenSchema = z.object({
  certifications: z
    .array(
      z
        .string()
        .trim()
        .min(1, "A certification cannot be blank")
        .max(
          CERTIFICATION_MAX_LENGTH,
          `Each certification must be ${CERTIFICATION_MAX_LENGTH} characters or fewer`,
        ),
    )
    .max(CERTIFICATIONS_MAX_COUNT, `Add up to ${CERTIFICATIONS_MAX_COUNT} certifications`)
    .default([])
    .transform((values) => {
      const seen = new Set<string>();
      return values.filter((value) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
});

/** Papers are saved by the document service as they are uploaded. This screen only records progress. */
export const documentsScreenSchema = z.object({});

export const bioScreenSchema = z.object({
  bio: optionalText(BIO_MAX_LENGTH, `Keep it to ${BIO_MAX_LENGTH} characters or fewer`),
});

export const consentScreenSchema = z.object({
  consent: z.literal(true, { error: "Tap the box to agree before you finish" }),
});

export const SCREEN_SCHEMAS = {
  name: nameScreenSchema,
  zip: zipScreenSchema,
  distance: distanceScreenSchema,
  workType: workTypeScreenSchema,
  employmentType: employmentTypeScreenSchema,
  drivingStyle: drivingStyleScreenSchema,
  equipment: equipmentScreenSchema,
  experience: experienceScreenSchema,
  availability: availabilityScreenSchema,
  cdlClass: cdlClassScreenSchema,
  endorsements: endorsementsScreenSchema,
  certifications: certificationsScreenSchema,
  credentials: credentialsScreenSchema,
  documents: documentsScreenSchema,
  compliance: complianceScreenSchema,
  bio: bioScreenSchema,
  consent: consentScreenSchema,
} as const satisfies Record<SavableStepId, z.ZodType>;

export type NameScreenInput = z.infer<typeof nameScreenSchema>;
export type ZipScreenInput = z.infer<typeof zipScreenSchema>;
export type DistanceScreenInput = z.infer<typeof distanceScreenSchema>;
export type WorkTypeScreenInput = z.infer<typeof workTypeScreenSchema>;
export type EmploymentTypeScreenInput = z.infer<typeof employmentTypeScreenSchema>;
export type DrivingStyleScreenInput = z.infer<typeof drivingStyleScreenSchema>;
export type EquipmentScreenInput = z.infer<typeof equipmentScreenSchema>;
export type CredentialsScreenInput = z.infer<typeof credentialsScreenSchema>;
export type ComplianceScreenInput = z.infer<typeof complianceScreenSchema>;
export type ExperienceScreenInput = z.infer<typeof experienceScreenSchema>;
export type AvailabilityScreenInput = z.infer<typeof availabilityScreenSchema>;
export type CdlClassScreenInput = z.infer<typeof cdlClassScreenSchema>;
export type EndorsementsScreenInput = z.infer<typeof endorsementsScreenSchema>;
export type CertificationsScreenInput = z.infer<typeof certificationsScreenSchema>;
export type BioScreenInput = z.infer<typeof bioScreenSchema>;
export type ConsentScreenInput = z.infer<typeof consentScreenSchema>;
