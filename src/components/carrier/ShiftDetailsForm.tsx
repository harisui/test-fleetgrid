"use client";

import { useRouter } from "next/navigation";
import { useStepForm } from "@/components/driver/useStepForm";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { shiftDetailsSchema, type ShiftDetailsFormValues } from "@/lib/validation/shift.schema";
import { editShiftDetailsAction } from "@/server/actions/shift.actions";

/** The details a carrier may change at any time. No text goes out. */
export function ShiftDetailsForm({ initial }: { initial: ShiftDetailsFormValues }) {
  const router = useRouter();
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: shiftDetailsSchema,
    defaultValues: initial,
    onSave: async (values) => {
      const result = await editShiftDetailsAction(values);
      if (result.ok) router.push(`/carrier/shifts/${initial.shiftId}`);
      return result;
    },
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-slot="shift-details-form">
      <FormField
        label="What the driver will do"
        description="Loads, routes, the yard. The driver sees this after booking."
        error={errorOf("workDescription")}
        errorIcon={false}
        required
      >
        <Textarea {...form.register("workDescription")} maxLength={500} disabled={pending} />
      </FormField>
      <FormField label="Pay" description="Optional. Shown to the booked driver, never in a text." error={errorOf("payText")}>
        <Input {...form.register("payText")} maxLength={80} disabled={pending} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="On-site contact" description="Who the driver asks for." error={errorOf("onsiteContactName")} required>
          <Input {...form.register("onsiteContactName")} autoComplete="off" maxLength={100} disabled={pending} />
        </FormField>
        <FormField label="On-site phone" error={errorOf("onsiteContactPhone")} required>
          <Input {...form.register("onsiteContactPhone")} type="tel" inputMode="tel" autoComplete="off" disabled={pending} />
        </FormField>
      </div>
      {formError && (
        <InlineNote variant="error" role="alert">
          {formError}
        </InlineNote>
      )}
      <LoadingButton type="submit" loading={pending} loadingText="Saving...">
        Save changes
      </LoadingButton>
    </form>
  );
}
