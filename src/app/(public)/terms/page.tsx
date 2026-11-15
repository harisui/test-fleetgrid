import type { Metadata } from "next";
import { LegalBody } from "@/components/layout/LegalBody";
import { LegalPage } from "@/components/layout/LegalPage";
import { CURRENT_TERMS } from "@/content/legal/terms";
import { legalHeadings } from "@/lib/legal/markdown";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/terms");

/** The section headings, in order, for the table of contents. */
export const TERMS_SECTIONS = legalHeadings(CURRENT_TERMS.body);

/**
 * The current Terms of Service, rendered from src/content/legal/terms.ts: the same text that is
 * archived in terms_versions and that drivers and carriers accept (Milestone 6).
 */
export default function TermsPage() {
  return (
    <LegalPage
      path="/terms"
      title={CURRENT_TERMS.title}
      effective={CURRENT_TERMS.effectiveLabel}
      sections={TERMS_SECTIONS}
    >
      <LegalBody body={CURRENT_TERMS.body} />
    </LegalPage>
  );
}
