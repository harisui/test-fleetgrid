import { CalendarDays, MapPin } from "lucide-react";
import { shiftTimeRange } from "@/lib/shifts/copy";
import type { Shift } from "@/types/domain";

/** When and where, the two lines every shift card starts with. */
export function ShiftSummary({ shift }: { shift: Pick<Shift, "startsAt" | "endsAt" | "city" | "state" | "zip"> }) {
  return (
    <div className="flex flex-col gap-1 text-body leading-body">
      <p className="flex items-center gap-2">
        <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <span>{shiftTimeRange(shift)}</span>
      </p>
      <p className="flex items-center gap-2">
        <MapPin aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <span>
          {shift.city} {shift.state} {shift.zip}
        </span>
      </p>
    </div>
  );
}
