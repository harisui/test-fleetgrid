import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";
import { AccountStatusCard } from "@/components/driver/AccountStatusCard";
import { ProfileEditor } from "@/components/driver/ProfileEditor";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "My profile" };

export default async function DriverProfilePage() {
  const { user, profile } = await requireRole("driver");
  const { driverService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);
  if (!state.completed || !state.driver) redirect("/driver/onboarding");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <AccountStatusCard profile={profile} driver={state.driver} />
      <ProfileEditor driver={state.driver} />
      <DeleteAccountCard phone={user.phone} />
    </div>
  );
}
