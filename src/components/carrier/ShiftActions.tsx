"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CancelAndRepost } from "@/components/carrier/CancelAndRepost";
import { FormField } from "@/components/shared/FormField";
import { SelectInput } from "@/components/shared/SelectInput";
import { Button } from "@/components/ui/button";
import type { BookedShiftPhase } from "@/lib/shifts/schedule";
import type { ReleaseReason } from "@/lib/validation/shift.schema";
import { cancelShiftAction, releaseShiftAction } from "@/server/actions/shift.actions";
import type { ShiftStatus } from "@/types/domain";

interface ShiftActionsProps {
  shiftId: string;
  status: ShiftStatus;
  /** The booked driver's name, for the dialogs. */
  driverName: string | null;
  /** Where a booked shift stands; null for an open one. */
  phase: BookedShiftPhase | null;
  /** The last moment a no-show can be reported, written out ("Tue Nov 18, 4:00 PM"). */
  noShowUntil: string | null;
}

/**
 * Edit the details or cancel an open or booked shift; release a booked driver who did not
 * show. Once a booked shift has started it cannot be cancelled; after its end a no-show can
 * still be reported for 2 hours, and then it is a completed fill (pricing of 2026-11-11).
 */
export function ShiftActions({ shiftId, status, driverName, phase, noShowUntil }: ShiftActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"cancel" | "release" | null>(null);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState<ReleaseReason>("no_show");

  if (status !== "open" && status !== "booked") return null;
  if (status === "booked" && phase === "completed") {
    return (
      <p className="text-helper leading-helper text-muted-foreground" data-slot="completed-fill">
        This shift counts as a completed fill.
      </p>
    );
  }
  const ended = status === "booked" && phase === "no_show_window";
  const cancellable = status === "open" || phase === "before_start";

  const run = (action: "cancel" | "release") =>
    startTransition(async () => {
      const result =
        action === "cancel" ? await cancelShiftAction({ shiftId }) : await releaseShiftAction({ shiftId, reason });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(action === "cancel" ? "Shift cancelled" : ended ? "No-show reported" : "Shift sent out again");
      setDialog(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap" data-slot="shift-actions">
      {ended && noShowUntil && (
        <p className="w-full text-helper leading-helper" data-slot="no-show-until">
          You can report a no-show until {noShowUntil}.
        </p>
      )}
      {!ended && (
        <Button variant="secondary" asChild>
          <Link href={`/carrier/shifts/${shiftId}/edit`}>Edit details</Link>
        </Button>
      )}
      {cancellable && <CancelAndRepost shiftId={shiftId} status={status} driverName={driverName} />}
      {status === "booked" && (
        <Button variant="secondary" onClick={() => setDialog("release")}>
          {ended ? "Report a no-show" : "Release and rebroadcast"}
        </Button>
      )}
      {cancellable && (
        <Button variant="destructive" onClick={() => setDialog("cancel")}>
          Cancel shift
        </Button>
      )}
      <ConfirmDialog
        open={dialog === "release"}
        onOpenChange={(open) => setDialog(open ? "release" : null)}
        title={ended ? `Report a no-show for ${driverName ?? "the driver"}?` : `Release ${driverName ?? "the driver"}?`}
        description={
          reason === "twic_gate"
            ? ended
              ? "It flags the driver for FleetGrid to look at, not as a no-show. The shift has ended, so it does not go out again, and it is not a completed fill."
              : "It flags the driver for FleetGrid to look at, not as a no-show, and the shift goes out again without them."
            : ended
              ? "It counts a no-show for them. The shift has ended, so it does not go out again, and it is not a completed fill."
              : "Use this when the driver did not show. It counts a no-show for them, and the shift goes out again without them."
        }
        confirmLabel={ended ? "Report a no-show" : "Release and rebroadcast"}
        pendingLabel="Sending..."
        pending={pending}
        onConfirm={() => run("release")}
      >
        <FormField label="What happened?" errorIcon={false}>
          <SelectInput
            value={reason}
            onValueChange={(value) => setReason(value as ReleaseReason)}
            options={[
              { value: "no_show", label: "Did not show" },
              { value: "twic_gate", label: "Turned away at gate: TWIC" },
            ]}
          />
        </FormField>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => setDialog(open ? "cancel" : null)}
        title="Cancel this shift?"
        description={
          status === "booked"
            ? `${driverName ?? "The booked driver"} gets a text right away saying the shift was cancelled.`
            : "Nobody can book it after this. Drivers who reply get a short note that it is no longer open."
        }
        confirmLabel="Cancel shift"
        pendingLabel="Cancelling..."
        variant="destructive"
        pending={pending}
        onConfirm={() => run("cancel")}
      />
    </div>
  );
}
