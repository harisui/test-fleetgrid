import { Building2, Mail } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getSupportContact } from "@/lib/support";

/** Shown at /carriers only while CARRIER_DISABLED=true. */
export function CarriersComingSoon() {
  const contact = getSupportContact();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 py-12 text-center">
      <Building2 aria-hidden="true" className="size-10 text-muted-foreground" />
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Carriers: coming soon</h1>
        <p className="text-muted-foreground">
          Carrier sign-up is not open yet. Drivers are building their qualification cards now, so
          there will be local CDL drivers ready to search when it opens.
        </p>
        <p className="text-muted-foreground">
          Want to hear when it does? Email{" "}
          <a href={`mailto:${contact.email}`} className="text-foreground underline underline-offset-4">
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
  );
}
