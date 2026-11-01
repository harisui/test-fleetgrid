"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/FormField";
import { InlineNote } from "@/components/shared/InlineNote";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAreaAction, previewAreaAction, updateAreaAction } from "@/server/actions/admin-ops.actions";
import type { AreaPreview } from "@/server/services/AdminOpsService";
import type { ServiceArea } from "@/types/domain";

/**
 * Add or edit a service area: a name, the centre ZIP (its coordinates come from the dataset)
 * and a radius of 5 to 250 miles. Before saving it says how many drivers and carriers are
 * inside, so the admin sees the effect (T3.11).
 */
export function ServiceAreaForm({ area, onDone }: { area?: ServiceArea; onDone?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(area?.name ?? "");
  const [centerZip, setCenterZip] = useState(area?.centerZip ?? "");
  const [radius, setRadius] = useState(String(area?.radiusMiles ?? 50));
  const [preview, setPreview] = useState<AreaPreview | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const ready = /^\d{5}$/.test(centerZip) && Number(radius) >= 5 && Number(radius) <= 250;
  useEffect(() => {
    if (!/^\d{5}$/.test(centerZip) || Number(radius) < 5 || Number(radius) > 250) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await previewAreaAction({ centerZip, radiusMiles: radius });
      if (live) setPreview(result.ok ? result.data : null);
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [centerZip, radius]);

  const save = () =>
    startTransition(async () => {
      const input = { name, centerZip, radiusMiles: radius };
      const result = area ? await updateAreaAction({ ...input, areaId: area.id }) : await createAreaAction(input);
      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? { form: result.error.message });
        return;
      }
      setErrors({});
      toast.success(area ? "Area saved" : "Area added");
      if (!area) {
        setName("");
        setCenterZip("");
        setRadius("50");
        setPreview(null);
      }
      onDone?.();
      router.refresh();
    });

  return (
    <form
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-4"
      data-slot="area-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="Name" error={errors.name} required>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Houston, TX" />
        </FormField>
        <FormField label="Centre ZIP" error={errors.centerZip} required>
          <Input value={centerZip} onChange={(event) => setCenterZip(event.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" />
        </FormField>
        <FormField label="Radius in miles" description="5 to 250." error={errors.radiusMiles} required>
          <Input value={radius} onChange={(event) => setRadius(event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" />
        </FormField>
      </div>
      <p role="status" className="text-body leading-body" data-slot="area-preview">
        {ready && preview
          ? `Centre ${preview.city} ${preview.state}. ${preview.drivers} drivers and ${preview.carriers} carriers inside this area.`
          : "Enter the centre ZIP and the radius to see who is inside."}
      </p>
      {errors.form && (
        <InlineNote variant="error" role="alert">
          {errors.form}
        </InlineNote>
      )}
      <div className="flex flex-wrap gap-3">
        <LoadingButton type="submit" size="md" loading={pending} loadingText="Saving...">
          {area ? "Save area" : "Add area"}
        </LoadingButton>
        {onDone && (
          <Button type="button" variant="secondary" size="md" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
