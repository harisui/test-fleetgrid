import { MapPin, MessageSquareText, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { FaqExcerpt } from "@/components/marketing/FaqExcerpt";
import { LanePreview } from "@/components/marketing/LanePreview";
import { CheckItem, CtaBand, Eyebrow, IconTile, SectionHeading, SignPanel } from "@/components/marketing/primitives";
import { Reveal, Stagger } from "@/components/marketing/Reveal";
import { SmsThread } from "@/components/marketing/SmsThread";
import { Button } from "@/components/ui/button";
import { DRIVER_FAQ_EXCERPT } from "@/content/faq";
import { DRIVERS } from "@/content/marketing";

export const metadata: Metadata = {
  title: "CDL Driver Shifts in Houston and Pasadena, TX",
  description:
    "Sign up free on your phone. Get local shift offers by text from Houston-area carriers, including the Port of Houston, Baytown and La Porte.",
  alternates: { canonical: "/drivers" },
};

export default function DriversPage() {
  const { hero, signUp, card, texts, free, respect, outside, faq, finalCta } = DRIVERS;

  return (
    <AppShell variant="marketing">
      <div className="flex flex-col gap-16 py-4 sm:gap-24 sm:py-8">
        <section aria-labelledby="hero-title" className="flex max-w-3xl flex-col gap-5">
          <Eyebrow>{hero.eyebrow}</Eyebrow>
          <h1
            id="hero-title"
            className="font-heading text-h1 leading-h1 font-bold text-balance sm:text-5xl sm:leading-tight"
          >
            {hero.title}
          </h1>
          <p className="max-w-reading text-body-lg leading-body-lg text-muted-foreground">{hero.text}</p>
          <div className="flex flex-col gap-2">
            <Button asChild className="sm:w-fit sm:min-w-48">
              <Link href={hero.primary.href}>{hero.primary.label}</Link>
            </Button>
            <p className="flex items-center gap-2 text-helper leading-helper text-muted-foreground">
              <Smartphone aria-hidden="true" className="size-5" />
              {hero.note}
            </p>
          </div>
        </section>

        <Reveal as="section" id={signUp.id} aria-labelledby="sign-up-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="sign-up-title" eyebrow={signUp.eyebrow} title={signUp.title} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start lg:gap-12">
            <ol className="flex flex-col gap-4" aria-label="Sign-up steps">
              <Stagger>
                {signUp.steps.map((step, index) => (
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
            <div className="w-full max-w-sm justify-self-center md:justify-self-end">
              <LanePreview />
            </div>
          </div>
        </Reveal>

        <Reveal as="section" id={card.id} aria-labelledby="card-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="card-title" eyebrow={card.eyebrow} title={card.title} text={card.text} />
          <ol className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2 lg:grid-cols-3" aria-label="The driver card">
            {card.items.map((item, index) => (
              <li key={item} className="flex items-baseline gap-3 border-b border-border py-2">
                <span
                  aria-hidden="true"
                  className="w-6 shrink-0 font-heading text-number leading-number font-bold text-muted-foreground"
                >
                  {index + 1}
                </span>
                <span className="text-label leading-label font-semibold">{item}</span>
              </li>
            ))}
          </ol>
          <p className="flex items-start gap-3 text-helper leading-helper text-muted-foreground">
            <MessageSquareText aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {card.consent}
          </p>
        </Reveal>

        <Reveal as="section" id={texts.id} aria-labelledby="texts-title" className="flex flex-col gap-8 scroll-mt-24">
          <SectionHeading id="texts-title" eyebrow={texts.eyebrow} title={texts.title} />
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-start lg:gap-12">
            <div className="flex max-w-reading flex-col gap-4">
              <p className="text-body-lg leading-body-lg text-muted-foreground">{texts.text}</p>
              <p className="font-semibold">{texts.stopLine}</p>
            </div>
            <SmsThread className="justify-self-center md:justify-self-end" />
          </div>
        </Reveal>

        <Reveal as="section" id={free.id} aria-labelledby="free-title" className="flex flex-col gap-4 scroll-mt-24">
          <SectionHeading id="free-title" eyebrow={free.eyebrow} title={free.title} text={free.text} />
        </Reveal>

        <Reveal id={respect.id} className="scroll-mt-24">
          <SignPanel aria-labelledby="respect-title" className="flex flex-col gap-4">
            <h2
              id="respect-title"
              className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-sign-panel-muted"
            >
              {respect.eyebrow}
            </h2>
            <ul className="flex flex-col gap-3 text-body-lg leading-body-lg">
              {respect.items.map((item) => (
                <CheckItem key={item}>{item}</CheckItem>
              ))}
            </ul>
          </SignPanel>
        </Reveal>

        <Reveal as="section" id={outside.id} aria-labelledby="outside-title" className="flex gap-4 rounded-card border border-border bg-card p-6 scroll-mt-24">
          <IconTile icon={MapPin} />
          <div className="flex flex-col gap-1">
            <h2 id="outside-title" className="font-heading text-h2 leading-h2 font-semibold">
              {outside.title}
            </h2>
            <p className="text-muted-foreground">{outside.text}</p>
          </div>
        </Reveal>

        <FaqExcerpt id={faq.id} eyebrow={faq.eyebrow} title={faq.title} entries={DRIVER_FAQ_EXCERPT} more={faq.more} />

        <CtaBand title={finalCta.title} text={finalCta.text} primary={finalCta.primary} secondary={finalCta.secondary} />
      </div>
    </AppShell>
  );
}
