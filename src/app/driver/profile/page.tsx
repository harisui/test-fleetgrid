import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "My profile" };

export default async function DriverProfilePage() {
  const { user } = await requireRole("driver");
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);
  if (!state.completed) redirect("/driver/onboarding");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <p className="text-muted-foreground mt-2">Your qualification card will appear here.</p>
    </div>
  );
}
