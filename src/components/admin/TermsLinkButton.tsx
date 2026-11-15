"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { sendTermsLinksAction } from "@/server/actions/terms.actions";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Texts the one-time Terms link (Milestone 6): to every driver still waiting who has shift
 * texts on, or, with a driver, to that driver. A confirm dialog names who gets it.
 */
export function TermsLinkButton({ driverId, name, count }: { driverId?: string; name?: string; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const bulk = !driverId;

  async function send() {
    setPending(true);
    const result = await sendTermsLinksAction(driverId);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    setOpen(false);
    const { sent, failed } = result.data;
    if (failed > 0) toast.error(`${plural(sent, "link", "links")} sent, ${failed} not sent. See Messaging for the reason.`);
    else toast.success(bulk ? `${plural(sent, "link", "links")} sent` : "Link sent");
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant={bulk ? "primary" : "secondary"}
        size="md"
        disabled={count === 0}
        onClick={() => setOpen(true)}
      >
        {bulk ? `Text the Terms link to ${plural(count, "driver", "drivers")}` : "Text the link"}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={bulk ? `Text the Terms link to ${plural(count, "driver", "drivers")}?` : `Text the Terms link to ${name}?`}
        description="Each driver gets a new one-time link that works for 14 days and ends any link sent before. Drivers who turned shift texts off are not texted; they see the Terms when they sign in."
        confirmLabel="Send"
        pendingLabel="Sending..."
        pending={pending}
        onConfirm={send}
      />
    </>
  );
}
