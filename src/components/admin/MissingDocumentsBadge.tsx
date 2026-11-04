import { FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { missingDocumentsLabel } from "@/lib/drivers/tiers";
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
