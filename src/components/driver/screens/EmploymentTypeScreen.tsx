"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { EMPLOYMENT_HELPER, EMPLOYMENT_TYPE_OPTIONS } from "@/lib/onboarding/options";
import { employmentTypeScreenSchema } from "@/lib/validation/onboarding.schema";

function EmploymentTypeFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenHelper>{EMPLOYMENT_HELPER}</ScreenHelper>
      <Controller
        control={control}
        name="employmentType"
        render={({ field }) => (
          <OptionGroup
            label={question}
            labelHidden={!showQuestion}
            options={EMPLOYMENT_TYPE_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            error={errors.employmentType?.message}
          />
        )}
      />
    </>
  );
}

export const employmentTypeScreen: ScreenDefinition = {
  id: "employmentType",
  fields: ["employmentType"],
  schema: () => employmentTypeScreenSchema,
  defaults: (driver) => ({ employmentType: driver?.employmentType ?? undefined }),
  Fields: EmploymentTypeFields,
};
