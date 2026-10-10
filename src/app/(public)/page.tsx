import {
  Building2,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { LAUNCH_LINE } from "@/lib/launch";
import { formatE164ForDisplay } from "@/lib/phone";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Certified drivers",
    text: "CDL drivers with their class, endorsements, cards and record on file.",
  },
  {
    icon: MessageSquareText,
    title: "Shifts by text",
    text: "Offers arrive by SMS. The first qualified driver to reply YES gets the shift.",
  },
] as const;

const HOW_IT_WORKS = [
  {
    title: "Carriers",
    icon: Building2,
    steps: [
      "Subscribe to FleetGrid.",
      "Search qualified drivers near your yard.",
      "Broadcast a shift. The first driver to reply YES has it.",
    ],
  },
  {
    title: "Drivers",
    icon: Truck,
    steps: [
      "Sign up on your phone with a text code.",
      "Build your qualification card in six short pages.",
      "Get shift offers by text and reply YES to claim one.",
    ],
  },
] as const;

const ABOUT = [
  `${BUSINESS_NAME} runs a confidential directory that connects local freight carriers with certified CDL drivers.`,
  "FleetGrid is launching in the Houston, Texas area first, with more areas to follow as carriers join.",
  "It serves carriers who need a qualified driver for a shift today, and drivers who want local work offered straight to their phone.",
] as const;

const linkClass = "text-foreground underline underline-offset-4";
const headingClass = "font-heading text-h2 leading-h2 font-semibold";

export default function LandingPage() {
  const contact = getSupportContact();
  return (
    <AppShell>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-10 py-8 text-center sm:py-16">
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
          <p
            className="inline-flex items-center justify-center gap-2 font-semibold text-foreground"
            data-slot="launch-line"
          >
            <MapPin aria-hidden="true" className="size-5 text-muted-foreground" />
            {LAUNCH_LINE}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-start">
          <div className="flex flex-col gap-2">
            <Button asChild className="sm:min-w-48">
              <Link href="/login?role=driver">
                <Truck aria-hidden="true" />
                I&apos;m a Driver
              </Link>
            </Button>
            <p
              className="text-small leading-small text-muted-foreground sm:max-w-48"
              data-slot="sms-opt-in-line"
            >
              Drivers can opt in to receive shift offers by text. See{" "}
              <Link href="/sms-terms" className={linkClass}>
                SMS Terms
              </Link>
              .
            </p>
          </div>
          <Button asChild variant="secondary" className="sm:min-w-48">
            <Link href="/login?role=carrier">
              <Building2 aria-hidden="true" />
              I&apos;m a Carrier
            </Link>
          </Button>
        </div>

        <ul className="grid w-full gap-4 text-left sm:grid-cols-2">
          {POINTS.map((point) => (
            <li key={point.title} className="rounded-card border border-border bg-card p-4">
              <point.icon aria-hidden="true" className="size-6 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">{point.title}</h2>
              <p className="mt-1 text-helper leading-helper text-muted-foreground">{point.text}</p>
            </li>
          ))}
        </ul>

        <section
          aria-labelledby="how-it-works"
          className="flex w-full flex-col gap-4 text-left"
          data-slot="how-it-works"
        >
          <h2 id="how-it-works" className={headingClass}>
            How it works
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {HOW_IT_WORKS.map((column) => (
              <div key={column.title} className="rounded-card border border-border bg-card p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <column.icon aria-hidden="true" className="size-5 text-muted-foreground" />
                  {column.title}
                </h3>
                <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-helper leading-helper text-muted-foreground">
                  {column.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="about"
          className="flex w-full flex-col gap-3 text-left"
          data-slot="about"
        >
          <h2 id="about" className={headingClass}>
            About FleetGrid
          </h2>
          <p className="text-muted-foreground">{ABOUT.join(" ")}</p>
        </section>

        <section
          aria-labelledby="contact"
          className="flex w-full flex-col gap-3 text-left"
          data-slot="contact"
        >
          <h2 id="contact" className={headingClass}>
            Contact
          </h2>
          <address className="flex flex-col gap-2 not-italic text-muted-foreground">
            <p className="flex items-center gap-2">
              <Mail aria-hidden="true" className="size-5 shrink-0" />
              <a href={`mailto:${contact.email}`} className={linkClass}>
                {contact.email}
              </a>
            </p>
            <p className="flex items-center gap-2">
              <Phone aria-hidden="true" className="size-5 shrink-0" />
              <a href={`tel:${contact.phone}`} className={linkClass}>
                {formatE164ForDisplay(contact.phone)}
              </a>
            </p>
            <p className="flex items-start gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>
                {BUSINESS_NAME}
                {contact.address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </p>
          </address>
        </section>
      </div>
    </AppShell>
  );
}
