"use client";

import { QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DetailSheet } from "@/components/admin/DetailSheet";
import { FormField } from "@/components/shared/FormField";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { SelectInput } from "@/components/shared/SelectInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { analyticsHref, QR_DONE } from "@/lib/admin/analytics-options";
import { slugify } from "@/lib/qr/slug";
import { DEFAULT_CAMPAIGN, LANDING_PATHS, type Period } from "@/lib/validation/qr.schema";
import { createQrLinkAction } from "@/server/actions/qr.actions";

const SLUG_HELP = "Lowercase letters, digits and dashes. Made from the location unless you change it.";

/**
 * "Generate QR code" in the top bar: a sheet with the location, the campaign, the landing
 * page and the slug, which follows the location name until edited. Saving makes the record
 * and opens its sheet with the code, the short link and the downloads.
 */
export function GenerateQrSheet({ period }: { period: Period }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [campaign, setCampaign] = useState(DEFAULT_CAMPAIGN);
  const [targetPath, setTargetPath] = useState<string>("/");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const effectiveSlug = slugEdited ? slug : slugify(locationName);

  function reset() {
    setLocationName("");
    setCampaign(DEFAULT_CAMPAIGN);
    setTargetPath("/");
    setSlug("");
    setSlugEdited(false);
    setErrors({});
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    const result = await createQrLinkAction({ locationName, campaign, targetPath, slug: effectiveSlug });
    setPending(false);
    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      if (!result.error.fieldErrors) toast.error(result.error.message);
      return;
    }
    toast.success(QR_DONE.created);
    setOpen(false);
    reset();
    router.push(analyticsHref({ period, open: result.data.id }));
  }

  return (
    <>
      <Button type="button" size="md" onClick={() => setOpen(true)}>
        <QrCode aria-hidden="true" />
        Generate QR code
      </Button>
      <DetailSheet
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
        title="Generate QR code"
        description="One code per place a flyer hangs. The printed code carries the short link, never the long address."
        footer={
          <>
            <Button type="button" variant="secondary" size="md" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <LoadingButton type="submit" form="generate-qr" size="md" loading={pending} loadingText="Saving...">
              Save and show the code
            </LoadingButton>
          </>
        }
      >
        <form id="generate-qr" onSubmit={submit} noValidate className="flex flex-col gap-5">
          <FormField label="Location name" description="Printed under the code, for example Love's, Hwy 225." error={errors.locationName} required>
            <Input value={locationName} onChange={(event) => setLocationName(event.target.value)} maxLength={80} autoFocus />
          </FormField>
          <FormField label="Campaign" description="Groups codes in the reports." error={errors.campaign} required>
            <Input value={campaign} onChange={(event) => setCampaign(event.target.value)} className="font-mono" />
          </FormField>
          <FormField label="Landing page" error={errors.targetPath} errorIcon={false}>
            <SelectInput value={targetPath} onValueChange={setTargetPath} options={LANDING_PATHS} />
          </FormField>
          <FormField label="Slug" description={SLUG_HELP} error={errors.slug} required>
            <Input
              value={effectiveSlug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase());
              }}
              className="font-mono"
            />
          </FormField>
          <p className="text-helper leading-helper text-muted-foreground" data-slot="short-link-preview">
            Short link: <span className="font-mono">/q/{effectiveSlug || "..."}</span>
          </p>
        </form>
      </DetailSheet>
    </>
  );
}
