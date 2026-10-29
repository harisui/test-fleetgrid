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

/**
 * The shift-text box: on the lead screen (LeadScreen.tsx, with its own helper line) and, for
 * drivers who left it empty there, on the Finish page.
 */
export function ConsentFields({ question, helper, phone }: ScreenFieldsProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<OnboardingFormValues>();
  return (
    <>
      <ScreenQuestion>{question}</ScreenQuestion>
      <ScreenHelper>
        {helper ??
          `Shift offers come by text to ${maskPhone(phone)}. You reply YES to book one. This is optional: you can finish without it and turn texts on later from your profile.`}
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
            </Link>
            ,{" "}
            <Link
              href="/terms"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Terms of Service
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
  // The client's words for the last button (2026-10-09). The box above it is the agreement.
  nextLabel: () => "Find local shifts",
  // Asked once: a driver who ticked the box on the lead is not asked again (brief of 2026-10-28).
  skip: ({ driver }) => driver?.smsOptIn === true,
};
