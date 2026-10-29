"use client";

import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { CLEARINGHOUSE_SELF_REPORT_TEXT } from "@/lib/onboarding/options";
import { updateClearinghouseSelfReportAction } from "@/server/actions/driver.actions";

interface ClearinghouseSelfReportControlProps {
  /** When the driver confirmed it, or null when not answered. */
  confirmedAt: string | null;
}

/**
 * The profile's "Clearinghouse and SAP" box (client decision of 2026-10-29): the same words
 * as the sign-up. Ticking saves a yes with a new time; unticking deletes the answer and its
 * date at once, so a driver can always take it back. Not the "Registered in the
 * Clearinghouse" answer further down, which is about having an account.
 */
export function ClearinghouseSelfReportControl({ confirmedAt }: ClearinghouseSelfReportControlProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const confirmed = confirmedAt !== null;

  async function save(next: boolean) {
    if (pending) return;
    setError(undefined);
    setPending(true);
    const result = await updateClearinghouseSelfReportAction({ clearinghouseConfirmed: next });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    toast.success(next ? "Saved. Thank you for confirming." : "Removed. Your answer and its date are deleted.");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="clearinghouse-sap-title"
      className="flex flex-col gap-3 rounded-card border border-border bg-card p-4"
      data-slot="clearinghouse-self-report"
    >
      <div className="flex flex-col gap-1">
        <h2 id="clearinghouse-sap-title" className="text-label leading-label font-semibold">
          Clearinghouse and SAP
        </h2>
        <p className="text-helper leading-helper text-muted-foreground">
          Optional. Tick the box only if it is true; untick it any time and your answer is deleted.
        </p>
      </div>
      <ConsentCard
        id="profile-clearinghouse-self-report"
        checked={confirmed}
        onCheckedChange={(next) => void save(next)}
        text={CLEARINGHOUSE_SELF_REPORT_TEXT}
        error={error}
        disabled={pending}
      />
      {confirmedAt && (
        <p className="flex items-center gap-1.5 text-helper leading-helper text-muted-foreground" data-slot="clearinghouse-confirmed-at">
          <ShieldCheck aria-hidden="true" className="size-4" />
          Confirmed on {format(new Date(confirmedAt), "MMMM d, yyyy")}
        </p>
      )}
    </section>
  );
}
