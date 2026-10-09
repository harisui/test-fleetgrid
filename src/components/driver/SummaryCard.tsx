import type { StepId } from "@/lib/onboarding/steps";
import {
  CARD_CHECKS,
  CDL_CLASS_OPTIONS,
  EQUIPMENT_CHIPS,
  EXPERIENCE_CHIPS,
  experienceChipFor,
  MVR_SUMMARY,
  TRANSMISSION_OPTIONS,
  type CardCheck,
} from "@/lib/onboarding/options";
import type { Driver, MvrStatus } from "@/types/domain";

interface SummaryCardProps {
  driver: Driver;
  /** Jumps back to the page that collects the row. */
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

/** How the MVR level reads, for example "No violations in 3 years". */
export function mvrSummary(status: MvrStatus | null): string {
  return status === null ? NOT_ANSWERED : MVR_SUMMARY[status];
}

/** The years as the range chip the driver tapped, for example "6 to 10 years". */
export function experienceSummary(years: number | null): string {
  const chip = EXPERIENCE_CHIPS.find((candidate) => candidate.value === experienceChipFor(years));
  return chip ? `${chip.label} years` : NOT_ANSWERED;
}

/** Every answer of the sign-up, in flow order, each with a way back to change it. */
export function SummaryCard({ driver, onEdit }: SummaryCardProps) {
  const rows: Row[] = [
    {
      label: "CDL class",
      value: driver.cdlClass === "none" ? NOT_ANSWERED : labelOf(CDL_CLASS_OPTIONS, driver.cdlClass),
      stepId: "cdlClass",
    },
    { label: "Experience", value: experienceSummary(driver.yearsExperience), stepId: "experience" },
    { label: "Record", value: mvrSummary(driver.mvrStatus), stepId: "record" },
    {
      label: "Cards",
      value: `${checkSummary("twicActive", driver.twicActive)}, ${checkSummary("medicalCardActive", driver.medicalCardActive)}`,
      stepId: "credentials",
    },
    {
      label: "Endorsements",
      value: driver.endorsements.length > 0 ? driver.endorsements.join(", ") : "None",
      stepId: "endorsements",
    },
    {
      label: "Transmission",
      value: driver.transmission
        ? labelOf(TRANSMISSION_OPTIONS, driver.transmission)
        : NOT_ANSWERED,
      stepId: "transmission",
    },
    {
      label: "Equipment",
      value: labelsOf(EQUIPMENT_CHIPS, driver.equipmentTypes) || NOT_ANSWERED,
      stepId: "equipment",
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
