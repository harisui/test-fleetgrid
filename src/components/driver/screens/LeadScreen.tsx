"use client";

import { useFormContext } from "react-hook-form";
import { CdlStateField } from "@/components/driver/CdlStateField";
import { CdlClassFields } from "@/components/driver/screens/CdlClassScreen";
import { ConsentFields } from "@/components/driver/screens/ConsentScreen";
import { NameFields } from "@/components/driver/screens/NameScreen";
import type { OnboardingFormValues, ScreenDefinition, ScreenFieldsProps } from "@/components/driver/screens/types";
import { ZipFields, zipBlocked } from "@/components/driver/screens/ZipScreen";
import { leadScreenSchema } from "@/lib/validation/onboarding.schema";

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
    </>
  );
}

export const leadScreen: ScreenDefinition = {
  id: "lead",
  fields: ["fullName", "zip", "cdlClass", "cdlState", "consent"],
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
  }),
  Fields: LeadFields,
  nextLabel: () => LEAD_NEXT_LABEL,
  // Five digits typed and no place for them: the dataset does not know the ZIP.
  blocked: zipBlocked,
};
