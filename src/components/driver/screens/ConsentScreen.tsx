"use client";

import Link from "next/link";
import { Controller, useFormContext } from "react-hook-form";
import { ScreenHelper, ScreenQuestion } from "@/components/driver/screens/common";
import type {
  OnboardingFormValues,
  ScreenDefinition,
  ScreenFieldsProps,
} from "@/components/driver/screens/types";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { SMS_CONSENT_TEXT } from "@/lib/constants";
import { maskPhone } from "@/lib/phone";
import { consentScreenSchema } from "@/lib/validation/onboarding.schema";

function ConsentFields({ showQuestion, question, phone }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenQuestion show={showQuestion}>{question}</ScreenQuestion>
      <ScreenHelper>
        Shift offers come by text to {maskPhone(phone)}. You reply YES to claim one.
      </ScreenHelper>
      <Controller
        control={control}
        name="consent"
        render={({ field }) => (
          <ConsentCard
            id="sms-consent"
            checked={field.value === true}
            onCheckedChange={field.onChange}
            text={SMS_CONSENT_TEXT}
            error={errors.consent?.message}
          >
            See the{" "}
            <Link
              href="/sms-terms"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              SMS Terms
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Privacy Policy
            </Link>
            .
          </ConsentCard>
        )}
      />
    </>
  );
}

export const consentScreen: ScreenDefinition = {
  id: "consent",
  fields: ["consent"],
  schema: () => consentScreenSchema,
  // Always starts unchecked unless consent is already on record.
  defaults: (driver) => ({ consent: driver?.smsOptIn === true }),
  Fields: ConsentFields,
  nextLabel: () => "Agree and finish",
};
