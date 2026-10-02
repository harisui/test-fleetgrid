import type { Metadata } from "next";
import { OnboardingStepper } from "@/components/driver/OnboardingStepper";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function DriverOnboardingPage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your profile</h1>
      <OnboardingStepper initialStep={state.step} initialDriver={state.driver} />
    </div>
  );
}
