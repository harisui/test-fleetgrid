"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { SelectInput } from "@/components/shared/SelectInput";
import { Input } from "@/components/ui/input";
import { simulateReplyAction } from "@/server/actions/shift.actions";
import type { BroadcastRecipient } from "@/types/domain";

/**
 * Only with the fake text sender (local and previews): reply as one of the texted drivers,
 * so the whole loop can be shown without real phones. Goes through the same handler as
 * Twilio's webhook.
 */
export function SimulateReply({ shiftId, recipients }: { shiftId: string; recipients: BroadcastRecipient[] }) {
  const router = useRouter();
  const [driverId, setDriverId] = useState(recipients[0]?.driverId ?? "");
  const [body, setBody] = useState(`YES ${recipients[0]?.code ?? ""}`);
  const [pending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-3 rounded-card border-2 border-dashed border-border-strong p-5" aria-labelledby="simulate" data-slot="simulate-reply">
      <h2 id="simulate" className="font-heading text-h3 leading-h3 font-semibold">
        Test mode: reply as a driver
      </h2>
      <p className="text-helper leading-helper text-muted-foreground">No real texts are sent here.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Driver" errorIcon={false}>
          <SelectInput
            value={driverId}
            onValueChange={setDriverId}
            options={recipients.map((r) => ({ value: r.driverId, label: `Driver ${r.position}` }))}
          />
        </FormField>
        <FormField label="Reply">
          <Input value={body} onChange={(event) => setBody(event.target.value)} maxLength={160} />
        </FormField>
      </div>
      <LoadingButton
        variant="secondary"
        loading={pending}
        loadingText="Sending..."
        onClick={() =>
          startTransition(async () => {
            const result = await simulateReplyAction({ shiftId, driverId, body });
            if (!result.ok) toast.error(result.error.message);
            else toast.success(result.data.replied ? `FleetGrid replied: ${result.data.replied}` : "Reply received");
            router.refresh();
          })
        }
      >
        Send reply
      </LoadingButton>
    </section>
  );
}
