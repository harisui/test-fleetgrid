import type { Metadata } from "next";
import { OnboardingFlow } from "@/components/driver/OnboardingFlow";
import { requireRole } from "@/lib/auth/guards";
import { getSupportContact } from "@/lib/support";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Set up your profile" };

export default async function DriverOnboardingPage() {
  const { user } = await requireRole("driver");
  const { driverService, documentService } = await getContainer();
  const [state, documents] = await Promise.all([
    driverService.getOnboardingState(user.id),
    documentService.list(user.id),
  ]);

  return (
    <OnboardingFlow
      initialStepId={state.stepId}
      initialDriver={state.driver}
      phone={user.phone}
      initialDocuments={documents}
      support={getSupportContact()}
    />
  );
}
