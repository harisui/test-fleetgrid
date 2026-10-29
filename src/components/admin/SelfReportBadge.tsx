import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CLEARINGHOUSE_SELF_REPORT_BADGE } from "@/lib/onboarding/options";

/**
 * The driver's own "no unresolved Clearinghouse violations, not in SAP" answer. Neutral on
 * purpose (never the success tone, never "clean"): it is the driver's word, not a check.
 */
export function SelfReportBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" data-self-report="yes" className={className}>
      <ShieldCheck aria-hidden="true" />
      {CLEARINGHOUSE_SELF_REPORT_BADGE}
    </Badge>
  );
}
