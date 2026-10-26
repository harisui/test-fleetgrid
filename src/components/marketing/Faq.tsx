"use client";

import { ChevronRight } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import type { FaqGroup } from "@/content/faq";

interface FaqProps {
  groups: readonly FaqGroup[];
}

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash.slice(1);
const noHash = () => "";

/**
 * The questions as a restyled accordion: 56px rows, a chevron that turns 90 degrees over
 * --motion-base, every answer in the HTML (closed ones are hidden, not absent), and the full
 * keyboard path from Radix. A link to /faq#some-id opens that answer: the hash is read as
 * an external store, so the server renders everything closed and nothing mismatches.
 */
export function Faq({ groups }: FaqProps) {
  const hash = useSyncExternalStore(subscribeToHash, readHash, noHash);
  const [chosen, setChosen] = useState<string[]>([]);
  const [closedByHand, setClosedByHand] = useState<string[]>([]);

  const hashIsAnswer = groups.some((group) => group.entries.some((entry) => entry.id === hash));
  const open =
    hashIsAnswer && !closedByHand.includes(hash) && !chosen.includes(hash) ? [...chosen, hash] : chosen;

  function setOpen(next: string[]) {
    setChosen(next);
    if (hashIsAnswer && !next.includes(hash)) setClosedByHand((closed) => [...closed, hash]);
  }

  return (
    <div className="flex flex-col gap-12">
      {groups.map((group) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className="flex flex-col gap-4 scroll-mt-24">
          <h2 id={`${group.id}-title`} className="font-heading text-h1 leading-h1 font-bold">
            {group.title}
          </h2>
          <AccordionPrimitive.Root
            type="multiple"
            value={open}
            onValueChange={setOpen}
            className="divide-y divide-border rounded-card border border-border bg-card"
          >
            {group.entries.map((entry) => (
              <AccordionPrimitive.Item key={entry.id} value={entry.id} id={entry.id} className="scroll-mt-24">
                <h3>
                  <AccordionPrimitive.Trigger className="flex min-h-target-lg w-full items-center justify-between gap-4 px-4 py-3 text-left text-label leading-label font-semibold hover:bg-muted [&[data-state=open]>svg]:rotate-90">
                    {entry.question}
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 transition-transform duration-(--motion-base) ease-motion"
                    />
                  </AccordionPrimitive.Trigger>
                </h3>
                <AccordionPrimitive.Content
                  forceMount
                  hidden={!open.includes(entry.id)}
                  className="px-4 pb-4"
                >
                  <p className="max-w-reading text-helper leading-helper text-muted-foreground">{entry.answer}</p>
                </AccordionPrimitive.Content>
              </AccordionPrimitive.Item>
            ))}
          </AccordionPrimitive.Root>
        </section>
      ))}
    </div>
  );
}
