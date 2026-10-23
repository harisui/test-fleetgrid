import { Building2, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { isCarrierDisabled } from "@/lib/carrier/availability";
import { getSupportContact } from "@/lib/support";

export const metadata: Metadata = { title: "Carriers: coming soon" };

/**
 * Shown in place of the carrier side while CARRIER_DISABLED=true. With the flag off this page
 * has no purpose, so it sends the visitor to the carrier login.
 */
export default function CarriersComingSoonPage() {
  if (!isCarrierDisabled()) redirect("/login?role=carrier");
  const contact = getSupportContact();

  return (
    <AppShell width="narrow">
      <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-12 text-center">
        <Building2 aria-hidden="true" className="size-10 text-muted-foreground" />
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Carriers: coming soon
          </h1>
          <p className="text-muted-foreground">
            Carrier sign-up is not open yet. Drivers are building their qualification cards now,
            so there will be local CDL drivers ready to search when it opens.
          </p>
          <p className="text-muted-foreground">
            Want to hear when it does? Email{" "}
            <a
              href={`mailto:${contact.email}`}
              className="text-foreground underline underline-offset-4"
            >
              <Mail aria-hidden="true" className="mr-1 inline size-4 align-text-bottom" />
              {contact.email}
            </a>
            .
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/">Back to the home page</Link>
        </Button>
      </div>
    </AppShell>
  );
}
