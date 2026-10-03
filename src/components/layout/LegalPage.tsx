import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { InlineNote } from "@/components/shared/InlineNote";

export const LEGAL_PLACEHOLDER_NOTICE = "Legal text to be provided by FleetGrid.";

interface LegalPageProps {
  title: string;
  /** Shows the "to be provided" banner for pages still waiting on final legal text. */
  placeholder?: boolean;
  children?: ReactNode;
}

/** Shared frame for Terms, Privacy and SMS Terms. */
export function LegalPage({ title, placeholder = false, children }: LegalPageProps) {
  return (
    <AppShell width="narrow">
      <article className="flex flex-col gap-6">
        <h1 className="font-heading text-h1 leading-h1 font-bold">{title}</h1>
        {placeholder && (
          <InlineNote variant="warning" role="note" className="font-semibold">
            {LEGAL_PLACEHOLDER_NOTICE}
          </InlineNote>
        )}
        {children}
      </article>
    </AppShell>
  );
}
