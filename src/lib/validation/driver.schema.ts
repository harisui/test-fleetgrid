import { z } from "zod";
import {
  BIO_MAX_LENGTH,
  CERTIFICATION_MAX_LENGTH,
  CERTIFICATIONS_MAX_COUNT,
  FULL_NAME_MAX_LENGTH,
  SERVICE_RADIUS_DEFAULT_MILES,
  SERVICE_RADIUS_MAX_MILES,
  SERVICE_RADIUS_MIN_MILES,
  US_STATE_CODES,
  YEARS_EXPERIENCE_MAX,
} from "@/lib/constants";
import { normalizeEndorsements } from "@/lib/onboarding/options";
import { AVAILABILITY_TYPES, CDL_CLASSES, ENDORSEMENTS, OPERATOR_TYPES } from "@/types/domain";

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

// ---------------------------------------------------------------------------
// Step 1: basics
// ---------------------------------------------------------------------------
export const driverBasicsSchema = z.object({
  fullName: z
    .string({ error: "Enter your full name" })
    .trim()
    .min(2, "Enter your full name")
    .max(FULL_NAME_MAX_LENGTH, `Name must be ${FULL_NAME_MAX_LENGTH} characters or fewer`),
  city: optionalText(80, "City must be 80 characters or fewer"),
  state: z
    .string({ error: "Select your state" })
    .trim()
    .toUpperCase()
    .refine((value) => (US_STATE_CODES as readonly string[]).includes(value), "Select your state"),
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
// Step 2: role and licenses
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

export const driverLicensesSchema = z
  .object({
    operatorTypes: z
      .array(z.enum(OPERATOR_TYPES), { error: "Select at least one role" })
      .min(1, "Select at least one role")
      .transform(unique),
    cdlClass: z.enum(CDL_CLASSES, { error: "Select your CDL class" }),
    // The same letter rules as onboarding: X brings H and N, S brings P.
    endorsements: z.array(z.enum(ENDORSEMENTS)).default([]).transform(normalizeEndorsements),
    yearsExperience: wholeNumber({
      required: "Enter your years of experience",
      min: [0, "Experience cannot be negative"],
      max: [YEARS_EXPERIENCE_MAX, `Experience must be ${YEARS_EXPERIENCE_MAX} years or less`],
    }),
    certifications: certificationsSchema,
  })
  // Endorsements only apply to a CDL. Without one they are dropped, not rejected.
  .transform((value) => ({
    ...value,
    endorsements: value.cdlClass === "none" ? [] : value.endorsements,
  }));

// ---------------------------------------------------------------------------
// Step 3: availability
// ---------------------------------------------------------------------------
export const driverAvailabilitySchema = z.object({
  availability: z
    .array(z.enum(AVAILABILITY_TYPES), { error: "Select at least one option" })
    .min(1, "Select at least one option")
    .transform(unique),
  bio: optionalText(BIO_MAX_LENGTH, `Bio must be ${BIO_MAX_LENGTH} characters or fewer`),
});

// ---------------------------------------------------------------------------
// Step 5: SMS consent (required)
// ---------------------------------------------------------------------------
export const smsConsentSchema = z.object({
  consent: z.literal(true, { error: "You must agree to receive text messages to continue" }),
});

// ---------------------------------------------------------------------------
// Full card edit (profile page, after onboarding)
// ---------------------------------------------------------------------------
export const driverCardSchema = z
  .object({
    ...driverBasicsSchema.shape,
    ...driverLicensesSchema.in.shape,
    ...driverAvailabilitySchema.shape,
  })
  .transform((value) => ({
    ...value,
    endorsements: value.cdlClass === "none" ? [] : value.endorsements,
  }));

export type DriverBasicsInput = z.infer<typeof driverBasicsSchema>;
export type DriverLicensesInput = z.infer<typeof driverLicensesSchema>;
export type DriverAvailabilityInput = z.infer<typeof driverAvailabilitySchema>;
export type SmsConsentInput = z.infer<typeof smsConsentSchema>;
export type DriverCardInput = z.infer<typeof driverCardSchema>;

/** Raw form values, before validation. */
export type DriverBasicsFormValues = z.input<typeof driverBasicsSchema>;
export type DriverLicensesFormValues = z.input<typeof driverLicensesSchema>;
export type DriverAvailabilityFormValues = z.input<typeof driverAvailabilitySchema>;
export type DriverCardFormValues = z.input<typeof driverCardSchema>;
