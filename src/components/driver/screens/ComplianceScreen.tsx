"use client";

import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ChipGroup } from "@/components/shared/ChipGroup";
import { YesNoChips } from "@/components/shared/YesNoChips";
import {
  CARD_CHECKS,
  COMPLIANCE_HELPER,
  MVR_CHIPS,
  MVR_HELPER,
  MVR_QUESTION,
} from "@/lib/onboarding/options";
import { complianceScreenSchema } from "@/lib/validation/onboarding.schema";

/** CDL drivers only: FMCSA Clearinghouse registration and the MVR in three levels. */
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
        name="mvrStatus"
        render={({ field }) => (
          <ChipGroup
            label={MVR_QUESTION}
            description={MVR_HELPER}
            options={MVR_CHIPS}
            value={field.value}
            onChange={field.onChange}
            error={errors.mvrStatus?.message}
          />
        )}
      />
    </>
  );
}

export const complianceScreen: ScreenDefinition = {
  id: "compliance",
  fields: ["clearinghouseRegistered", "mvrStatus"],
  schema: () => complianceScreenSchema,
  defaults: (driver) => ({
    clearinghouseRegistered: driver?.clearinghouseRegistered ?? undefined,
    mvrStatus: driver?.mvrStatus ?? undefined,
  }),
  Fields: ComplianceFields,
};
