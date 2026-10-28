import type { ReactNode } from "react";

interface AdminPageProps {
  title: string;
  subtitle?: string;
  /** Page actions on the right of the top bar, for example "Generate QR code". */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * One admin page: the sticky top bar (title in Barlow Condensed, a short subtitle, actions
 * on the right, 1px bottom border) and the content column (max-w-7xl, 24px padding, 32px
 * from xl, sections stacked with 24px gaps).
 */
export function AdminPage({ title, subtitle, actions, children }: AdminPageProps) {
  return (
    <>
      <header
        data-slot="admin-top-bar"
        className="sticky top-14 z-30 border-b border-border bg-background lg:top-0"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4 xl:px-8">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading text-h1 leading-h1 font-semibold">{title}</h1>
            {subtitle && (
              <p className="text-helper leading-helper text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-6 xl:p-8"
      >
        {children}
      </main>
    </>
  );
}
