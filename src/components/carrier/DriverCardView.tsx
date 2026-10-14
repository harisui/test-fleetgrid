import { ExternalLink, FileText, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMiles, summarizeDriver } from "@/lib/carrier/driverSummary";
import { formatFileSize } from "@/lib/image";
import { AVAILABILITY_LABELS, DOCUMENT_TYPE_LABELS, type Driver, type DriverDocument } from "@/types/domain";
import { DRIVING_STYLE_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from "@/lib/onboarding/options";

interface DriverCardViewProps {
  driver: Driver;
  distanceMiles: number;
  documents: DriverDocument[];
}

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

/** A row of the card. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <dt className="w-32 shrink-0 text-helper leading-helper text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-label leading-label font-semibold">{value}</dd>
    </div>
  );
}

/**
 * One listed driver as a carrier sees them: the sign-up answers, the optional profile
 * answers when given, and the papers as links that open in a new tab. No phone number.
 */
export function DriverCardView({ driver, distanceMiles, documents }: DriverCardViewProps) {
  const summary = summarizeDriver(driver);
  const optional = [
    driver.employmentType && {
      label: "W-2 or 1099",
      value: labelOf(EMPLOYMENT_TYPE_OPTIONS, driver.employmentType),
    },
    driver.drivingStyles.length > 0 && {
      label: "Driving",
      value: driver.drivingStyles.map((style) => labelOf(DRIVING_STYLE_OPTIONS, style)).join(", "),
    },
    driver.clearinghouseRegistered !== null && {
      label: "Clearinghouse",
      value: driver.clearinghouseRegistered ? "Registered" : "Not registered",
    },
    driver.availability.length > 0 && {
      label: "Availability",
      value: driver.availability.map((slot) => AVAILABILITY_LABELS[slot]).join(", "),
    },
    driver.certifications.length > 0 && {
      label: "Certifications",
      value: driver.certifications.join(", "),
    },
  ].filter((row): row is { label: string; value: string } => Boolean(row));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">{driver.fullName}</h1>
        <p className="flex items-center gap-2 text-helper leading-helper text-muted-foreground">
          <MapPin aria-hidden="true" className="size-5" />
          <span>
            {driver.city}, {driver.state} {driver.zip}
          </span>
          <Badge variant="secondary" data-slot="distance">
            {formatMiles(distanceMiles)} from your yard
          </Badge>
        </p>
        <p className="text-helper leading-helper text-muted-foreground">
          Travels up to {driver.serviceRadiusMiles} miles for work. Shift offers reach this driver
          by text through FleetGrid.
        </p>
      </div>

      <section aria-labelledby="card-title" className="flex flex-col gap-3">
        <h2 id="card-title" className="font-heading text-h2 leading-h2 font-semibold">
          Qualification card
        </h2>
        <dl
          className="divide-y divide-border rounded-card border border-border-strong bg-card"
          data-slot="driver-card"
        >
          <Row label="CDL class" value={summary.cdlClass} />
          <Row label="Experience" value={summary.experience} />
          <Row label="Record" value={summary.record} />
          <Row label="Cards" value={summary.cards} />
          <Row label="Endorsements" value={summary.endorsements} />
          <Row label="Transmission" value={summary.transmission} />
          <Row label="Equipment" value={summary.equipment} />
          {optional.map((row) => (
            <Row key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>
        {driver.bio && (
          <blockquote
            className="rounded-card border border-border bg-card p-4 text-helper leading-helper"
            data-slot="bio"
          >
            {driver.bio}
          </blockquote>
        )}
      </section>

      <section aria-labelledby="papers-title" className="flex flex-col gap-3">
        <h2 id="papers-title" className="font-heading text-h2 leading-h2 font-semibold">
          Papers
        </h2>
        {documents.length === 0 ? (
          <p className="text-helper leading-helper text-muted-foreground" data-slot="no-papers">
            No papers uploaded yet. Drivers are asked for their CDL photos when they take a shift.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Papers">
            {documents.map((document) => (
              <li key={document.id}>
                <a
                  href={`/api/documents/${document.id}/url`}
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-target items-center gap-3 rounded-card border border-border-strong bg-card px-4 py-2 hover:bg-muted"
                >
                  <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-label leading-label font-semibold">
                      {DOCUMENT_TYPE_LABELS[document.type]}
                    </span>
                    <span className="truncate text-helper leading-helper text-muted-foreground">
                      {document.fileName}, {formatFileSize(document.sizeBytes)}
                    </span>
                  </span>
                  <ExternalLink aria-hidden="true" className="size-5 shrink-0" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
