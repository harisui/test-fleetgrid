import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

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
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {placeholder && (
          <p
            role="note"
            className="border-warning/60 bg-warning/15 flex items-center gap-3 rounded-md border p-4 font-medium"
          >
            <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
            {LEGAL_PLACEHOLDER_NOTICE}
          </p>
        )}
        {children}
      </article>
    </AppShell>
  );
}
