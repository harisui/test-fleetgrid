"use client";

import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ZipField } from "@/components/driver/ZipField";
import { useStepForm } from "@/components/driver/useStepForm";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Input } from "@/components/ui/input";
import { useZipLookup } from "@/hooks/useZipLookup";
import { CARRIER_OUT_OF_AREA_NOTE } from "@/lib/carrier/options";
import { COMPANY_NAME_MAX_LENGTH, CONTACT_NAME_MAX_LENGTH } from "@/lib/constants";
import { carrierDetailsSchema } from "@/lib/validation/carrier.schema";
import {
  lookupYardZipAction,
  saveCarrierDetailsAction,
  updateCarrierDetailsAction,
} from "@/server/actions/carrier.actions";
import type { Carrier } from "@/types/domain";

interface CarrierDetailsFormProps {
  /** The saved details on the account page; nothing on sign-up. */
  carrier?: Carrier;
}

/**
 * The carrier's company details, one form for sign-up and for the account page: company,
 * contact, billing email, the optional USDOT and MC numbers, and the yard ZIP with its
 * city and state from the dataset.
 */
export function CarrierDetailsForm({ carrier }: CarrierDetailsFormProps) {
  const router = useRouter();
  const editing = carrier !== undefined;
  const { form, submit, pending, formError, errorOf } = useStepForm({
    schema: carrierDetailsSchema,
    defaultValues: {
      companyName: carrier?.companyName ?? "",
      contactName: carrier?.contactName ?? "",
      billingEmail: carrier?.billingEmail ?? "",
      usdot: carrier?.usdot ?? "",
      mc: carrier?.mc ?? "",
      zip: carrier?.zip ?? "",
    },
    onSave: async (values) => {
      const result = editing
        ? await updateCarrierDetailsAction(values)
        : await saveCarrierDetailsAction(values);
      if (result.ok) {
        if (editing) {
          toast.success("Company details saved");
          form.reset(form.getValues());
        } else {
          router.push("/carrier");
        }
      }
      return result;
    },
  });

  const saved = carrier ? { zip: carrier.zip, city: carrier.city, state: carrier.state } : null;
  const lookup = useZipLookup(
    useWatch({ control: form.control, name: "zip" }),
    saved,
    lookupYardZipAction,
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-slot="carrier-details">
      <FormField label="Company name" error={errorOf("companyName")} required>
        <Input
          {...form.register("companyName")}
          autoComplete="organization"
          maxLength={COMPANY_NAME_MAX_LENGTH}
          disabled={pending}
        />
      </FormField>

      <FormField
        label="Contact name"
        description="The person we should talk to about shifts and billing."
        error={errorOf("contactName")}
        required
      >
        <Input
          {...form.register("contactName")}
          autoComplete="name"
          maxLength={CONTACT_NAME_MAX_LENGTH}
          disabled={pending}
        />
      </FormField>

      <FormField
        label="Billing email"
        description="Invoices and receipts go here."
        error={errorOf("billingEmail")}
        required
      >
        <Input
          {...form.register("billingEmail")}
          type="email"
          inputMode="email"
          autoComplete="email"
          disabled={pending}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="USDOT number" description="Optional." error={errorOf("usdot")}>
          <Input {...form.register("usdot")} inputMode="numeric" maxLength={8} disabled={pending} />
        </FormField>
        <FormField label="MC number" description="Optional." error={errorOf("mc")}>
          <Input {...form.register("mc")} inputMode="numeric" maxLength={8} disabled={pending} />
        </FormField>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-label leading-label font-semibold">Where is your yard?</p>
        <p className="text-helper leading-helper text-muted-foreground">
          Driver search measures distance from this ZIP.
        </p>
      </div>
      <ZipField
        input={form.register("zip")}
        lookup={lookup}
        error={errorOf("zip")}
        disabled={pending}
        required
      />
      {lookup.inServiceArea === false && (
        <InlineNote variant="info" data-slot="launch-area-note">
          {CARRIER_OUT_OF_AREA_NOTE}
        </InlineNote>
      )}

      {formError && (
        <InlineNote variant="error" role="alert">
          {formError}
        </InlineNote>
      )}

      <LoadingButton type="submit" loading={pending} loadingText="Saving...">
        {editing ? "Save changes" : "Save and continue"}
      </LoadingButton>
    </form>
  );
}
