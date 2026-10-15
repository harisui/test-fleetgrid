import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The marketing site's page column: 80rem wide (--site-max), centred, with a 16px gutter
 * on phones, 24px from md and 32px from lg. The header, the launch strip, the footer and
 * every section of the public pages share it. Driver onboarding keeps its own narrow column.
 */
export const CONTAINER_CLASS = "mx-auto w-full max-w-site px-4 md:px-6 lg:px-8";

type ContainerTag = "div" | "main" | "section" | "nav" | "article";

type ContainerProps<T extends ContainerTag> = {
  children: ReactNode;
  /** The element to render; a div unless the landmark matters. */
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "children" | "className">;

export function Container<T extends ContainerTag = "div">({
  children,
  as,
  className,
  ...rest
}: ContainerProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  return (
    <Tag data-slot="container" className={cn(CONTAINER_CLASS, className)} {...rest}>
      {children}
    </Tag>
  );
}
