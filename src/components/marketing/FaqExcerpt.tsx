import { LinkCard, SectionHeading } from "@/components/marketing/primitives";
import { Reveal, Stagger } from "@/components/marketing/Reveal";
import type { FaqEntry } from "@/content/faq";
import type { SiteLink } from "@/content/marketing";

interface FaqExcerptProps {
  id: string;
  eyebrow: string;
  title: string;
  entries: readonly FaqEntry[];
  more: SiteLink;
}

/** Five questions as link cards, each jumping to its answer on /faq. */
export function FaqExcerpt({ id, eyebrow, title, entries, more }: FaqExcerptProps) {
  return (
    <Reveal as="section" id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-6">
      <SectionHeading id={`${id}-title`} eyebrow={eyebrow} title={title} />
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Stagger>
          {entries.map((entry) => (
            <Reveal as="li" key={entry.id}>
              <LinkCard href={`/faq#${entry.id}`} label={entry.question} title={entry.question} />
            </Reveal>
          ))}
          <Reveal as="li">
            <LinkCard href={more.href} label={more.label} title={more.label} />
          </Reveal>
        </Stagger>
      </ul>
    </Reveal>
  );
}
