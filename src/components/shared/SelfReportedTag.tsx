import { Badge } from "@/components/ui/badge";
import { SELF_REPORTED } from "@/lib/drivers/tiers";

/** Marks an answer as the driver's own word (Clearinghouse, TWIC, experience), not a check. */
export function SelfReportedTag() {
  return (
    <Badge variant="secondary" data-slot="self-reported">
      {SELF_REPORTED}
    </Badge>
  );
}
