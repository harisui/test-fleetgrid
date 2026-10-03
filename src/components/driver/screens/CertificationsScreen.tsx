"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { CERTIFICATION_MAX_LENGTH, CERTIFICATIONS_MAX_COUNT } from "@/lib/constants";
import { CERTIFICATION_SUGGESTIONS } from "@/lib/onboarding/options";
import { certificationsScreenSchema } from "@/lib/validation/onboarding.schema";

const OPTIONS = CERTIFICATION_SUGGESTIONS.map((label) => ({ value: label, label }));

function CertificationsFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenHelper>Optional. Pick any you hold, or add your own.</ScreenHelper>
      <Controller
        control={control}
        name="certifications"
        render={({ field }) => (
          <ChipGroup
            multiple
            label={question}
            labelHidden={!showQuestion}
            options={OPTIONS}
            value={field.value ?? []}
            onChange={field.onChange}
            error={errors.certifications?.message}
            custom={{
              label: "Add another",
              fieldLabel: "Other certification",
              helper: `Press Add to keep it. Up to ${CERTIFICATIONS_MAX_COUNT} certifications.`,
              maxLength: CERTIFICATION_MAX_LENGTH,
              max: CERTIFICATIONS_MAX_COUNT,
            }}
          />
        )}
      />
    </>
  );
}

export const certificationsScreen: ScreenDefinition = {
  id: "certifications",
  fields: ["certifications"],
  schema: () => certificationsScreenSchema,
  defaults: (driver) => ({ certifications: driver?.certifications ?? [] }),
  Fields: CertificationsFields,
};
