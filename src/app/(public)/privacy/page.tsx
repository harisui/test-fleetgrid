import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" placeholder>
      <p className="text-muted-foreground">
        The final Privacy Policy will be published here before FleetGrid opens to the public.
      </p>
    </LegalPage>
  );
}
