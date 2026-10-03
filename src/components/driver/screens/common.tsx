import type { ReactNode } from "react";

/** Helper copy under the sign header or a question. */
export function ScreenHelper({ children }: { children: ReactNode }) {
  return <p className="text-helper leading-helper text-muted-foreground">{children}</p>;
}

/** The question above a field group on wide screens, where several questions share a page. */
export function ScreenQuestion({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <h2 className="text-label leading-label font-semibold">{children}</h2>;
}
