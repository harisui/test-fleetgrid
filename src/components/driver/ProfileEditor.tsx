"use client";

import { toast } from "sonner";
import {
  AvailabilityFields,
  BasicsFields,
  ChecksFields,
  LicensesFields,
} from "@/components/driver/CardFields";
import { useStepForm } from "@/components/driver/useStepForm";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { driverCardSchema } from "@/lib/validation/driver.schema";
import { updateCardAction } from "@/server/actions/driver.actions";
import { isCdlDriver, type Driver } from "@/types/domain";

interface ProfileEditorProps {
  driver: Driver;
}

const SECTIONS = {
  basics: "Basics",
  licenses: "Role and licenses",
  checks: "Equipment and checks",
  availability: "Availability",
} as const;

/** Edit every field of a completed qualification card in one form. */
export function ProfileEditor({ driver }: ProfileEditorProps) {
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: driverCardSchema,
    defaultValues: {
      fullName: driver.fullName,
      zip: driver.zip ?? "",
      serviceRadiusMiles: driver.serviceRadiusMiles,
      operatorTypes: driver.operatorTypes,
      employmentType: driver.employmentType ?? undefined,
      cdlClass: driver.cdlClass,
      endorsements: driver.endorsements,
      yearsExperience: driver.yearsExperience ?? undefined,
      certifications: driver.certifications,
      drivingStyles: driver.drivingStyles,
      transmission: driver.transmission ?? undefined,
      equipmentTypes: driver.equipmentTypes,
      twicActive: driver.twicActive ?? undefined,
      medicalCardActive: driver.medicalCardActive ?? undefined,
      clearinghouseRegistered: driver.clearinghouseRegistered ?? undefined,
      mvrClean3Years: driver.mvrClean3Years ?? undefined,
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

  const place =
    driver.zip && driver.city && driver.state
      ? { zip: driver.zip, city: driver.city, state: driver.state }
      : null;
  const cdlClass = form.watch("cdlClass") ?? "none";
  const cdlDriver = isCdlDriver(form.watch("operatorTypes") ?? []);
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
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">
          {SECTIONS.basics}
        </legend>
        <BasicsFields {...shared} place={place} />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">
          {SECTIONS.licenses}
        </legend>
        <LicensesFields {...shared} cdlClass={cdlClass} />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">
          {SECTIONS.checks}
        </legend>
        <ChecksFields {...shared} cdlDriver={cdlDriver} />
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-4 font-heading text-h2 leading-h2 font-semibold">
          {SECTIONS.availability}
        </legend>
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
