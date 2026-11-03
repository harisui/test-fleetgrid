import { CircleCheck, CircleX, FileText, RotateCcw } from "lucide-react";
import { FormField } from "@/components/shared/FormField";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  SHIFT_READY_ITEM_LABELS,
  SHIFT_READY_ITEMS,
  SHIFT_READY_PHOTO_NOTE,
  type ShiftReadyItem,
} from "@/lib/drivers/tiers";
import type { ShiftReadyPhoto } from "@/server/services/AdminService";

const PHOTO_LABELS = { cdl_front: "CDL front", cdl_back: "CDL back", medical_card: "Medical card" } as const;

/** "Re-review needed" (CR-5): a Shift-Ready driver changed a required document or the CDL state. */
export function RereviewBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className} data-slot="rereview">
      <RotateCcw aria-hidden="true" />
      Re-review needed
    </Badge>
  );
}

/**
 * The admin's Shift-Ready review in the driver sheet (CR-5): the checklist, the three photos
 * side by side with the note, and, for a CDL from another state, the reason box.
 */
export function ShiftReadyReview({
  missing,
  photos,
  cdlState,
  rereviewNeeded,
  approved,
  override,
  onOverrideChange,
  overrideError,
}: {
  missing: ShiftReadyItem[];
  photos: ShiftReadyPhoto[];
  cdlState: string | null;
  rereviewNeeded: boolean;
  approved: boolean;
  override: string;
  onOverrideChange: (value: string) => void;
  overrideError?: string;
}) {
  const needsOverride = cdlState !== "TX";
  return (
    <section className="flex flex-col gap-3" aria-labelledby="shift-ready-review" data-slot="shift-ready-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="shift-ready-review" className="text-eyebrow leading-eyebrow font-semibold tracking-wide text-muted-foreground uppercase">
          Shift-Ready review
        </h3>
        {rereviewNeeded && <RereviewBadge />}
      </div>
      <ul className="grid gap-1 sm:grid-cols-2" aria-label="Shift-Ready checklist" id="shift-ready-checklist">
        {SHIFT_READY_ITEMS.map((item) => {
          // The CDL state can be met by the reason typed below.
          const open = missing.includes(item) && !(item === "cdl_state" && override.trim().length >= 5);
          const label =
            item === "cdl_state" && cdlState !== "TX" && !open && !approved
              ? `${SHIFT_READY_ITEM_LABELS[item]} (override)`
              : item === "last_name" && !open
                ? "First and last name"
                : item === "profile" && !open
                  ? "Profile complete"
                  : SHIFT_READY_ITEM_LABELS[item];
          return (
            <li key={item} className="flex items-center gap-2 text-helper leading-helper" data-done={!open}>
              {open ? (
                <CircleX aria-hidden="true" className="size-4 shrink-0 text-destructive" />
              ) : (
                <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
              )}
              <span>
                <span className="sr-only">{open ? "Missing: " : "Done: "}</span>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-3 gap-2" data-slot="shift-ready-photos">
        {photos.map((photo) => (
          <figure key={photo.type} className="flex flex-col gap-1">
            {photo.url && photo.document?.mimeType.startsWith("image/") ? (
              <a href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-field border border-border bg-muted">
                {/* A short-lived signed link to a private file; next/image cannot optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={PHOTO_LABELS[photo.type]} className="aspect-[4/3] w-full object-cover" />
              </a>
            ) : photo.url ? (
              <a
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="flex aspect-[4/3] items-center justify-center gap-1 rounded-field border border-border bg-muted text-helper underline"
              >
                <FileText aria-hidden="true" className="size-4" /> Open PDF
              </a>
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-field border border-dashed border-border-strong text-helper text-muted-foreground">
                {photo.document ? "Could not load" : "Not uploaded"}
              </div>
            )}
            <figcaption className="text-small leading-small text-muted-foreground">{PHOTO_LABELS[photo.type]}</figcaption>
          </figure>
        ))}
      </div>
      <p className="text-helper leading-helper" data-slot="shift-ready-note">
        {SHIFT_READY_PHOTO_NOTE}
      </p>
      {needsOverride && !approved && (
        <FormField
          label={`Why may this driver be Shift-Ready with a ${cdlState ?? "missing"} CDL state?`}
          description="Needed for a CDL from outside Texas. Kept with the card and in the history."
          error={overrideError}
          errorIcon={false}
        >
          <Textarea value={override} onChange={(event) => onOverrideChange(event.target.value)} maxLength={300} className="min-h-20" />
        </FormField>
      )}
    </section>
  );
}
