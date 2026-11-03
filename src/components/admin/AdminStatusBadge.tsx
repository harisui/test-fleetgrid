import { CircleDashed } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { DRIVER_STATUS_LABELS } from "@/lib/drivers/tiers";
import type { AccountStatus } from "@/types/domain";

/** The review states plus "incomplete": a card that is not finished cannot be approved. */
export type AdminBadgeStatus = AccountStatus | "incomplete";

const REVIEW_LABELS: Record<AccountStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  blocked: "Blocked",
};

/**
 * Icon and text, never color alone: clock, check, ban, or the dashed circle for incomplete.
 * Drivers read Registered, Shift-Ready and Blocked (CR-5); carriers keep their own words.
 */
export function AdminStatusBadge({
  status,
  kind = "carrier",
  className,
}: {
  status: AdminBadgeStatus;
  kind?: "driver" | "carrier";
  className?: string;
}) {
  if (status === "incomplete") {
    return (
      <Badge variant="secondary" data-status="incomplete" className={className}>
        <CircleDashed aria-hidden="true" />
        Incomplete
      </Badge>
    );
  }
  const label = kind === "driver" ? DRIVER_STATUS_LABELS[status] : REVIEW_LABELS[status];
  return <StatusBadge status={status} label={label} className={className} />;
}
