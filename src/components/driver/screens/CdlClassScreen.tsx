"use client";

import { Controller, useFormContext } from "react-hook-form";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { CDL_CLASS_OPTIONS } from "@/lib/onboarding/options";
import { stepNumber } from "@/lib/onboarding/steps";
import { cdlClassScreenSchema } from "@/lib/validation/onboarding.schema";

/** Class A, B or C. FleetGrid lists CDL drivers only at launch, so there is no "No CDL". */
function CdlClassFields({ question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <Controller
      control={control}
      name="cdlClass"
      render={({ field }) => (
        <OptionGroup
          label={question}
          options={CDL_CLASS_OPTIONS}
          value={field.value}
          onChange={field.onChange}
          error={errors.cdlClass?.message}
        />
      )}
    />
  );
}

export const cdlClassScreen: ScreenDefinition = {
  id: "cdlClass",
  fields: ["cdlClass"],
  schema: () => cdlClassScreenSchema,
  defaults: (driver) => ({
    // "none" is the database default, not an answer. Nothing is selected until the driver picks.
    cdlClass:
      driver && driver.onboardingStep > stepNumber("cdlClass") && driver.cdlClass !== "none"
        ? driver.cdlClass
        : undefined,
  }),
  Fields: CdlClassFields,
};
