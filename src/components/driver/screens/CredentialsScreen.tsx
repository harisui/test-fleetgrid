"use client";

import { Controller, useFormContext, useWatch } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { FormField } from "@/components/shared/FormField";
import { YesNoChips } from "@/components/shared/YesNoChips";
import { Input } from "@/components/ui/input";
import { CARD_CHECKS, CREDENTIALS_HELPER } from "@/lib/onboarding/options";
import { credentialsScreenSchema } from "@/lib/validation/onboarding.schema";

/** An active TWIC card and a current DOT medical card. */
function CredentialsFields({ question }: ScreenFieldsProps) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  const twicActive = useWatch({ control, name: "twicActive" });
  return (
    <>
      <ScreenQuestion>{question}</ScreenQuestion>
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
      {twicActive === true && (
        <FormField label="TWIC expiry date" required error={errors.twicExpiresOn?.message} description="Self-reported. A TWIC counts for port shifts until this date.">
          <Input type="date" {...register("twicExpiresOn")} />
        </FormField>
      )}
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
  fields: ["twicActive", "twicExpiresOn", "medicalCardActive"],
  schema: () => credentialsScreenSchema,
  defaults: (driver) => ({
    twicActive: driver?.twicActive ?? undefined,
    twicExpiresOn: driver?.twicExpiresOn ?? "",
    medicalCardActive: driver?.medicalCardActive ?? undefined,
  }),
  Fields: CredentialsFields,
};
