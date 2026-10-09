import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/driver/OnboardingFlow";
import { requireRole } from "@/lib/auth/guards";
import { getSupportContact } from "@/lib/support";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function DriverOnboardingPage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);

  return (
    <OnboardingFlow
      initialStepId={state.stepId}
      initialDriver={state.driver}
      phone={user.phone}
      support={getSupportContact()}
    />
  );
}
