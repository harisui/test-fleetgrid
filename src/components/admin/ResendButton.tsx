"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { resendMessageAction } from "@/server/actions/messaging.actions";

/** Resend a failed text, once, after a dialog. Disabled with the reason when it may not go. */
export function ResendButton({ messageId, allowed, reason }: { messageId: string; allowed: boolean; reason: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-1" data-slot="resend">
      <Button type="button" size="md" onClick={() => setOpen(true)} disabled={!allowed} aria-describedby={allowed ? undefined : "resend-reason"}>
        Resend
      </Button>
      {!allowed && reason && (
        <span id="resend-reason" className="text-small leading-small text-muted-foreground" data-slot="resend-reason">
          {reason}
        </span>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Resend this text?"
        description="The same words go to the same number once more. A text can be resent only once."
        confirmLabel="Resend"
        pendingLabel="Sending..."
        pending={pending}
        onConfirm={async () => {
          setPending(true);
          const result = await resendMessageAction({ messageId });
          setPending(false);
          setOpen(false);
          if (!result.ok) {
            toast.error(result.error.message);
            return;
          }
          toast.success(result.data.status === "failed" ? "Resent, and it failed again" : "Text resent");
          router.refresh();
        }}
      />
    </div>
  );
}
