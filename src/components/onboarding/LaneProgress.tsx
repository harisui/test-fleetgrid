import { Check, Truck } from "lucide-react";
import { MILES, progressFor, type StepId } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

interface LaneProgressProps {
  stepId: StepId;
}

/**
 * The road. An 8px track with a dashed lane line, the orange fill and a line-icon truck
 * riding the fill edge. Everything is derived from steps.ts. The truck moves only when the
 * step changes (a 200ms transition), never on its own.
 * Screen readers hear "Step 2 of 5: Work", not the mile metaphor.
 */
export function LaneProgress({ stepId }: LaneProgressProps) {
  const progress = progressFor(stepId);
  const position = `${progress.percent}%`;

  return (
    <div className="flex flex-col gap-2" data-slot="lane-progress" data-step={stepId}>
      <div className="relative pt-4">
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={MILES.length}
          aria-valuenow={progress.mile.mile}
          aria-valuetext={progress.srLabel}
          className="relative h-2 overflow-hidden rounded-badge bg-progress-track"
        >
          <div
            aria-hidden="true"
            data-slot="lane-fill"
            className="absolute inset-y-0 left-0 rounded-badge bg-progress-fill transition-[width] duration-(--dur-move) ease-standard"
            style={{ width: position }}
          />
          {/* The dashed lane line runs over the fill, like paint on the road. */}
          <div
            aria-hidden="true"
            className="lane-line absolute inset-x-1 top-1/2 h-px -translate-y-1/2"
          />
        </div>
        <Truck
          aria-hidden="true"
          data-slot="lane-truck"
          className="absolute top-0 size-5 -translate-x-1/2 text-foreground transition-[left] duration-(--dur-move) ease-standard"
          style={{ left: position }}
        />
      </div>

      <ol className="flex justify-between gap-2 text-small leading-small" aria-label="Stages">
        {MILES.map((mile) => {
          const done = progress.completedMiles.includes(mile.mile);
          const current = mile.mile === progress.mile.mile;
          return (
            <li
              key={mile.mile}
              data-mile={mile.mile}
              data-state={done ? "done" : current ? "current" : "upcoming"}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-1",
                current
                  ? "font-semibold text-foreground underline decoration-2 underline-offset-4"
                  : done
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {done && <Check aria-hidden="true" className="size-4 text-success" />}
              <span className="sr-only">
                {done ? `Stage ${mile.mile}, done:` : `Stage ${mile.mile}:`}
              </span>
              {mile.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
