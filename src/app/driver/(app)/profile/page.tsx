import { InlineNote } from "@/components/shared/InlineNote";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteAccountCard } from "@/components/account/DeleteAccountCard";
import { AccountStatusCard } from "@/components/driver/AccountStatusCard";
import { ClearinghouseSelfReportControl } from "@/components/driver/ClearinghouseSelfReportControl";
import { ProfileEditor } from "@/components/driver/ProfileEditor";
import { RosterStatusBanner } from "@/components/driver/RosterStatusBanner";
import { requireDriverWithCdlState } from "@/lib/auth/guards";
import { shiftReadyMissing } from "@/lib/drivers/tiers";
import { needsTwicDate, TWIC_DATE_PROMPT } from "@/lib/drivers/twic";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "My profile" };

export default async function DriverProfilePage() {
  const { user, profile } = await requireDriverWithCdlState();
  const { driverService, documentService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);
  if (!state.completed || !state.driver) redirect("/driver/onboarding");
  const documents = await documentService.list(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
      <RosterStatusBanner
        status={profile.status}
        missing={shiftReadyMissing(state.driver, documents.map((document) => document.type))}
        textsOn={state.driver.smsOptIn && !state.driver.smsOptedOut}
        graceUntil={state.driver.rosterGraceUntil}
      />
      {needsTwicDate(state.driver) && (
        <InlineNote variant="warning" data-slot="twic-date-prompt">
          <Link href="/driver/profile" className="font-semibold underline underline-offset-4">
            {TWIC_DATE_PROMPT}
          </Link>
        </InlineNote>
      )}
      <AccountStatusCard profile={profile} driver={state.driver} />
      <ClearinghouseSelfReportControl confirmedAt={state.driver.clearinghouseSelfReportedAt} />
      <ProfileEditor driver={state.driver} />
      <DeleteAccountCard phone={user.phone} />
    </div>
  );
}
