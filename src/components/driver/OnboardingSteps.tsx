"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Controller } from "react-hook-form";
import { z } from "zod";
import { AvailabilityFields, BasicsFields, LicensesFields } from "@/components/driver/CardFields";
import { useStepForm } from "@/components/driver/useStepForm";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SERVICE_RADIUS_DEFAULT_MILES, SMS_CONSENT_TEXT } from "@/lib/constants";
import {
  driverAvailabilitySchema,
  driverBasicsSchema,
  driverLicensesSchema,
  smsConsentSchema,
} from "@/lib/validation/driver.schema";
import type { Result } from "@/server/errors/AppError";
import type { Driver } from "@/types/domain";

export interface StepProps {
  /** The saved card so far, or null before step 1 is saved. */
  driver: Driver | null;
  /** Saves this step's values. The stepper moves on when it succeeds. */
  onSave: (values: unknown) => Promise<Result<unknown>>;
  /** Goes to the previous step. Absent on the first step. */
  onBack?: () => void;
}

function StepActions({
  pending,
  onBack,
  label = "Next",
}: {
  pending: boolean;
  onBack?: () => void;
  label?: string;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && (
        <Button type="button" variant="outline" size="touch" onClick={onBack} disabled={pending}>
          Back
        </Button>
      )}
      <LoadingButton
        type="submit"
        size="touch"
        className="flex-1"
        loading={pending}
        loadingText="Saving..."
      >
        {label}
      </LoadingButton>
    </div>
  );
}

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="border-destructive/60 bg-destructive/15 rounded-md border p-3 text-sm"
    >
      {message}
    </p>
  );
}

function StepForm({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {children}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 1: basics
// ---------------------------------------------------------------------------
export function BasicsStep({ driver, onSave }: StepProps) {
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: driverBasicsSchema,
    defaultValues: {
      fullName: driver?.fullName ?? "",
      city: driver?.city ?? "",
      state: driver?.state ?? "",
      zip: driver?.zip ?? "",
      serviceRadiusMiles: driver?.serviceRadiusMiles ?? SERVICE_RADIUS_DEFAULT_MILES,
    },
    onSave,
  });

  return (
    <StepForm onSubmit={submit}>
      <BasicsFields
        control={form.control}
        register={form.register}
        errorOf={errorOf}
        disabled={pending}
      />
      <FormError message={formError} />
      <StepActions pending={pending} />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------
// Step 2: role and licenses
// ---------------------------------------------------------------------------
export function LicensesStep({ driver, onSave, onBack }: StepProps) {
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: driverLicensesSchema,
    defaultValues: {
      operatorTypes: driver?.operatorTypes ?? [],
      // No default class until the driver has answered once.
      cdlClass: driver && driver.operatorTypes.length > 0 ? driver.cdlClass : undefined,
      endorsements: driver?.endorsements ?? [],
      yearsExperience: driver?.yearsExperience ?? undefined,
      certifications: driver?.certifications ?? [],
    },
    onSave,
  });
  const cdlClass = form.watch("cdlClass") ?? "none";

  return (
    <StepForm onSubmit={submit}>
      <LicensesFields
        control={form.control}
        register={form.register}
        errorOf={errorOf}
        disabled={pending}
        cdlClass={cdlClass}
      />
      <FormError message={formError} />
      <StepActions pending={pending} onBack={onBack} />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------
// Step 3: availability
// ---------------------------------------------------------------------------
export function AvailabilityStep({ driver, onSave, onBack }: StepProps) {
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: driverAvailabilitySchema,
    defaultValues: {
      availability: driver?.availability ?? [],
      bio: driver?.bio ?? "",
    },
    onSave,
  });
  const bioLength = (form.watch("bio") ?? "").length;

  return (
    <StepForm onSubmit={submit}>
      <AvailabilityFields
        control={form.control}
        register={form.register}
        errorOf={errorOf}
        disabled={pending}
        bioLength={bioLength}
      />
      <FormError message={formError} />
      <StepActions pending={pending} onBack={onBack} />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------
// Step 4: documents (optional)
// ---------------------------------------------------------------------------
export function DocumentsStep({
  onSave,
  onBack,
  children,
}: StepProps & { /** The document uploader. */ children?: ReactNode }) {
  const { submit, pending, formError } = useStepForm({
    schema: z.object({}),
    defaultValues: {},
    onSave: () => onSave({}),
  });

  return (
    <StepForm onSubmit={submit}>
      <p className="text-muted-foreground text-sm">
        Add photos of your CDL, medical card and certifications. This step is optional: you can skip
        it now and add documents later from your profile.
      </p>
      {children}
      <FormError message={formError} />
      <StepActions pending={pending} onBack={onBack} label="Continue" />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------
// Step 5: SMS consent (required)
// ---------------------------------------------------------------------------
export function ConsentStep({ driver, onSave, onBack }: StepProps) {
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: smsConsentSchema,
    // Always starts unchecked unless consent is already on record.
    defaultValues: { consent: driver?.smsOptIn ? true : (false as unknown as true) },
    onSave,
  });
  const error = errorOf("consent");

  return (
    <StepForm onSubmit={submit}>
      <p className="text-muted-foreground text-sm">
        FleetGrid sends shift offers by text message. You reply YES to claim a shift.
      </p>

      <Controller
        control={form.control}
        name="consent"
        render={({ field }) => (
          <div className="border-input bg-card flex items-start gap-3 rounded-lg border p-4">
            <Checkbox
              id="sms-consent"
              checked={field.value === true}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              disabled={pending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "sms-consent-error" : undefined}
              className="border-foreground/60 mt-0.5 size-6"
            />
            <label htmlFor="sms-consent" className="text-sm leading-relaxed">
              {SMS_CONSENT_TEXT}
            </label>
          </div>
        )}
      />
      {error && (
        <p id="sms-consent-error" role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}

      <p className="text-muted-foreground text-sm">
        See our{" "}
        <Link href="/sms-terms" className="text-foreground underline underline-offset-4">
          SMS Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-foreground underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>

      <FormError message={formError} />
      <StepActions pending={pending} onBack={onBack} label="Finish" />
    </StepForm>
  );
}

// ---------------------------------------------------------------------------
// Step 6: done
// ---------------------------------------------------------------------------
export function DoneStep() {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <div className="bg-success/15 flex size-16 items-center justify-center rounded-full">
        <CircleCheck aria-hidden="true" className="text-success size-9" />
      </div>
      <h2 className="text-xl font-semibold">You are all set</h2>
      <p className="text-muted-foreground max-w-sm">
        Your profile is under review. You&apos;ll get texts when matching shifts open.
      </p>
      <Button asChild size="touch" className="mt-2">
        <Link href="/driver/profile">View my profile</Link>
      </Button>
    </div>
  );
}
