import type { StepId } from "@/lib/onboarding/steps";
import {
  AVAILABILITY_OPTIONS,
  CDL_CLASS_OPTIONS,
  WORK_TYPE_OPTIONS,
} from "@/lib/onboarding/options";
import type { Driver } from "@/types/domain";

interface SummaryCardProps {
  driver: Driver;
  /** Jumps back to the screen that collects the row. */
  onEdit: (stepId: StepId) => void;
}

interface Row {
  label: string;
  value: string;
  stepId: StepId;
}

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

/** The answers that matter most, each with a way back to change it. */
export function SummaryCard({ driver, onEdit }: SummaryCardProps) {
  const rows: Row[] = [
    {
      label: "Work type",
      value: driver.operatorTypes.map((type) => labelOf(WORK_TYPE_OPTIONS, type)).join(", "),
      stepId: "workType",
    },
    { label: "CDL class", value: labelOf(CDL_CLASS_OPTIONS, driver.cdlClass), stepId: "cdlClass" },
    {
      label: "Endorsements",
      value: driver.endorsements.length > 0 ? driver.endorsements.join(", ") : "None",
      stepId: driver.cdlClass === "none" ? "cdlClass" : "endorsements",
    },
    {
      label: "Availability",
      value: driver.availability.map((type) => labelOf(AVAILABILITY_OPTIONS, type)).join(", "),
      stepId: "availability",
    },
  ];

  return (
    <dl
      className="divide-y divide-border rounded-card border border-border-strong bg-card"
      data-slot="summary-card"
    >
      {rows.map((row) => (
        <div key={row.label} className="flex min-h-14 items-center gap-3 px-4 py-3">
          <dt className="w-28 shrink-0 text-helper leading-helper text-muted-foreground">
            {row.label}
          </dt>
          {/* The button sits inside the dd: a dl allows nothing else beside dt and dd. */}
          <dd className="flex min-w-0 flex-1 items-center gap-3">
            <span className="min-w-0 flex-1 text-label leading-label font-semibold">
              {row.value}
            </span>
            <button
              type="button"
              onClick={() => onEdit(row.stepId)}
              aria-label={`Edit ${row.label.toLowerCase()}`}
              className="flex min-h-target shrink-0 items-center rounded-badge px-2 text-label font-semibold underline underline-offset-4 hover:bg-muted"
            >
              Edit
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}
