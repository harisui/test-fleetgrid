import { LegalBody } from "@/components/layout/LegalBody";
import type { TermsVersion } from "@/content/legal/terms";

/**
 * The full Terms a driver is asked to accept, in a scrolling panel above the checkbox, with the
 * version and its date: the same text that is archived (Milestone 6).
 */
export function TermsReview({ terms }: { terms: TermsVersion }) {
  return (
    <section aria-labelledby="terms-review-title" className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <h2 id="terms-review-title" className="text-lg font-semibold tracking-tight">
          {terms.title}
        </h2>
        <p className="text-helper leading-helper text-muted-foreground">
          Effective {terms.effectiveLabel}. Version {terms.version}.
        </p>
      </div>
      <div
        tabIndex={0}
        role="region"
        aria-label={`${terms.title}, full text`}
        className="flex max-h-terms-panel flex-col gap-4 overflow-y-auto rounded-card border border-border bg-card p-4 [&_li]:leading-relaxed [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul_ul]:mt-2"
      >
        <LegalBody body={terms.body} />
      </div>
    </section>
  );
}
