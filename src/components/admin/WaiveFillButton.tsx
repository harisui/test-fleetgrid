"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { waiveFillAction } from "@/server/actions/admin-ops.actions";

const OUTCOME_TOAST = {
  removed: "Fill waived. It is off the carrier's next invoice.",
  credited: "Fill waived. $35 is credited to the carrier's next invoice.",
  unbilled: "Fill waived before it was billed.",
} as const;

/** Waives one completed fill after a dispute, with the reason kept in the history. */
export function WaiveFillButton({ fillId, label }: { fillId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const waive = () =>
    startTransition(async () => {
      const result = await waiveFillAction({ fillId, reason });
      if (!result.ok) {
        setError(result.error.fieldErrors?.reason ?? result.error.message);
        return;
      }
      toast.success(OUTCOME_TOAST[result.data.outcome]);
      setOpen(false);
      setReason("");
      router.refresh();
    });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Waive
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Waive the fill for ${label}?`}
        description="The carrier is not charged $35 for it: it comes off their next invoice, or is credited if it was invoiced already."
        confirmLabel="Waive fill"
        pendingLabel="Waiving..."
        pending={pending}
        confirmDisabled={reason.trim().length < 3}
        onConfirm={waive}
      >
        <FormField label="Why?" description="Kept in the carrier's history." error={error} errorIcon={false}>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className="min-h-20" />
        </FormField>
      </ConfirmDialog>
    </>
  );
}
