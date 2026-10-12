import { z } from "zod";
import {
  COMPANY_NAME_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  SEARCH_RADIUS_DEFAULT_MILES,
  SEARCH_RADIUS_MAX_MILES,
  SEARCH_RADIUS_MIN_MILES,
  YEARS_EXPERIENCE_MAX,
} from "@/lib/constants";
import { zipSchema } from "@/lib/validation/onboarding.schema";
import { CDL_HELD_CLASSES, ENDORSEMENTS, EQUIPMENT_TYPES, MVR_STATUSES } from "@/types/domain";

/**
 * The carrier side: the company details form (sign-up and the account page), the Terms
 * checkbox, the driver search filters and the ids the pages pass around.
 */

/** A blank field, and the "any" choice of a filter dropdown, both mean "none". */
const blankToNull = (value: unknown) =>
  typeof value === "string" && (value.trim() === "" || value === "any") ? null : value;

/** An optional federal number: digits only, up to eight. Blank means none. */
const federalNumber = (label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^\d{1,8}$/, `${label} is digits only, up to 8`)
      .nullish()
      .transform((value) => value ?? null),
  );

export const COMPANY_NAME_MESSAGE = "Enter your company name";
export const CONTACT_NAME_MESSAGE = "Enter the name of the person we should contact";
export const BILLING_EMAIL_MESSAGE = "Enter a valid email for invoices";

export const carrierDetailsSchema = z.object({
  companyName: z
    .string({ error: COMPANY_NAME_MESSAGE })
    .trim()
    .min(2, COMPANY_NAME_MESSAGE)
    .max(COMPANY_NAME_MAX_LENGTH, `Company name must be ${COMPANY_NAME_MAX_LENGTH} characters or fewer`),
  contactName: z
    .string({ error: CONTACT_NAME_MESSAGE })
    .trim()
    .min(2, CONTACT_NAME_MESSAGE)
    .max(CONTACT_NAME_MAX_LENGTH, `Contact name must be ${CONTACT_NAME_MAX_LENGTH} characters or fewer`),
  billingEmail: z
    .string({ error: BILLING_EMAIL_MESSAGE })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: BILLING_EMAIL_MESSAGE })),
  usdot: federalNumber("USDOT number"),
  mc: federalNumber("MC number"),
  /** The yard ZIP. City, state and coordinates come from the dataset on the server. */
  zip: zipSchema,
});

export const TERMS_MESSAGE = "Check the box to accept the Terms of Service";

export const acceptTermsSchema = z.object({
  accepted: z.literal(true, { error: TERMS_MESSAGE }),
});

/** "true" and "false" from a URL or a form become booleans; anything else is "no filter". */
const optionalFlag = z.preprocess((value) => {
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return undefined;
}, z.boolean().optional());

const wholeNumber = (fallback: number) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? fallback : value),
    z.coerce.number().int(),
  );

/** One value or a list from a URL (`?endorsements=H&endorsements=T`) as a list. */
const list = <T extends string>(values: readonly [T, ...T[]]) =>
  z.preprocess(
    (value) => (value === undefined || value === null || value === "" ? [] : [value].flat()),
    z.array(z.enum(values)).transform((items) => [...new Set(items)]),
  );

export const driverSearchSchema = z.object({
  radiusMiles: wholeNumber(SEARCH_RADIUS_DEFAULT_MILES).pipe(
    z
      .number()
      .min(SEARCH_RADIUS_MIN_MILES, `Distance must be at least ${SEARCH_RADIUS_MIN_MILES} miles`)
      .max(SEARCH_RADIUS_MAX_MILES, `Distance must be ${SEARCH_RADIUS_MAX_MILES} miles or less`),
  ),
  /** The lowest class that will do: B matches A and B. */
  cdlClass: z.preprocess(blankToNull, z.enum(CDL_HELD_CLASSES).nullish()).transform(
    (value) => value ?? undefined,
  ),
  endorsements: list(ENDORSEMENTS),
  minYears: z.preprocess(
    (value) => blankToNull(value) ?? undefined,
    z.coerce.number().int().min(0).max(YEARS_EXPERIENCE_MAX).optional(),
  ),
  twicActive: optionalFlag,
  medicalCardActive: optionalFlag,
  /** True: the driver must drive a manual. */
  manualOnly: optionalFlag,
  equipmentTypes: list(EQUIPMENT_TYPES),
  /** The worst record that will do. */
  mvrMax: z.preprocess(blankToNull, z.enum(MVR_STATUSES).nullish()).transform(
    (value) => value ?? undefined,
  ),
  page: wholeNumber(1).pipe(z.number().min(1)),
});

export const driverIdSchema = z.object({
  driverId: z.uuid({ error: "Driver not found" }),
});

export type CarrierDetailsInput = z.infer<typeof carrierDetailsSchema>;
export type CarrierDetailsFormValues = z.input<typeof carrierDetailsSchema>;
export type AcceptTermsInput = z.infer<typeof acceptTermsSchema>;
export type DriverSearchInput = z.infer<typeof driverSearchSchema>;
export type DriverSearchFormValues = z.input<typeof driverSearchSchema>;
