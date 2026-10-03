"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { OptionGroup } from "@/components/shared/OptionGroup";
import { WORK_TYPE_OPTIONS } from "@/lib/onboarding/options";
import { workTypeScreenSchema } from "@/lib/validation/onboarding.schema";

function WorkTypeFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenHelper>Pick all that apply. You can change this later.</ScreenHelper>
      <Controller
        control={control}
        name="operatorTypes"
        render={({ field }) => (
          <OptionGroup
            multiple
            label={question}
            labelHidden={!showQuestion}
            options={WORK_TYPE_OPTIONS}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.operatorTypes?.message}
          />
        )}
      />
    </>
  );
}

export const workTypeScreen: ScreenDefinition = {
  id: "workType",
  fields: ["operatorTypes"],
  schema: () => workTypeScreenSchema,
  defaults: (driver) => ({ operatorTypes: driver?.operatorTypes ?? [] }),
  Fields: WorkTypeFields,
};
