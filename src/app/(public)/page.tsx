import {
  BadgeDollarSign,
  Building2,
  Container,
  FileX2,
  IdCard,
  MapPin,
  MessageSquareOff,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { DeviceFrame } from "@/components/marketing/DeviceFrame";
import { HeroScene } from "@/components/marketing/HeroScene";
import { LanePreview } from "@/components/marketing/LanePreview";
import { MilesRow } from "@/components/marketing/MilesRow";
import {
  CheckItem,
  CtaBand,
  Eyebrow,
  FeatureCard,
  SectionHeading,
  SignPanel,
} from "@/components/marketing/primitives";
import { Reveal, Stagger } from "@/components/marketing/Reveal";
import { ServiceAreaMap } from "@/components/marketing/ServiceAreaMap";
import { SmsThread } from "@/components/marketing/SmsThread";
import { Button } from "@/components/ui/button";
import { HOME, SMS_SENDER_NUMBER } from "@/content/marketing";
import { getSiteEnv } from "@/lib/env";
import { LAUNCH_LINE } from "@/lib/launch";
import { formatE164ForDisplay } from "@/lib/phone";

export const metadata = {
  title: { absolute: "FleetGrid: Local CDL Drivers for Open Shifts in Houston" },
  description:
    "Houston-area carriers find approved Class A and B CDL drivers within 50 miles of the yard and fill shifts by text. Free for drivers.",
  alternates: { canonical: "/" },
};

const WHO_ICONS = [IdCard, Truck, Container] as const;
/** One icon per promise, in the order of HOME.promises.items. */
const PROMISE_ICONS: readonly LucideIcon[] = [FileX2, BadgeDollarSign, BadgeDollarSign, ShieldCheck, MessageSquareOff];

/** Three fictional rows, the way the carrier search lists drivers. Never real data. */
const SAMPLE_RESULTS = [
  { name: "Sample Driver A", miles: "4.1 miles", card: "Class A, 6 to 10 years, H, T" },
  { name: "Sample Driver B", miles: "9.8 miles", card: "Class B, 3 to 5 years, N" },
  { name: "Sample Driver C", miles: "17.5 miles", card: "Class A, 11 or more years, H, N, T, X" },
] as const;

function SearchPreview({ caption }: { caption: string }) {
  return (
    <DeviceFrame caption={caption}>
      <p className="text-helper leading-helper text-muted-foreground">
        Showing 1 to 3 of 3 drivers, nearest first.
      </p>
      <ul className="flex flex-col gap-2" aria-label="Sample results">
        {SAMPLE_RESULTS.map((row) => (
          <li key={row.name} className="flex flex-col gap-1 rounded-card border border-border-strong p-3">
            <span className="flex items-baseline justify-between gap-3">
              <span className="text-label leading-label font-semibold">{row.name}</span>
              <span className="text-small leading-small text-muted-foreground">{row.miles}</span>
            </span>
            <span className="text-small leading-small text-muted-foreground">{row.card}</span>
          </li>
        ))}
      </ul>
    </DeviceFrame>
  );
}

export default function LandingPage() {
  const site = getSiteEnv();
  const { hero, sides, miles, who, review, area, proof, promises, finalCta } = HOME;
  const phoneHeader = site.NEXT_PUBLIC_SHOW_SMS_NUMBER
    ? `FleetGrid · ${formatE164ForDisplay(SMS_SENDER_NUMBER)}`
    : "FleetGrid";

  return (
    <AppShell variant="marketing">
      <div className="flex flex-col gap-16 py-4 sm:gap-24 sm:py-8">
        {/* Hero: two columns on desktop, stacked on phones. The H1 is the LCP element and never animates. */}
        <section aria-labelledby="hero-title" className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-12">
          <div className="flex max-w-3xl flex-col gap-5">
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <h1
              id="hero-title"
              className="font-heading text-h1 leading-h1 font-bold text-balance sm:text-5xl sm:leading-tight"
            >
              {hero.title}
            </h1>
            <p className="max-w-reading text-body-lg leading-body-lg text-muted-foreground">{hero.text}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-xl">
              <Button asChild>
                <Link href={hero.primary.href}>
                  <Building2 aria-hidden="true" />
                  {hero.primary.label}
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={hero.secondary.href}>
                  <Truck aria-hidden="true" />
                  {hero.secondary.label}
                </Link>
              </Button>
            </div>
            <p className="text-small leading-small text-muted-foreground" data-slot="hero-small-print">
              {hero.smallPrint}
            </p>
            <p className="text-small leading-small text-muted-foreground" data-slot="sms-opt-in-line">
              {hero.optInLine}{" "}
              <Link href={hero.optInLink.href} className="text-foreground underline underline-offset-4">
                {hero.optInLink.label}
              </Link>
              .
            </p>
            <p className="flex items-center gap-2 font-semibold" data-slot="launch-line">
              <MapPin aria-hidden="true" className="size-5 text-muted-foreground" />
              {LAUNCH_LINE}
            </p>
          </div>
          <HeroScene phoneHeader={phoneHeader} />
        </section>

        {/* Two sides, one grid. */}
        <Reveal as="section" id={sides.id} aria-labelledby="sides-title" className="flex flex-col gap-6 scroll-mt-24">
          <h2 id="sides-title" className="sr-only">
            {sides.eyebrow}
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[sides.carrier, sides.driver].map((side) => (
              <SignPanel key={side.eyebrow} aria-label={side.eyebrow} className="flex flex-col gap-4">
                <p className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-sign-panel-muted">
                  {side.eyebrow}
                </p>
                <ul className="flex flex-col gap-3 text-body-lg leading-body-lg">
                  {side.items.map((item) => (
                    <CheckItem key={item}>{item}</CheckItem>
                  ))}
                </ul>
                <Link
                  href={side.link.href}
                  className="mt-auto inline-flex min-h-target items-center font-semibold underline underline-offset-4"
                >
                  {side.link.label}
                </Link>
              </SignPanel>
            ))}
          </div>
        </Reveal>

        {/* How a shift gets filled. */}
        <section id={miles.id} aria-labelledby="miles-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="miles-title" eyebrow={miles.eyebrow} title={miles.title} />
          <MilesRow />
        </section>

        {/* Who is on FleetGrid. */}
        <Reveal as="section" id={who.id} aria-labelledby="who-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="who-title" eyebrow={who.eyebrow} title={who.title} />
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-3" aria-label="Who is on FleetGrid">
            <Stagger>
              {who.tiles.map((tile, index) => (
                <Reveal as="li" key={tile.title}>
                  <FeatureCard icon={WHO_ICONS[index]} title={tile.title} text={tile.text} />
                </Reveal>
              ))}
            </Stagger>
          </ul>
        </Reveal>

        {/* Review before visible. */}
        <Reveal id={review.id} className="scroll-mt-24">
          <SignPanel aria-labelledby="review-title" className="flex flex-col gap-4">
            <h2
              id="review-title"
              className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-sign-panel-muted"
            >
              {review.eyebrow}
            </h2>
            <ul className="flex flex-col gap-3 text-body-lg leading-body-lg">
              {review.items.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
            <p className="text-small leading-small text-sign-panel-muted" data-slot="review-small-print">
              {review.smallPrint}
            </p>
          </SignPanel>
        </Reveal>

        {/* Built for the Houston area. */}
        <Reveal as="section" id={area.id} aria-labelledby="area-title" className="grid grid-cols-1 gap-8 scroll-mt-24 md:grid-cols-2 md:items-center lg:gap-12">
          <div className="flex flex-col gap-6">
            <SectionHeading id="area-title" eyebrow={area.eyebrow} title={area.title} text={area.text} />
            <Button asChild variant="secondary" className="sm:w-fit">
              <Link href={area.link.href}>{area.link.label}</Link>
            </Button>
          </div>
          <div className="justify-self-center">
            <ServiceAreaMap />
          </div>
        </Reveal>

        {/* The product. */}
        <Reveal as="section" id={proof.id} aria-labelledby="proof-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="proof-title" eyebrow={proof.eyebrow} title={proof.title} />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start lg:grid-cols-3">
            <LanePreview caption={proof.captions[0]} />
            <SearchPreview caption={proof.captions[1]} />
            <figure className="flex w-full max-w-sm flex-col gap-3" data-slot="device-frame">
              <SmsThread />
              <figcaption className="text-helper leading-helper text-muted-foreground">{proof.captions[2]}</figcaption>
            </figure>
          </div>
        </Reveal>

        {/* Plain promises: five cards, each with its own icon. On hover the orange stripe
            grows along the top, the tile turns orange and the border firms up. */}
        <Reveal as="section" id={promises.id} aria-labelledby="promises-title" className="flex flex-col gap-6 scroll-mt-24">
          <h2 id="promises-title" className="sr-only">
            {promises.eyebrow}
          </h2>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Stagger>
              {promises.items.map((item, index) => (
                <Reveal as="li" key={item.title} data-slot="promise-card">
                  <FeatureCard icon={PROMISE_ICONS[index]} title={item.title} text={item.text} />
                </Reveal>
              ))}
            </Stagger>
          </ul>
        </Reveal>

        <CtaBand title={finalCta.title} primary={finalCta.primary} secondary={finalCta.secondary} />
      </div>
    </AppShell>
  );
}
