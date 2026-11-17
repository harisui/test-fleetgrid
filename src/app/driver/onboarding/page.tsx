import { phoneOf } from "@/lib/phone";
import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/driver/OnboardingFlow";
import { requireDriverWithCdlState } from "@/lib/auth/guards";
import { getSupportContact } from "@/lib/support";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function DriverOnboardingPage() {
  // The sign-up and its done screen are never interrupted; the driver pages ask the domicile questions.
  const { user } = await requireDriverWithCdlState({ askDomicile: false });
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);

  return (
    <OnboardingFlow
      initialStepId={state.stepId}
      initialDriver={state.driver}
      phone={phoneOf(user)}
      support={getSupportContact()}
    />
  );
}
