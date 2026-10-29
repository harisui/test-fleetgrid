"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { CLEARINGHOUSE_SELF_REPORT_TEXT } from "@/lib/onboarding/options";
import { clearinghouseScreenSchema } from "@/lib/validation/onboarding.schema";

/**
 * "Clearinghouse and SAP" (client brief of 2026-10-29): an optional, unchecked box with the
 * driver's own word. Continue with the box ticked saves a yes and its time; Skip, or Continue
 * without the tick, saves nothing. It never blocks the sign-up and never counts toward a
 * complete card. Not the profile page's "Registered in the Clearinghouse".
 */
function ClearinghouseFields({ question, helper }: ScreenFieldsProps) {
  const { control } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenQuestion>{question}</ScreenQuestion>
      {helper && <ScreenHelper>{helper}</ScreenHelper>}
      <Controller
        control={control}
        name="clearinghouseConfirmed"
        render={({ field }) => (
          <ConsentCard
            id="clearinghouse-self-report"
            checked={field.value === true}
            onCheckedChange={field.onChange}
            text={CLEARINGHOUSE_SELF_REPORT_TEXT}
          />
        )}
      />
    </>
  );
}

export const clearinghouseScreen: ScreenDefinition = {
  id: "clearinghouse",
  fields: ["clearinghouseConfirmed"],
  schema: () => clearinghouseScreenSchema,
  // Starts unchecked unless the driver already confirmed it.
  defaults: (driver) => ({ clearinghouseConfirmed: driver?.clearinghouseSelfReportedAt != null }),
  Fields: ClearinghouseFields,
  nextLabel: () => "Continue",
  secondaryAction: { label: "Skip", values: { clearinghouseConfirmed: false } },
};
