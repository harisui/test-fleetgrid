"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { approveCarrierAction, blockCarrierAction, reopenCarrierAction } from "@/server/actions/admin-ops.actions";
import type { AccountStatus } from "@/types/domain";

const ACTIONS = { approved: approveCarrierAction, blocked: blockCarrierAction, pending: reopenCarrierAction } as const;
const COPY: Record<AccountStatus, { title: string; description: string; label: string; done: string }> = {
  approved: { title: "Activate", description: "They keep their access while subscribed.", label: "Activate", done: "Carrier activated" },
  blocked: {
    title: "Block",
    description: "They are signed out and cannot post shifts or search drivers. Their billing is not changed.",
    label: "Block",
    done: "Carrier blocked",
  },
  pending: { title: "Set pending", description: "Back to the review queue.", label: "Set pending", done: "Carrier set pending" },
};

/** Approve, block or set pending, each with a confirmation. */
export function CarrierStatusActions({ carrierId, name, status }: { carrierId: string; name: string; status: AccountStatus }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<AccountStatus>();
  const [pending, setPending] = useState(false);
  const options = (["pending", "blocked", "approved"] as const).filter((next) => next !== status);
  return (
    <>
      {options.map((next) => (
        <Button
          key={next}
          type="button"
          size="md"
          variant={next === "blocked" ? "destructive" : next === "approved" ? "primary" : "secondary"}
          onClick={() => setConfirming(next)}
          disabled={pending}
        >
          {COPY[next].label}
        </Button>
      ))}
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(undefined);
          }}
          title={`${COPY[confirming].title} ${name}?`}
          description={COPY[confirming].description}
          confirmLabel={COPY[confirming].label}
          variant={confirming === "blocked" ? "destructive" : "primary"}
          pending={pending}
          onConfirm={async () => {
            setPending(true);
            const result = await ACTIONS[confirming]({ carrierId });
            setPending(false);
            setConfirming(undefined);
            if (!result.ok) {
              toast.error(result.error.message);
              return;
            }
            toast.success(COPY[confirming].done);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
