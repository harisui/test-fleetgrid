"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { YesNoChips } from "@/components/shared/YesNoChips";
import { CARD_CHECKS, CREDENTIALS_HELPER } from "@/lib/onboarding/options";
import { credentialsScreenSchema } from "@/lib/validation/onboarding.schema";

/** Everyone: an active TWIC card and a current DOT medical card. */
function CredentialsFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenQuestion show={showQuestion}>{question}</ScreenQuestion>
      <ScreenHelper>{CREDENTIALS_HELPER}</ScreenHelper>
      <Controller
        control={control}
        name="twicActive"
        render={({ field }) => (
          <YesNoChips
            label={CARD_CHECKS.twicActive.question}
            value={field.value}
            onChange={field.onChange}
            error={errors.twicActive?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="medicalCardActive"
        render={({ field }) => (
          <YesNoChips
            label={CARD_CHECKS.medicalCardActive.question}
            value={field.value}
            onChange={field.onChange}
            error={errors.medicalCardActive?.message}
          />
        )}
      />
    </>
  );
}

export const credentialsScreen: ScreenDefinition = {
  id: "credentials",
  fields: ["twicActive", "medicalCardActive"],
  schema: () => credentialsScreenSchema,
  defaults: (driver) => ({
    twicActive: driver?.twicActive ?? undefined,
    medicalCardActive: driver?.medicalCardActive ?? undefined,
  }),
  Fields: CredentialsFields,
};
