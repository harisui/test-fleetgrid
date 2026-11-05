import { formatInTimeZone } from "date-fns-tz";
import { CalendarClock, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { missingDocumentsLabel, SHIFT_READY_ITEM_LABELS, type ShiftReadyItem } from "@/lib/drivers/tiers";
import type { AccountStatus, DocumentType } from "@/types/domain";

/**
 * "Missing: CDL / medical card" (CR-5): what a Registered driver still has to upload. Icon and
 * words, never color alone. Nothing for a driver who has them all, or who is not Registered.
 */
export function MissingDocumentsBadge({
  status,
  missing,
  className,
}: {
  status: AccountStatus;
  missing: readonly DocumentType[];
  className?: string;
}) {
  if (status !== "pending" || missing.length === 0) return null;
  return (
    <Badge variant="warning" data-slot="missing-documents" className={className}>
      <FileWarning aria-hidden="true" />
      {missingDocumentsLabel(missing)}
    </Badge>
  );
}

/** "Needs update by Nov 19: Medical card, Texas CDL" (grace period, 0028). Nothing outside it. */
export function NeedsUpdateBadge({
  until,
  missing,
  className,
}: {
  until: string | null;
  missing: readonly ShiftReadyItem[];
  className?: string;
}) {
  if (until === null || missing.length === 0) return null;
  const date = formatInTimeZone(new Date(until), "America/Chicago", "MMM d");
  return (
    <Badge variant="warning" data-slot="needs-update" className={className}>
      <CalendarClock aria-hidden="true" />
      Needs update by {date}: {missing.map((item) => SHIFT_READY_ITEM_LABELS[item]).join(", ")}
    </Badge>
  );
}
