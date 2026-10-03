import type { Metadata } from "next";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { requireRole } from "@/lib/auth/guards";
import { progressFor } from "@/lib/onboarding/steps";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Set up your profile" };

// The screens themselves land in step 4 of the build order. Until then the shell shows the
// current question.
export default async function DriverOnboardingPage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);
  const progress = progressFor(state.stepId);

  return (
    <OnboardingShell stepId={state.stepId}>
      <SignHeader
        eyebrow={progress.eyebrow}
        title={progress.step.question}
        srText={progress.srLabel}
      />
    </OnboardingShell>
  );
}
