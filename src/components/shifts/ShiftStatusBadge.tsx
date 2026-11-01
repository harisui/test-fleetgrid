import { Ban, CalendarClock, CircleCheck, Clock, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SHIFT_STATUS_LABELS } from "@/lib/shifts/copy";
import type { ShiftStatus } from "@/types/domain";

const STYLES = {
  open: { icon: Radio, variant: "info" },
  booked: { icon: CircleCheck, variant: "success" },
  cancelled: { icon: Ban, variant: "destructive" },
  expired: { icon: Clock, variant: "secondary" },
  scheduled: { icon: CalendarClock, variant: "warning" },
} as const;

/** The shift's state as a word and an icon; "Scheduled" while quiet hours hold the broadcast. */
export function ShiftStatusBadge({ status, scheduled = false }: { status: ShiftStatus; scheduled?: boolean }) {
  const key = scheduled && status === "open" ? "scheduled" : status;
  const style = STYLES[key];
  const Icon = style.icon;
  return (
    <Badge variant={style.variant} data-status={key}>
      <Icon aria-hidden="true" />
      {key === "scheduled" ? "Scheduled" : SHIFT_STATUS_LABELS[status]}
    </Badge>
  );
}
