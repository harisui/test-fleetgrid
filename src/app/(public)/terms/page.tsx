import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" placeholder>
      <p className="text-muted-foreground">
        The final Terms of Service will be published here before FleetGrid opens to the public.
      </p>
    </LegalPage>
  );
}
