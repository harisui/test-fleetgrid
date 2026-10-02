import { Building2, MessageSquareText, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Certified operators",
    text: "CDL drivers, yard spotters and mechanics with their qualifications on file.",
  },
  {
    icon: MessageSquareText,
    title: "Shifts by text",
    text: "Offers arrive by SMS. The first qualified driver to reply YES gets the shift.",
  },
] as const;

export default function LandingPage() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-8 text-center sm:py-16">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Local freight shifts, filled fast
          </h1>
          <p className="text-muted-foreground text-lg">
            <strong className="text-foreground font-semibold">Carriers:</strong> find certified
            transport operators near you and fill open shifts in minutes.
          </p>
          <p className="text-muted-foreground text-lg">
            <strong className="text-foreground font-semibold">Drivers:</strong> build your
            qualification card once and get matching shift offers by text.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="touch" className="h-12 sm:min-w-48">
            <Link href="/login?role=driver">
              <Truck aria-hidden="true" />
              I&apos;m a Driver
            </Link>
          </Button>
          <Button asChild size="touch" variant="outline" className="h-12 sm:min-w-48">
            <Link href="/login?role=carrier">
              <Building2 aria-hidden="true" />
              I&apos;m a Carrier
            </Link>
          </Button>
        </div>

        <ul className="grid w-full gap-4 text-left sm:grid-cols-2">
          {POINTS.map((point) => (
            <li key={point.title} className="border-border bg-card rounded-lg border p-4">
              <point.icon aria-hidden="true" className="text-muted-foreground size-6" />
              <h2 className="mt-3 font-semibold">{point.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm">{point.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
