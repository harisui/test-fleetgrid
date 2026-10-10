import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

interface LegalPageProps {
  title: string;
  /** "Effective October 10, 2026", under the title. */
  effective?: string;
  children?: ReactNode;
}

/** Shared frame for Terms, Privacy and SMS Terms. */
export function LegalPage({ title, effective, children }: LegalPageProps) {
  return (
    <AppShell width="narrow">
      <article className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-h1 leading-h1 font-bold">{title}</h1>
          {effective && (
            <p className="text-helper leading-helper text-muted-foreground" data-slot="effective">
              Effective {effective}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4 [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_li]:leading-relaxed">
          {children}
        </div>
      </article>
    </AppShell>
  );
}
