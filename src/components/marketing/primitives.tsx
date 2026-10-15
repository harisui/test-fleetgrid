import { ArrowRight, Check, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SiteLink } from "@/content/marketing";
import { cn } from "@/lib/utils";

/** Uppercase Barlow Condensed line above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "font-heading text-eyebrow leading-eyebrow font-semibold tracking-eyebrow uppercase text-muted-foreground",
        className,
      )}
      data-slot="eyebrow"
    >
      {children}
    </p>
  );
}

interface SectionHeadingProps {
  id?: string;
  eyebrow?: string;
  title: string;
  text?: string;
  /** On a graphite panel the eyebrow and text use the panel's muted token. */
  onPanel?: boolean;
  className?: string;
}

/** Eyebrow, H2 and one line of text at the top of a section. */
export function SectionHeading({ id, eyebrow, title, text, onPanel, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex max-w-reading flex-col gap-2", className)}>
      {eyebrow && (
        <Eyebrow className={cn(onPanel && "text-sign-panel-muted")}>{eyebrow}</Eyebrow>
      )}
      <h2 id={id} className="font-heading text-h1 leading-h1 font-bold text-balance">
        {title}
      </h2>
      {text && (
        <p className={cn("text-body-lg leading-body-lg", onPanel ? "text-sign-panel-muted" : "text-muted-foreground")}>
          {text}
        </p>
      )}
    </div>
  );
}

/** A graphite card with the 4px orange stripe on top, like a highway sign. */
export function SignPanel({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & Omit<React.ComponentProps<"section">, "children" | "className">) {
  return (
    <section
      className={cn(
        "rounded-sign border-t-4 border-sign-panel-border bg-sign-panel p-6 text-sign-panel-foreground",
        className,
      )}
      data-slot="sign-panel"
      {...rest}
    >
      {children}
    </section>
  );
}

/** A Lucide line icon on a neutral square tile: muted fill, 1px border, 4px corners. */
export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="icon-tile"
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-field border border-border bg-muted text-foreground",
        className,
      )}
    >
      <Icon className="size-6" strokeWidth={2} />
    </span>
  );
}

/** The orange check badge (the progress-fill orange, one of the four allowed uses). */
export function CheckMark() {
  return (
    <span
      aria-hidden="true"
      data-slot="check-badge"
      className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-badge bg-progress-fill text-primary-foreground"
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
}

/** A list line with the check badge. */
export function CheckItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <li className={cn("flex items-start gap-3", className)} data-slot="check-item">
      <CheckMark />
      <span>{children}</span>
    </li>
  );
}

/** A card that is one link, with an arrow that moves 2px on hover. No lift, no shadow. */
export function LinkCard({
  href,
  title,
  text,
  className,
}: SiteLink & { title: string; text?: string; className?: string }) {
  return (
    <Link
      href={href}
      data-slot="link-card"
      className={cn(
        "group flex min-h-target items-center justify-between gap-4 rounded-card border border-border bg-card p-4 transition-colors duration-(--motion-fast) ease-motion hover:border-border-strong",
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-label leading-label font-semibold">{title}</span>
        {text && <span className="text-helper leading-helper text-muted-foreground">{text}</span>}
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-5 shrink-0 transition-transform duration-(--motion-fast) ease-motion group-hover:translate-x-0.5"
      />
    </Link>
  );
}

interface CtaBandProps {
  title: string;
  text?: string;
  primary: SiteLink;
  secondary?: SiteLink;
}

/** The graphite band at the end of a page with the page's two calls to action. */
export function CtaBand({ title, text, primary, secondary }: CtaBandProps) {
  return (
    <SignPanel aria-labelledby="final-cta" className="flex flex-col items-start gap-6 sm:p-10">
      <div className="flex flex-col gap-2">
        <h2 id="final-cta" className="font-heading text-h1 leading-h1 font-bold">
          {title}
        </h2>
        {text && <p className="text-body-lg leading-body-lg text-sign-panel-muted">{text}</p>}
      </div>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild className="sm:min-w-48">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
        {secondary && (
          <Button asChild variant="secondary" className="sm:min-w-48">
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        )}
      </div>
    </SignPanel>
  );
}
