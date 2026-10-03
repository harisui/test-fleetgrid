import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" placeholder>
      <p className="text-muted-foreground">
        The final Privacy Policy will be published here before FleetGrid opens to the public.
      </p>
      <p className="text-small leading-small text-muted-foreground">
        ZIP code, city and state data comes from{" "}
        <a
          href="https://www.geonames.org/"
          className="underline underline-offset-4"
          rel="noopener noreferrer"
          target="_blank"
        >
          GeoNames
        </a>
        , used under the Creative Commons Attribution 4.0 license. It is stored on our servers and
        is never sent to a third party.
      </p>
    </LegalPage>
  );
}
