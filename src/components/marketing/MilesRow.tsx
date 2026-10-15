import { Truck } from "lucide-react";
import { Reveal, Stagger } from "@/components/marketing/Reveal";
import { HOME } from "@/content/marketing";

/**
 * "How a shift gets filled": four miles on one lane-line bar. The bar's fill and the truck
 * travel its length as the row reveals (globals.css), and the four steps arrive one after
 * the other. Static without motion.
 */
export function MilesRow() {
  const { steps } = HOME.miles;
  return (
    <Reveal data-slot="miles" className="flex flex-col gap-6">
      <div className="relative pt-5" aria-hidden="true">
        <div className="relative h-2 overflow-hidden rounded-badge bg-progress-track">
          <div data-slot="miles-fill" className="absolute inset-y-0 left-0 w-full rounded-badge bg-progress-fill" />
          <div className="lane-line absolute inset-x-1 top-1/2 h-px -translate-y-1/2" />
        </div>
        <Truck
          data-slot="miles-truck"
          className="absolute top-0 size-5 -translate-x-1/2 text-foreground"
        />
      </div>
      <ol className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4" aria-label="The four miles">
        <Stagger>
          {steps.map((step) => (
            <Reveal as="li" key={step.mile} className="flex flex-col gap-2">
              <span className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase">
                {step.mile}
              </span>
              <span className="text-helper leading-helper text-muted-foreground">{step.text}</span>
            </Reveal>
          ))}
        </Stagger>
      </ol>
    </Reveal>
  );
}
