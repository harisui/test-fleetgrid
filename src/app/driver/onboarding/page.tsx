import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { progressFor } from "@/lib/onboarding/steps";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Set up your profile" };

// Temporary page while the Workshop onboarding flow is built (steps 3 and 4 of the build order).
export default async function DriverOnboardingPage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);
  const progress = progressFor(state.stepId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-eyebrow font-heading uppercase tracking-eyebrow">{progress.eyebrow}</p>
      <h1 className="font-heading text-h1">{progress.step.question}</h1>
    </div>
  );
}
