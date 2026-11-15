"use client";

import Link from "next/link";
import { Controller, useFormContext } from "react-hook-form";
import { CdlStateField } from "@/components/driver/CdlStateField";
import { CdlClassFields } from "@/components/driver/screens/CdlClassScreen";
import { ConsentFields } from "@/components/driver/screens/ConsentScreen";
import { NameFields } from "@/components/driver/screens/NameScreen";
import type { OnboardingFormValues, ScreenDefinition, ScreenFieldsProps } from "@/components/driver/screens/types";
import { ZipFields, zipBlocked } from "@/components/driver/screens/ZipScreen";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { DRIVER_TERMS_STATEMENT } from "@/lib/legal/terms-acceptance";
import { leadScreenSchema } from "@/lib/validation/onboarding.schema";

const linkClass = "font-semibold text-foreground underline underline-offset-4";

/** The client's words for the lead's button (brief of 2026-10-28). */
export const LEAD_NEXT_LABEL = "Save and continue";

export const ZIP_QUESTION = "What is your ZIP code?";
export const CDL_CLASS_QUESTION = "What class is your CDL?";
export const CONSENT_QUESTION = "Can we text you about shifts?";
export const CDL_STATE_QUESTION = "CDL state";

/** The lead's default CDL state: FleetGrid launches in Texas (CR-5). */
export const DEFAULT_CDL_STATE = "TX";

/**
 * The first step after the code (Milestone 3 part 5): the name, the ZIP with the area note,
 * the CDL class and state (CR-5, default Texas) and the optional, unchecked shift-text box, on
 * one screen. Saving it creates
 * the card at once, the captured lead; everything else follows one page at a time.
 */
function LeadFields(props: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <NameFields {...props} />
      <ZipFields {...props} question={ZIP_QUESTION} />
      <CdlClassFields {...props} question={CDL_CLASS_QUESTION} />
      <CdlStateField control={control} name="cdlState" label={CDL_STATE_QUESTION} error={errors.cdlState?.message} />
      <ConsentFields {...props} question={CONSENT_QUESTION} helper="Optional. You can finish without it and turn texts on later from your profile." />
      {/* The Terms (Milestone 6): required and unchecked, recorded with the version when the card is saved. */}
      <Controller
        control={control}
        name="termsAccepted"
        render={({ field }) => (
          <ConsentCard
            id="terms-accepted"
            checked={field.value === true}
            onCheckedChange={field.onChange}
            text={DRIVER_TERMS_STATEMENT}
            error={errors.termsAccepted?.message}
          >
            Read the{" "}
            <Link href="/terms" className={linkClass} target="_blank" rel="noopener">
              Terms of Service
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className={linkClass} target="_blank" rel="noopener">
              Privacy Policy
            </Link>
            .
          </ConsentCard>
        )}
      />
    </>
  );
}

export const leadScreen: ScreenDefinition = {
  id: "lead",
  fields: ["fullName", "zip", "cdlClass", "cdlState", "consent", "termsAccepted"],
  schema: () => leadScreenSchema,
  defaults: (driver) => ({
    fullName: driver?.fullName ?? "",
    zip: driver?.zip ?? "",
    city: driver?.city ?? "",
    state: driver?.state ?? "",
    // "none" is the database default, not an answer. Nothing is selected until the driver picks.
    cdlClass: driver && driver.cdlClass !== "none" ? driver.cdlClass : undefined,
    cdlState: driver?.cdlState ?? DEFAULT_CDL_STATE,
    consent: driver?.smsOptIn === true,
    // Always asked unticked: ticking it again records nothing new for a version already accepted.
    termsAccepted: false,
  }),
  Fields: LeadFields,
  nextLabel: () => LEAD_NEXT_LABEL,
  // Five digits typed and no place for them: the dataset does not know the ZIP.
  blocked: zipBlocked,
};
