import {
  BadgeCheck,
  Container,
  FileCheck,
  Gauge,
  History,
  IdCard,
  MapPin,
  Route,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CarriersComingSoon } from "@/components/marketing/CarriersComingSoon";
import { FaqExcerpt } from "@/components/marketing/FaqExcerpt";
import {
  CheckItem,
  CtaBand,
  Eyebrow,
  FeatureCard,
  SectionHeading,
  SignPanel,
} from "@/components/marketing/primitives";
import { Reveal, Stagger } from "@/components/marketing/Reveal";
import { SmsThread } from "@/components/marketing/SmsThread";
import { ZipCheck } from "@/components/marketing/ZipCheck";
import { Button } from "@/components/ui/button";
import { CARRIER_FAQ_EXCERPT } from "@/content/faq";
import { CARRIERS } from "@/content/marketing";
import { isCarrierDisabled } from "@/lib/carrier/availability";

export const metadata: Metadata = {
  title: "Find CDL Drivers in Houston for Open Shifts",
  description:
    "Search approved local drivers near your Houston or Pasadena yard and broadcast shifts by text. $399 a month, no contract, cancel anytime.",
  alternates: { canonical: "/carriers" },
};

const FILTER_ICONS: readonly LucideIcon[] = [
  Route,
  IdCard,
  History,
  Gauge,
  BadgeCheck,
  FileCheck,
  Settings2,
  BadgeCheck,
  Container,
];

export default function CarriersPage() {
  if (isCarrierDisabled()) {
    return (
      <AppShell variant="marketing" width="narrow">
        <CarriersComingSoon />
      </AppShell>
    );
  }

  const { hero, search, broadcast, pricing, serviceArea, isAndIsNot, faq, finalCta } = CARRIERS;

  return (
    <AppShell variant="marketing">
      <div className="flex flex-col gap-16 py-4 sm:gap-24 sm:py-8">
        {/* Hero. Server-rendered, never animated. */}
        <section aria-labelledby="hero-title" className="flex max-w-3xl flex-col gap-5">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1
            id="hero-title"
            className="font-heading text-h1 leading-h1 font-bold text-balance sm:text-5xl sm:leading-tight"
          >
            {hero.title}
          </h1>
          <p className="max-w-reading text-body-lg leading-body-lg text-muted-foreground">{hero.text}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild className="sm:min-w-48">
              <Link href={hero.primary.href}>{hero.primary.label}</Link>
            </Button>
            <Button asChild variant="secondary" className="sm:min-w-48">
              <Link href={hero.secondary.href}>{hero.secondary.label}</Link>
            </Button>
          </div>
          <p className="flex items-center gap-2 text-helper leading-helper text-muted-foreground">
            <MapPin aria-hidden="true" className="size-5" />
            Within 50 miles of Houston or Pasadena, Texas.
          </p>
        </section>

        {/* The nine filters, as the search offers them. */}
        <Reveal as="section" id={search.id} aria-labelledby="search-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="search-title" eyebrow={search.eyebrow} title={search.title} text={search.text} />
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Search filters">
            <Stagger>
              {search.filters.map((filter, index) => (
                <Reveal as="li" key={filter.label}>
                  <FeatureCard icon={FILTER_ICONS[index]} title={filter.label} text={filter.detail} layout="row" />
                </Reveal>
              ))}
            </Stagger>
          </ul>
        </Reveal>

        {/* Broadcast Shift: steps beside the sample thread. */}
        <Reveal as="section" id={broadcast.id} aria-labelledby="broadcast-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="broadcast-title" eyebrow={broadcast.eyebrow} title={broadcast.title} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center lg:gap-12">
            <ol className="flex flex-col gap-4" aria-label="Broadcast Shift steps">
              <Stagger>
                {broadcast.steps.map((step, index) => (
                  <Reveal as="li" key={step.title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="flex size-12 shrink-0 items-center justify-center rounded-field border border-border bg-muted font-heading text-number leading-number font-bold"
                    >
                      {index + 1}
                    </span>
                    <span className="flex flex-col gap-1">
                      <span className="text-label leading-label font-semibold">{step.title}</span>
                      <span className="text-helper leading-helper text-muted-foreground">{step.text}</span>
                    </span>
                  </Reveal>
                ))}
              </Stagger>
            </ol>
            <SmsThread className="justify-self-center md:justify-self-end" />
          </div>
        </Reveal>

        {/* Pricing. */}
        <Reveal as="section" id={pricing.id} aria-labelledby="pricing-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="pricing-title" eyebrow={pricing.eyebrow} title={pricing.title} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-5 md:items-start lg:gap-12">
            <div
              className="overflow-hidden rounded-card border border-border bg-card md:col-span-3"
              data-slot="pricing-card"
            >
              <div className="border-t-4 border-sign-panel-border bg-sign-panel px-6 py-4 text-sign-panel-foreground">
                <p className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase">
                  {pricing.header}
                </p>
              </div>
              <div className="flex flex-col gap-6 p-6">
                <p className="flex items-baseline gap-2">
                  <span className="font-heading text-5xl leading-none font-bold" data-slot="price">
                    {pricing.price}
                  </span>
                  <span className="text-label leading-label text-muted-foreground">{pricing.period}</span>
                </p>
                <ul className="flex flex-col gap-3" aria-label="Included">
                  {pricing.included.map((line) => (
                    <CheckItem key={line}>{line}</CheckItem>
                  ))}
                </ul>
                <p className="text-helper leading-helper text-muted-foreground">{pricing.terms}</p>
                <Button asChild className="sm:self-start">
                  <Link href={pricing.cta.href}>{pricing.cta.label}</Link>
                </Button>
              </div>
            </div>
            <p className="text-body-lg leading-body-lg text-muted-foreground md:col-span-2">{pricing.framing}</p>
          </div>
        </Reveal>

        {/* The ZIP check. */}
        <Reveal as="section" id={serviceArea.id} aria-labelledby="service-area-title" className="flex flex-col gap-6 scroll-mt-24">
          <SectionHeading
            id="service-area-title"
            eyebrow={serviceArea.eyebrow}
            title={serviceArea.title}
            text={serviceArea.text}
          />
          <div className="max-w-xl">
            <ZipCheck />
          </div>
        </Reveal>

        {/* Is and is not. */}
        <Reveal id={isAndIsNot.id} className="flex flex-col gap-6 scroll-mt-24">
          <Eyebrow>{isAndIsNot.eyebrow}</Eyebrow>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SignPanel aria-labelledby="is-title" className="flex flex-col gap-4">
              <h2 id="is-title" className="font-heading text-h2 leading-h2 font-semibold">
                {isAndIsNot.is.title}
              </h2>
              <ul className="flex flex-col gap-3 text-sign-panel-foreground">
                {isAndIsNot.is.items.map((item) => (
                  <CheckItem key={item}>{item}</CheckItem>
                ))}
              </ul>
            </SignPanel>
            <section aria-labelledby="is-not-title" className="flex flex-col gap-4 rounded-card border border-border-strong bg-card p-6">
              <h2 id="is-not-title" className="font-heading text-h2 leading-h2 font-semibold">
                {isAndIsNot.isNot.title}
              </h2>
              <ul className="flex list-disc flex-col gap-3 pl-5">
                {isAndIsNot.isNot.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          </div>
        </Reveal>

        <FaqExcerpt id={faq.id} eyebrow={faq.eyebrow} title={faq.title} entries={CARRIER_FAQ_EXCERPT} more={faq.more} />

        <CtaBand title={finalCta.title} text={finalCta.text} primary={finalCta.primary} secondary={finalCta.secondary} />
      </div>
    </AppShell>
  );
}
