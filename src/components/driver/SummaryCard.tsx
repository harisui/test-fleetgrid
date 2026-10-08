import type { StepId } from "@/lib/onboarding/steps";
import {
  AVAILABILITY_OPTIONS,
  CARD_CHECKS,
  CDL_CLASS_OPTIONS,
  DRIVING_STYLE_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EQUIPMENT_CHIPS,
  TRANSMISSION_OPTIONS,
  WORK_TYPE_OPTIONS,
  type CardCheck,
} from "@/lib/onboarding/options";
import { isCdlDriver, type Driver } from "@/types/domain";

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

const NOT_ANSWERED = "Not answered";

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

const labelsOf = <T extends string>(
  options: readonly { value: T; label: string }[],
  values: readonly T[],
) => values.map((value) => labelOf(options, value)).join(", ");

/** How a yes-or-no answer reads in a sentence, for example "TWIC" or "No TWIC". */
export function checkSummary(check: CardCheck, value: boolean | null): string {
  if (value === null) return NOT_ANSWERED;
  return CARD_CHECKS[check].summary[value ? "yes" : "no"];
}

/** The answers that matter most, each with a way back to change it. */
export function SummaryCard({ driver, onEdit }: SummaryCardProps) {
  const cdl = isCdlDriver(driver.operatorTypes);
  const rows: Row[] = [
    {
      label: "Work type",
      value: labelsOf(WORK_TYPE_OPTIONS, driver.operatorTypes),
      stepId: "workType",
    },
    {
      label: "Pay",
      value: driver.employmentType
        ? labelOf(EMPLOYMENT_TYPE_OPTIONS, driver.employmentType)
        : NOT_ANSWERED,
      stepId: "employmentType",
    },
    ...(cdl
      ? [
          {
            label: "Driving",
            value: labelsOf(DRIVING_STYLE_OPTIONS, driver.drivingStyles) || NOT_ANSWERED,
            stepId: "drivingStyle" as const,
          },
          {
            label: "Equipment",
            value:
              [
                labelsOf(EQUIPMENT_CHIPS, driver.equipmentTypes),
                driver.transmission && labelOf(TRANSMISSION_OPTIONS, driver.transmission),
              ]
                .filter(Boolean)
                .join(" · ") || NOT_ANSWERED,
            stepId: "equipment" as const,
          },
        ]
      : []),
    { label: "CDL class", value: labelOf(CDL_CLASS_OPTIONS, driver.cdlClass), stepId: "cdlClass" },
    {
      label: "Endorsements",
      value: driver.endorsements.length > 0 ? driver.endorsements.join(", ") : "None",
      stepId: driver.cdlClass === "none" ? "cdlClass" : "endorsements",
    },
    {
      label: "Cards",
      value: `${checkSummary("twicActive", driver.twicActive)}, ${checkSummary("medicalCardActive", driver.medicalCardActive)}`,
      stepId: "credentials",
    },
    ...(cdl
      ? [
          {
            label: "Record",
            value: `${checkSummary("clearinghouseRegistered", driver.clearinghouseRegistered)}, ${checkSummary("mvrClean3Years", driver.mvrClean3Years)}`,
            stepId: "compliance" as const,
          },
        ]
      : []),
    {
      label: "Availability",
      value: labelsOf(AVAILABILITY_OPTIONS, driver.availability),
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
