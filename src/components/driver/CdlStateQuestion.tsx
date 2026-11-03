"use client";

import { useRouter } from "next/navigation";
import { CdlStateField } from "@/components/driver/CdlStateField";
import { useStepForm } from "@/components/driver/useStepForm";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { DEFAULT_CDL_STATE } from "@/components/driver/screens/LeadScreen";
import { cdlStateSchema } from "@/lib/validation/onboarding.schema";
import { setCdlStateAction } from "@/server/actions/driver.actions";

/** "Which state issued your CDL?" (CR-5), asked once of cards saved before the question existed. */
export function CdlStateQuestion() {
  const router = useRouter();
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: cdlStateSchema,
    defaultValues: { cdlState: DEFAULT_CDL_STATE },
    onSave: async (values) => {
      const result = await setCdlStateAction(values);
      if (result.ok) {
        router.replace("/driver");
        router.refresh();
      }
      return result;
    },
  });
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-slot="cdl-state-question">
      <CdlStateField control={form.control} name="cdlState" label="Which state issued your CDL?" error={errorOf("cdlState")} disabled={pending} />
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
