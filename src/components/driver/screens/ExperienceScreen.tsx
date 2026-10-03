"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { Stepper } from "@/components/shared/Stepper";
import { YEARS_EXPERIENCE_MAX } from "@/lib/constants";
import { EXPERIENCE_CHIPS, experienceChipFor } from "@/lib/onboarding/options";
import { experienceScreenSchema } from "@/lib/validation/onboarding.schema";

function ExperienceFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <Controller
      control={control}
      name="yearsExperience"
      render={({ field }) => (
        <>
          <Controller
            control={control}
            name="yearsExperience"
            render={() => (
              <ChipGroup
                label={question}
                labelHidden={!showQuestion}
                options={EXPERIENCE_CHIPS}
                value={experienceChipFor(field.value) ?? undefined}
                onChange={field.onChange}
                error={errors.yearsExperience?.message}
              />
            )}
          />
          <Stepper
            label="Exact number (optional)"
            value={field.value ?? null}
            onChange={field.onChange}
            min={0}
            max={YEARS_EXPERIENCE_MAX}
            unit="years"
          />
          <ScreenHelper>Count all your years, including other companies.</ScreenHelper>
        </>
      )}
    />
  );
}

export const experienceScreen: ScreenDefinition = {
  id: "experience",
  fields: ["yearsExperience"],
  schema: () => experienceScreenSchema,
  defaults: (driver) => ({ yearsExperience: driver?.yearsExperience ?? null }),
  Fields: ExperienceFields,
};
