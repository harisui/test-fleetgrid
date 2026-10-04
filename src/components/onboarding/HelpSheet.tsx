"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DESKTOP_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { SUPPORT_CONTACT_PENDING } from "@/lib/constants";
import { MILE_SUMMARIES, MILES } from "@/lib/onboarding/steps";
import { formatE164ForDisplay } from "@/lib/phone";
import type { SupportContact } from "@/lib/support";

interface HelpSheetProps {
  /** From SUPPORT_EMAIL and SUPPORT_PHONE. Empty until the client provides them. */
  support?: SupportContact;
}

const SECTIONS = [
  {
    title: "How to sign in",
    text: "Enter your mobile number and we text you a 6-digit code. There is no password to remember.",
  },
  {
    title: "Need a new code?",
    text: "On the code screen, wait for the countdown, then tap Resend code. If the number shown is not yours, tap Change it.",
  },
] as const;

function HelpBody({ support, headingId }: { support?: SupportContact; headingId: string }) {
  const contact = support?.email || support?.phone;
  return (
    <div className="flex flex-col gap-5" data-slot="help-body">
      <p className="text-helper leading-helper text-muted-foreground">
        Every answer is saved as you go. You can close this page and come back any time; you will
        land on the same question.
      </p>
      {SECTIONS.map((section) => (
        <section key={section.title} className="flex flex-col gap-1">
          <h3 className="text-label leading-label font-semibold">{section.title}</h3>
          <p className="text-helper leading-helper text-muted-foreground">{section.text}</p>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h3 className="text-label leading-label font-semibold">What the stages mean</h3>
        <ol className="flex flex-col gap-2" aria-label="Stages">
          {MILES.map((mile) => (
            <li key={mile.mile} className="flex gap-3 text-helper leading-helper">
              <span className="w-16 shrink-0 font-semibold text-foreground">{mile.label}</span>
              <span className="text-muted-foreground">{MILE_SUMMARIES[mile.mile]}</span>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="flex flex-col gap-2 border-t border-border pt-4"
        aria-labelledby={headingId}
      >
        <h3 id={headingId} className="text-label leading-label font-semibold">
          Support
        </h3>
        {contact ? (
          <ul
            className="flex flex-col gap-1 text-helper leading-helper"
            data-slot="support-contact"
          >
            {support?.phone && (
              <li>
                Call or text{" "}
                <a
                  href={`tel:${support.phone}`}
                  className="font-semibold underline underline-offset-4"
                >
                  {formatE164ForDisplay(support.phone)}
                </a>
              </li>
            )}
            {support?.email && (
              <li>
                Email{" "}
                <a
                  href={`mailto:${support.email}`}
                  className="font-semibold underline underline-offset-4"
                >
                  {support.email}
                </a>
              </li>
            )}
          </ul>
        ) : (
          <p
            className="text-helper leading-helper text-muted-foreground"
            data-slot="support-contact"
          >
            {SUPPORT_CONTACT_PENDING}
          </p>
        )}
        <p className="text-helper leading-helper text-muted-foreground">
          Read the{" "}
          <Link href="/sms-terms" className="font-semibold underline underline-offset-4">
            SMS Terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="font-semibold underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

/**
 * The only control in the header besides the wordmark. A bottom sheet on phones, a popover
 * under the button on wider screens; the same words in both. Escape closes and focus returns
 * to the button.
 */
export function HelpSheet({ support }: HelpSheetProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [open, setOpen] = useState(false);
  const id = useId();
  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="md"
      className="border-2 border-sign-panel-muted text-sign-panel-foreground hover:bg-sign-panel-foreground/10 aria-expanded:bg-sign-panel-foreground/10"
    >
      Help
    </Button>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent data-slot="help-popover" aria-labelledby={`${id}-title`}>
          <h2 id={`${id}-title`} className="mb-3 font-heading text-h2 leading-h2 font-semibold">
            Help
          </h2>
          <HelpBody support={support} headingId={`${id}-support`} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent data-slot="help-sheet">
        <SheetTitle>Help</SheetTitle>
        <SheetDescription className="sr-only">
          How FleetGrid sign-up works and how to reach us.
        </SheetDescription>
        <HelpBody support={support} headingId={`${id}-support`} />
      </SheetContent>
    </Sheet>
  );
}
