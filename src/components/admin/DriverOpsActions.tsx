"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PausedNoShowsBadge } from "@/components/admin/MissingDocumentsBadge";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { RemoveAccountButton } from "@/components/admin/RemoveAccountButton";
import { Button } from "@/components/ui/button";
import { pauseDriverAction, unpauseDriverAction } from "@/server/actions/admin-ops.actions";

/**
 * Milestone 3 on the driver sheet: the no-show count, Pause or Resume shift texts (the
 * client's no-show rule of 2026-10-25), and Remove.
 */
export function DriverOpsActions({
  driverId,
  profileId,
  name,
  noShowCount,
  paused,
  pausedReason,
  afterRemoveHref,
}: {
  driverId: string;
  profileId: string;
  name: string;
  noShowCount: number;
  paused: boolean;
  pausedReason: string | null;
  afterRemoveHref: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <section className="flex flex-col gap-3" aria-labelledby="driver-shifts" data-slot="driver-ops">
      <h3 id="driver-shifts" className="text-eyebrow leading-eyebrow font-semibold tracking-wide text-muted-foreground uppercase">
        Shifts
      </h3>
      <p className="text-label leading-label" data-slot="no-shows">
        {noShowCount === 1 ? "1 no-show" : `${noShowCount} no-shows`}.{" "}
        {paused ? "Shift texts are paused." : "Shift texts are on when the driver has opted in."}
      </p>
      {paused && pausedReason === "no_shows" && <PausedNoShowsBadge className="self-start" />}
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="md" variant="secondary" onClick={() => setConfirming(true)}>
          {paused ? "Resume shift texts" : "Pause shift texts"}
        </Button>
        <Button asChild type="button" size="md" variant="secondary">
          <Link href={`/admin/messaging/send?driver=${driverId}`}>Send security notice</Link>
        </Button>
        <RemoveAccountButton profileId={profileId} name={name} afterHref={afterRemoveHref} />
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={paused ? `Resume shift texts for ${name}?` : `Pause shift texts for ${name}?`}
        description={
          paused
            ? "They get shift texts again when a matching shift is posted."
            : "They stay listed to carriers but get no shift texts until you resume them."
        }
        confirmLabel={paused ? "Resume" : "Pause"}
        pending={pending}
        confirmDisabled={paused && reason.trim().length < 5}
        onConfirm={async () => {
          setPending(true);
          const result = paused ? await unpauseDriverAction({ driverId, reason }) : await pauseDriverAction({ driverId });
          setPending(false);
          setConfirming(false);
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success(paused ? "Shift texts resumed" : "Shift texts paused");
          setReason("");
          router.refresh();
        }}
      >
        {paused && (
          <FormField label="Why may they get shift texts again?" required>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} autoComplete="off" />
          </FormField>
        )}
      </ConfirmDialog>
    </section>
  );
}
