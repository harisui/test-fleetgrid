"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { DetailSheet } from "@/components/admin/DetailSheet";

/** A detail sheet opened by ?open=<id> in the URL; closing it goes back to the list. */
export function RoutedDetailSheet({
  closeHref,
  title,
  description,
  footer,
  children,
}: {
  closeHref: string;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <DetailSheet
      open
      onOpenChange={(open) => {
        if (!open) router.push(closeHref);
      }}
      title={title}
      description={description}
      footer={footer}
    >
      {children}
    </DetailSheet>
  );
}

/** One labelled row in a sheet's definition list. */
export function SheetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 py-2">
      <dt className="w-32 shrink-0 text-helper leading-helper text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-label leading-label font-semibold">{children}</dd>
    </div>
  );
}

/** A titled group inside a sheet. */
export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-eyebrow leading-eyebrow font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}
