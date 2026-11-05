"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { REPOST_CANCEL_REASON } from "@/lib/shifts/copy";
import { cancelShiftAction } from "@/server/actions/shift.actions";
import type { ShiftStatus } from "@/types/domain";

interface CancelAndRepostProps {
  shiftId: string;
  status: ShiftStatus;
  /** The booked driver's name, for the dialog. */
  driverName: string | null;
}

/** The time, place and requirements cannot be edited: cancel this one and open a new form filled in from it. */
export function CancelAndRepost({ shiftId, status, driverName }: CancelAndRepostProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cancel and repost
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this shift and post a new one?"
        description={`${
          status === "booked"
            ? `${driverName ?? "The booked driver"} gets a text right away saying the shift was cancelled.`
            : "Nobody can book this one after that."
        } A new shift form then opens, filled in from this one. Nothing goes out until you post it.`}
        confirmLabel="Cancel and repost"
        pendingLabel="Cancelling..."
        variant="destructive"
        pending={pending}
        onConfirm={() =>
          startTransition(async () => {
            const result = await cancelShiftAction({ shiftId, reason: REPOST_CANCEL_REASON });
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            router.push(`/carrier/shifts/new?from=${shiftId}`);
          })
        }
      />
    </>
  );
}
