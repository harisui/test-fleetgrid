import type { ReactNode } from "react";

/** Helper copy under the sign header or a question. */
export function ScreenHelper({ children }: { children: ReactNode }) {
  return <p className="text-helper leading-helper text-muted-foreground">{children}</p>;
}

/** The question above a field group. A page holds every question of its mile, so each shows its own. */
export function ScreenQuestion({ children }: { children: ReactNode }) {
  return <h2 className="text-label leading-label font-semibold">{children}</h2>;
}
