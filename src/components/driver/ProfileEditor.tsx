"use client";

import { toast } from "sonner";
import { AvailabilityFields, BasicsFields, LicensesFields } from "@/components/driver/CardFields";
import { useStepForm } from "@/components/driver/useStepForm";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { driverCardSchema } from "@/lib/validation/driver.schema";
import { updateCardAction } from "@/server/actions/driver.actions";
import type { Driver } from "@/types/domain";

interface ProfileEditorProps {
  driver: Driver;
}

/** Edit every field of a completed qualification card in one form. */
export function ProfileEditor({ driver }: ProfileEditorProps) {
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: driverCardSchema,
    defaultValues: {
      fullName: driver.fullName,
      city: driver.city ?? "",
      state: driver.state ?? "",
      zip: driver.zip ?? "",
      serviceRadiusMiles: driver.serviceRadiusMiles,
      operatorTypes: driver.operatorTypes,
      cdlClass: driver.cdlClass,
      endorsements: driver.endorsements,
      yearsExperience: driver.yearsExperience ?? undefined,
      certifications: driver.certifications,
      availability: driver.availability,
      bio: driver.bio ?? "",
    },
    onSave: async (values) => {
      const result = await updateCardAction(values);
      if (result.ok) {
        toast.success("Profile saved");
        // The saved values become the new baseline, so "unsaved changes" resets.
        form.reset(form.getValues());
      }
      return result;
    },
  });

  const cdlClass = form.watch("cdlClass") ?? "none";
  const bioLength = (form.watch("bio") ?? "").length;
  const shared = {
    control: form.control,
    register: form.register,
    errorOf,
    disabled: pending,
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">Basics</legend>
        <BasicsFields {...shared} />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">
          Role and licenses
        </legend>
        <LicensesFields {...shared} cdlClass={cdlClass} />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">Availability</legend>
        <AvailabilityFields {...shared} bioLength={bioLength} />
      </fieldset>

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
