"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AvailabilityStep,
  BasicsStep,
  ConsentStep,
  DocumentsStep,
  DoneStep,
  LicensesStep,
} from "@/components/driver/OnboardingSteps";
import { Progress } from "@/components/ui/progress";
import { ONBOARDING_STEPS } from "@/lib/constants";
import { saveOnboardingStepAction } from "@/server/actions/driver.actions";
import type { Result } from "@/server/errors/AppError";
import type { Driver } from "@/types/domain";

const STEP_TITLES: Record<number, string> = {
  1: "Your basics",
  2: "Role and licenses",
  3: "Availability",
  4: "Documents",
  5: "Text message consent",
};

const LAST_FORM_STEP = ONBOARDING_STEPS.consent;

interface OnboardingStepperProps {
  /** The step to resume at (1 to 6), from the saved card. */
  initialStep: number;
  initialDriver: Driver | null;
  /** Rendered inside step 4. */
  documentUploader?: ReactNode;
}

/**
 * Multi-step qualification card. Every step is saved on Next, so the driver can leave at any
 * point and resume later. Back keeps what was saved.
 */
export function OnboardingStepper({
  initialStep,
  initialDriver,
  documentUploader,
}: OnboardingStepperProps) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [driver, setDriver] = useState(initialDriver);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move focus to the new step's heading so screen readers and keyboards follow along.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo?.({ top: 0 });
  }, [step]);

  async function save(values: unknown): Promise<Result<unknown>> {
    const result = await saveOnboardingStepAction(step, values);
    if (result.ok) {
      setDriver(result.data);
      setStep(step + 1);
      // Refresh server data (nav, profile) once the card is complete.
      if (step === LAST_FORM_STEP) router.refresh();
    }
    return result;
  }

  if (step > LAST_FORM_STEP) {
    return <DoneStep />;
  }

  const back = step > 1 ? () => setStep(step - 1) : undefined;
  const props = { driver, onSave: save, onBack: back };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm font-medium">
          Step {step} of {LAST_FORM_STEP}
        </p>
        <Progress
          value={(step / LAST_FORM_STEP) * 100}
          aria-label="Onboarding progress"
          className="h-2"
        />
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-2 text-xl font-semibold tracking-tight outline-none"
        >
          {STEP_TITLES[step]}
        </h2>
      </div>

      {/* The key remounts the form so each step starts from the saved card. */}
      {step === 1 && <BasicsStep key={1} {...props} />}
      {step === 2 && <LicensesStep key={2} {...props} />}
      {step === 3 && <AvailabilityStep key={3} {...props} />}
      {step === 4 && (
        <DocumentsStep key={4} {...props}>
          {documentUploader}
        </DocumentsStep>
      )}
      {step === 5 && <ConsentStep key={5} {...props} />}
    </div>
  );
}
