"use client";

import { useRouter } from "next/navigation";
import { Controller, useWatch } from "react-hook-form";
import { CdlStateField } from "@/components/driver/CdlStateField";
import { useStepForm } from "@/components/driver/useStepForm";
import { ConsentCard } from "@/components/shared/ConsentCard";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { YesNoChips } from "@/components/shared/YesNoChips";
import { asksTexas30Days, DOMICILE_QUESTIONS, DOMICILE_STATEMENT } from "@/lib/drivers/domicile";
import { domicileFormSchema } from "@/lib/validation/domicile.schema";
import { saveDomicileAction } from "@/server/actions/driver.actions";
import type { Driver } from "@/types/domain";

/**
 * The attorney's domicile questions (Milestone 6, 0044), in his order. The Texas questions show
 * only for a Texas domicile with a CDL from another state, the transfer question only when that
 * domicile is older than 30 days. The answers are confirmed with a box, recorded with its words.
 */
export function DomicileQuestions({ driver }: { driver: Pick<Driver, "cdlState" | "domicileState" | "cdlAddressCurrent" | "txDomicileWithin30Days" | "cdlTransferApplied"> }) {
  const router = useRouter();
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: domicileFormSchema,
    defaultValues: {
      cdlState: driver.cdlState,
      domicileState: driver.domicileState ?? undefined,
      cdlAddressCurrent: driver.cdlAddressCurrent ?? undefined,
      txDomicileWithin30Days: driver.txDomicileWithin30Days ?? undefined,
      cdlTransferApplied: driver.cdlTransferApplied ?? undefined,
      confirmed: false as unknown as true,
    },
    onSave: async (values) => {
      const result = await saveDomicileAction(values);
      if (result.ok) {
        router.replace("/driver");
        router.refresh();
      }
      return result;
    },
  });
  const domicileState = useWatch({ control: form.control, name: "domicileState" });
  const within30 = useWatch({ control: form.control, name: "txDomicileWithin30Days" });
  const texas = asksTexas30Days({ cdlState: driver.cdlState, domicileState: domicileState ?? null });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-slot="domicile-questions">
      <CdlStateField
        control={form.control}
        name="domicileState"
        label={DOMICILE_QUESTIONS.domicileState}
        error={errorOf("domicileState")}
        disabled={pending}
      />
      <Controller
        control={form.control}
        name="cdlAddressCurrent"
        render={({ field }) => (
          <YesNoChips
            label={DOMICILE_QUESTIONS.cdlAddressCurrent}
            value={field.value ?? undefined}
            onChange={field.onChange}
            error={errorOf("cdlAddressCurrent")}
          />
        )}
      />
      {texas && (
        <Controller
          control={form.control}
          name="txDomicileWithin30Days"
          render={({ field }) => (
            <YesNoChips
              label={DOMICILE_QUESTIONS.txDomicileWithin30Days}
              value={field.value ?? undefined}
              onChange={field.onChange}
              error={errorOf("txDomicileWithin30Days")}
            />
          )}
        />
      )}
      {texas && within30 === false && (
        <Controller
          control={form.control}
          name="cdlTransferApplied"
          render={({ field }) => (
            <YesNoChips
              label={DOMICILE_QUESTIONS.cdlTransferApplied}
              value={field.value ?? undefined}
              onChange={field.onChange}
              error={errorOf("cdlTransferApplied")}
            />
          )}
        />
      )}
      <Controller
        control={form.control}
        name="confirmed"
        render={({ field }) => (
          <ConsentCard
            id="domicile-confirmed"
            checked={field.value === true}
            onCheckedChange={(next) => field.onChange(next)}
            text={DOMICILE_STATEMENT}
            error={errorOf("confirmed")}
            disabled={pending}
          />
        )}
      />
      {formError && (
        <InlineNote variant="error" role="alert">
          {formError}
        </InlineNote>
      )}
      <LoadingButton type="submit" loading={pending} loadingText="Saving...">
        Save and continue
      </LoadingButton>
    </form>
  );
}
