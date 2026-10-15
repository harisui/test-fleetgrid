import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Faq } from "@/components/marketing/Faq";
import { Button } from "@/components/ui/button";
import { FAQ_GROUPS } from "@/content/faq";
import { FAQ_PAGE } from "@/content/marketing";

export const metadata: Metadata = {
  title: "FAQ for Carriers and Drivers",
  description:
    "Plain answers about pricing, the service area, profile review, shift texts, STOP and HELP, and how payment works on FleetGrid.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return (
    <AppShell variant="marketing">
      <div className="flex flex-col gap-10 py-4 sm:py-8">
        <div className="flex max-w-reading flex-col gap-3">
          <h1 className="font-heading text-h1 leading-h1 font-bold sm:text-4xl sm:leading-tight">
            {FAQ_PAGE.title}
          </h1>
          <p className="text-body-lg leading-body-lg text-muted-foreground">{FAQ_PAGE.intro}</p>
          <nav aria-label="Groups">
            <ul className="flex flex-wrap gap-2">
              {FAQ_GROUPS.map((group) => (
                <li key={group.id}>
                  <Button asChild variant="secondary" size="md">
                    <a href={`#${group.id}`}>{group.title}</a>
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <Faq groups={FAQ_GROUPS} />

        <p className="text-body-lg leading-body-lg">
          Anything else?{" "}
          <Link href={FAQ_PAGE.contact.href} className="font-semibold underline underline-offset-4">
            {FAQ_PAGE.contact.label}
          </Link>
          .
        </p>
      </div>
    </AppShell>
  );
}
