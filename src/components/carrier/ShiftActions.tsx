"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { cancelShiftAction, releaseShiftAction } from "@/server/actions/shift.actions";
import type { ShiftStatus } from "@/types/domain";

interface ShiftActionsProps {
  shiftId: string;
  status: ShiftStatus;
  /** The booked driver's name, for the dialogs. */
  driverName: string | null;
}

/** Cancel an open or booked shift; release a booked driver who did not show. */
export function ShiftActions({ shiftId, status, driverName }: ShiftActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"cancel" | "release" | null>(null);
  const [pending, startTransition] = useTransition();

  if (status !== "open" && status !== "booked") return null;

  const run = (action: "cancel" | "release") =>
    startTransition(async () => {
      const result =
        action === "cancel" ? await cancelShiftAction({ shiftId }) : await releaseShiftAction({ shiftId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(action === "cancel" ? "Shift cancelled" : "Shift sent out again");
      setDialog(null);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 sm:flex-row" data-slot="shift-actions">
      {status === "booked" && (
        <Button variant="secondary" onClick={() => setDialog("release")}>
          Release and rebroadcast
        </Button>
      )}
      <Button variant="destructive" onClick={() => setDialog("cancel")}>
        Cancel shift
      </Button>
      <ConfirmDialog
        open={dialog === "release"}
        onOpenChange={(open) => setDialog(open ? "release" : null)}
        title={`Release ${driverName ?? "the driver"}?`}
        description="Use this when the driver did not show. It counts a no-show for them, and the shift goes out again with a new code to the other matching drivers."
        confirmLabel="Release and rebroadcast"
        pendingLabel="Sending..."
        pending={pending}
        onConfirm={() => run("release")}
      />
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
