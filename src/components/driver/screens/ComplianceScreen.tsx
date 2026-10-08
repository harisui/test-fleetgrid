"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { YesNoChips } from "@/components/shared/YesNoChips";
import { CARD_CHECKS, COMPLIANCE_HELPER } from "@/lib/onboarding/options";
import { complianceScreenSchema } from "@/lib/validation/onboarding.schema";

/** CDL drivers only: FMCSA Clearinghouse registration and a clean MVR. */
function ComplianceFields({ showQuestion, question }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenQuestion show={showQuestion}>{question}</ScreenQuestion>
      <ScreenHelper>{COMPLIANCE_HELPER}</ScreenHelper>
      <Controller
        control={control}
        name="clearinghouseRegistered"
        render={({ field }) => (
          <YesNoChips
            label={CARD_CHECKS.clearinghouseRegistered.question}
            yes={CARD_CHECKS.clearinghouseRegistered.yes}
            no={CARD_CHECKS.clearinghouseRegistered.no}
            value={field.value}
            onChange={field.onChange}
            error={errors.clearinghouseRegistered?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="mvrClean3Years"
        render={({ field }) => (
          <YesNoChips
            label={CARD_CHECKS.mvrClean3Years.question}
            yes={CARD_CHECKS.mvrClean3Years.yes}
            no={CARD_CHECKS.mvrClean3Years.no}
            value={field.value}
            onChange={field.onChange}
            error={errors.mvrClean3Years?.message}
          />
        )}
      />
    </>
  );
}

export const complianceScreen: ScreenDefinition = {
  id: "compliance",
  fields: ["clearinghouseRegistered", "mvrClean3Years"],
  schema: () => complianceScreenSchema,
  defaults: (driver) => ({
    clearinghouseRegistered: driver?.clearinghouseRegistered ?? undefined,
    mvrClean3Years: driver?.mvrClean3Years ?? undefined,
  }),
  Fields: ComplianceFields,
};
