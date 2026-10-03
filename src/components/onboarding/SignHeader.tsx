import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface SignHeaderProps extends Omit<ComponentProps<"div">, "title"> {
  /** Short, uppercase, for example "Mile 2 of 5 · Work". Decorative for screen readers. */
  eyebrow: string;
  /** The question, in sentence case. The page's main heading. */
  title: string;
  /** What screen readers hear instead of the eyebrow, for example "Step 2 of 5: Work". */
  srText?: string;
  /** Heading level. The onboarding screens use the default h1. */
  as?: "h1" | "h2";
}

/**
 * A road sign: graphite panel, 4px corners, 4px orange stripe along the top, condensed
 * uppercase eyebrow and a bold condensed question.
 */
export function SignHeader({
  eyebrow,
  title,
  srText,
  as: Heading = "h1",
  className,
  ...props
}: SignHeaderProps) {
  return (
    <div
      data-slot="sign-header"
      className={cn(
        "rounded-sign border-t-4 border-sign-panel-border bg-sign-panel px-4 pt-3 pb-4 text-sign-panel-foreground",
        className,
      )}
      {...props}
    >
      {srText && <span className="sr-only">{srText}</span>}
      <p
        aria-hidden="true"
        data-slot="sign-eyebrow"
        className="font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow text-sign-panel-muted uppercase"
      >
        {eyebrow}
      </p>
      <Heading
        tabIndex={-1}
        data-slot="sign-title"
        className="mt-1 font-heading text-h1 leading-h1 font-bold text-balance outline-none"
      >
        {title}
      </Heading>
    </div>
  );
}
