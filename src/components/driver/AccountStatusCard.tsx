import { MessageSquareOff, MessageSquareText } from "lucide-react";
import { InlineNote } from "@/components/shared/InlineNote";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { formatE164ForDisplay } from "@/lib/phone";
import type { AccountStatus, Driver, Profile } from "@/types/domain";

const STATUS_HELP: Record<AccountStatus, string> = {
  pending:
    "We are reviewing your profile. You will start getting shift offers once it is approved.",
  approved: "You are approved. Matching shift offers will be texted to you.",
  blocked: "Your account is blocked and will not receive shift offers. Contact support for help.",
};

interface AccountStatusCardProps {
  profile: Pick<Profile, "status" | "phone">;
  driver: Pick<Driver, "smsOptIn" | "smsOptedOut">;
}

/** Account review status and text message status, with what each one means for the driver. */
export function AccountStatusCard({ profile, driver }: AccountStatusCardProps) {
  const receivingTexts = driver.smsOptIn && !driver.smsOptedOut;

  return (
    <section
      aria-label="Account status"
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-label leading-label font-semibold">Account</h2>
          <StatusBadge status={profile.status} />
        </div>
        <p className="text-helper leading-helper text-muted-foreground">
          {STATUS_HELP[profile.status]}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-label leading-label font-semibold">Text messages</h2>
          {receivingTexts ? (
            <Badge variant="success" data-sms="subscribed">
              <MessageSquareText aria-hidden="true" />
              Subscribed
            </Badge>
          ) : (
            <Badge variant="warning" data-sms="off">
              <MessageSquareOff aria-hidden="true" />
              {driver.smsOptedOut ? "Opted out" : "Not subscribed"}
            </Badge>
          )}
        </div>
        <p className="text-helper leading-helper text-muted-foreground">
          Shift offers go to{" "}
          <span className="font-semibold text-foreground">
            {formatE164ForDisplay(profile.phone)}
          </span>
          .
        </p>
        {driver.smsOptedOut && (
          <InlineNote variant="warning">
            You replied STOP, so we are not texting you shift offers. To start again, text{" "}
            <strong>START</strong> to the FleetGrid number that sent your offers.
          </InlineNote>
        )}
      </div>
    </section>
  );
}
