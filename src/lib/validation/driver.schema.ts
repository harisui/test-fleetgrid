import { z } from "zod";
import {
  BIO_MAX_LENGTH,
  CERTIFICATION_MAX_LENGTH,
  CERTIFICATIONS_MAX_COUNT,
  FULL_NAME_MAX_LENGTH,
  SERVICE_RADIUS_DEFAULT_MILES,
  SERVICE_RADIUS_MAX_MILES,
  SERVICE_RADIUS_MIN_MILES,
  YEARS_EXPERIENCE_MAX,
} from "@/lib/constants";
import { normalizeEndorsements } from "@/lib/onboarding/options";
import {
  CDL_CLASS_MESSAGE,
  EQUIPMENT_MESSAGE,
  MEDICAL_CARD_MESSAGE,
  MVR_MESSAGE,
  TRANSMISSION_MESSAGE,
  TWIC_MESSAGE,
} from "@/lib/validation/onboarding.schema";
import {
  AVAILABILITY_TYPES,
  CDL_HELD_CLASSES,
  DRIVING_STYLES,
  EMPLOYMENT_TYPES,
  ENDORSEMENTS,
  EQUIPMENT_TYPES,
  MVR_STATUSES,
  TRANSMISSION_TYPES,
} from "@/types/domain";

/**
 * The profile page edits the whole card. The answers sign-up asks are required here too; the
 * ones sign-up no longer asks (W-2 or 1099, driving style, Clearinghouse, availability,
 * certifications, about you) are optional, so a card straight out of sign-up saves as it is.
 */

/** Empty or whitespace-only strings become null. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => (value ? value : null));

/**
 * A whole number from a form field. Accepts numbers and numeric strings.
 * An empty field is "missing", never zero.
 */
const wholeNumber = (options: {
  required: string;
  min: [number, string];
  max: [number, string];
  fallback?: number;
}) =>
  z.preprocess(
    (value) => {
      const blank = value === "" || value === null || value === undefined;
      return blank ? options.fallback : value;
    },
    z.coerce
      .number({ error: options.required })
      .int("Enter a whole number")
      .min(...options.min)
      .max(...options.max),
  );

const unique = <T>(values: T[]) => [...new Set(values)];

export const EMPLOYMENT_MESSAGE = "Pick W-2, 1099 or either";
export const CLEARINGHOUSE_MESSAGE = "Tap Registered or Not yet";

/** A yes-or-no answer that may be left unanswered. */
const optionalYesNo = (message: string) =>
  z
    .boolean({ error: message })
    .nullish()
    .transform((value) => value ?? null);

// ---------------------------------------------------------------------------
// Basics. City, state and coordinates come from the dataset for the ZIP, never from the
// form (client decision of 2026-10-09).
// ---------------------------------------------------------------------------
export const driverBasicsSchema = z.object({
  fullName: z
    .string({ error: "Enter your full name" })
    .trim()
    .min(2, "Enter your full name")
    .max(FULL_NAME_MAX_LENGTH, `Name must be ${FULL_NAME_MAX_LENGTH} characters or fewer`),
  zip: z
    .string({ error: "Enter your ZIP code" })
    .trim()
    .regex(/^\d{5}$/, "Enter a 5-digit ZIP code"),
  serviceRadiusMiles: wholeNumber({
    required: "Enter your service radius",
    min: [SERVICE_RADIUS_MIN_MILES, `Radius must be at least ${SERVICE_RADIUS_MIN_MILES} miles`],
    max: [SERVICE_RADIUS_MAX_MILES, `Radius must be ${SERVICE_RADIUS_MAX_MILES} miles or less`],
    fallback: SERVICE_RADIUS_DEFAULT_MILES,
  }),
});

// ---------------------------------------------------------------------------
// CDL and licenses
// ---------------------------------------------------------------------------
const certificationsSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Certifications cannot be empty")
      .max(
        CERTIFICATION_MAX_LENGTH,
        `Each certification must be ${CERTIFICATION_MAX_LENGTH} characters or fewer`,
      ),
  )
  .max(CERTIFICATIONS_MAX_COUNT, `Add up to ${CERTIFICATIONS_MAX_COUNT} certifications`)
  .default([])
  .transform(unique);

export const driverLicensesSchema = z.object({
  cdlClass: z.enum(CDL_HELD_CLASSES, { error: CDL_CLASS_MESSAGE }),
  // The same letter rules as onboarding: X brings H and N, S brings P.
  endorsements: z.array(z.enum(ENDORSEMENTS)).default([]).transform(normalizeEndorsements),
  yearsExperience: wholeNumber({
    required: "Enter your years of experience",
    min: [0, "Experience cannot be negative"],
    max: [YEARS_EXPERIENCE_MAX, `Experience must be ${YEARS_EXPERIENCE_MAX} years or less`],
  }),
  employmentType: z
    .enum(EMPLOYMENT_TYPES, { error: EMPLOYMENT_MESSAGE })
    .nullish()
    .transform((value) => value ?? null),
  certifications: certificationsSchema,
});

// ---------------------------------------------------------------------------
// Equipment and checks
// ---------------------------------------------------------------------------
export const driverChecksSchema = z.object({
  drivingStyles: z.array(z.enum(DRIVING_STYLES)).default([]).transform(unique),
  transmission: z.enum(TRANSMISSION_TYPES, { error: TRANSMISSION_MESSAGE }),
  equipmentTypes: z
    .array(z.enum(EQUIPMENT_TYPES), { error: EQUIPMENT_MESSAGE })
    .min(1, EQUIPMENT_MESSAGE)
    .transform(unique),
  twicActive: z.boolean({ error: TWIC_MESSAGE }),
  medicalCardActive: z.boolean({ error: MEDICAL_CARD_MESSAGE }),
  clearinghouseRegistered: optionalYesNo(CLEARINGHOUSE_MESSAGE),
  mvrStatus: z.enum(MVR_STATUSES, { error: MVR_MESSAGE }),
});

// ---------------------------------------------------------------------------
// Availability and about you
// ---------------------------------------------------------------------------
export const driverAvailabilitySchema = z.object({
  availability: z.array(z.enum(AVAILABILITY_TYPES)).default([]).transform(unique),
  bio: optionalText(BIO_MAX_LENGTH, `Bio must be ${BIO_MAX_LENGTH} characters or fewer`),
});

// ---------------------------------------------------------------------------
// SMS consent (required)
// ---------------------------------------------------------------------------
export const smsConsentSchema = z.object({
  consent: z.literal(true, { error: "You must agree to receive text messages to continue" }),
});

// ---------------------------------------------------------------------------
// Full card edit (profile page, after onboarding)
// ---------------------------------------------------------------------------
export const driverCardSchema = z.object({
  ...driverBasicsSchema.shape,
  ...driverLicensesSchema.shape,
  ...driverChecksSchema.shape,
  ...driverAvailabilitySchema.shape,
});

export type DriverBasicsInput = z.infer<typeof driverBasicsSchema>;
export type DriverLicensesInput = z.infer<typeof driverLicensesSchema>;
export type DriverChecksInput = z.infer<typeof driverChecksSchema>;
export type DriverAvailabilityInput = z.infer<typeof driverAvailabilitySchema>;
export type SmsConsentInput = z.infer<typeof smsConsentSchema>;
export type DriverCardInput = z.infer<typeof driverCardSchema>;

/** Raw form values, before validation. */
export type DriverBasicsFormValues = z.input<typeof driverBasicsSchema>;
export type DriverLicensesFormValues = z.input<typeof driverLicensesSchema>;
export type DriverAvailabilityFormValues = z.input<typeof driverAvailabilitySchema>;
export type DriverCardFormValues = z.input<typeof driverCardSchema>;
