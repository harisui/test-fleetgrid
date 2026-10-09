"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { EXPERIENCE_CHIPS, experienceChipFor } from "@/lib/onboarding/options";
import { experienceScreenSchema } from "@/lib/validation/onboarding.schema";

/** Five ranges, one tap. The lower bound of the range is what gets stored. */
function ExperienceFields({ question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <Controller
        control={control}
        name="yearsExperience"
        render={({ field }) => (
          <ChipGroup
            label={question}
            options={EXPERIENCE_CHIPS}
            value={experienceChipFor(field.value) ?? undefined}
            onChange={field.onChange}
            error={errors.yearsExperience?.message}
          />
        )}
      />
      <ScreenHelper>Count all your years, including other companies.</ScreenHelper>
    </>
  );
}

export const experienceScreen: ScreenDefinition = {
  id: "experience",
  fields: ["yearsExperience"],
  schema: () => experienceScreenSchema,
  defaults: (driver) => ({ yearsExperience: driver?.yearsExperience ?? null }),
  Fields: ExperienceFields,
};
