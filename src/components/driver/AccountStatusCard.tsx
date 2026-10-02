import { MessageSquareOff, MessageSquareText } from "lucide-react";
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
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Account</h2>
          <StatusBadge status={profile.status} />
        </div>
        <p className="text-muted-foreground text-sm">{STATUS_HELP[profile.status]}</p>
      </div>

      <div className="border-border flex flex-col gap-2 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Text messages</h2>
          {receivingTexts ? (
            <Badge
              variant="outline"
              data-sms="subscribed"
              className="border-success/60 bg-success/15 text-foreground"
            >
              <MessageSquareText aria-hidden="true" />
              Subscribed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              data-sms="off"
              className="border-warning/60 bg-warning/15 text-foreground"
            >
              <MessageSquareOff aria-hidden="true" />
              {driver.smsOptedOut ? "Opted out" : "Not subscribed"}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Shift offers go to{" "}
          <span className="text-foreground font-medium">{formatE164ForDisplay(profile.phone)}</span>
          .
        </p>
        {driver.smsOptedOut && (
          <p className="border-warning/60 bg-warning/15 rounded-md border p-3 text-sm">
            You replied STOP, so we are not texting you shift offers. To start again, text{" "}
            <strong>START</strong> to the FleetGrid number that sent your offers.
          </p>
        )}
      </div>
    </section>
  );
}
