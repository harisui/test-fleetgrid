import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

/** "13. Governing law and dispute resolution" becomes "governing-law-and-dispute-resolution". */
export function legalSectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/^\d+\.\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A section heading of a legal page, with the anchor the table of contents points at. */
export function LegalHeading({ children }: { children: string }) {
  return (
    <h2
      id={legalSectionId(children)}
      className="mt-4 scroll-mt-24 font-heading text-h2 leading-h2 font-semibold"
    >
      {children}
    </h2>
  );
}

interface LegalPageProps {
  title: string;
  /** The date the text took effect, shown as "Last updated" under the title. */
  effective?: string;
  /** The section headings, in order, for the table of contents. Each one is a LegalHeading in the body. */
  sections?: readonly string[];
  children?: ReactNode;
}

/**
 * Shared frame for Terms, Privacy and SMS Terms: a graphite sign-panel header with the
 * eyebrow LEGAL, the title and the date; the table of contents (sticky beside the text on
 * desktop, above it on phones); a 70ch reading column at the body size. The text itself is
 * the client's and never changes here. Prints as the text alone (globals.css).
 */
export function LegalPage({ title, effective, sections = [], children }: LegalPageProps) {
  return (
    <AppShell variant="marketing">
      <article className="flex flex-col gap-8">
        {/* A div, not a header: the page already has its banner, and a second one confuses landmarks. */}
        <div
          data-slot="legal-header"
          className="flex flex-col gap-2 rounded-sign border-t-4 border-sign-panel-border bg-sign-panel px-6 py-8 text-sign-panel-foreground"
        >
          <p className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-sign-panel-muted">
            Legal
          </p>
          <h1 className="font-heading text-h1 leading-h1 font-bold">{title}</h1>
          {effective && (
            <p className="text-helper leading-helper text-sign-panel-muted" data-slot="effective">
              Last updated {effective}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          {sections.length > 0 && (
            <nav
              aria-label="On this page"
              data-slot="legal-toc"
              className="shrink-0 rounded-card border border-border bg-card p-4 lg:sticky lg:top-24 lg:w-64"
            >
              <p className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-muted-foreground">
                On this page
              </p>
              <ol className="mt-2 flex flex-col">
                {sections.map((section) => (
                  <li key={section}>
                    <a
                      href={`#${legalSectionId(section)}`}
                      className="flex min-h-target items-center text-helper leading-helper underline-offset-4 hover:underline"
                    >
                      {section}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="flex min-w-0 max-w-reading flex-col gap-4 [&_li]:leading-relaxed [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul_ul]:mt-2">
            {children}
          </div>
        </div>
      </article>
    </AppShell>
  );
}
