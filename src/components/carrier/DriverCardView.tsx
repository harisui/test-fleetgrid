import { FileCheck, MapPin, MessageSquareOff } from "lucide-react";
import { SelfReportedTag } from "@/components/shared/SelfReportedTag";
import { Badge } from "@/components/ui/badge";
import { DOCUMENTED_PROFILE } from "@/lib/drivers/tiers";
import {
  formatMiles,
  NO_SHIFT_TEXTS_LABEL,
  receivesShiftTexts,
  summarizeDriver,
} from "@/lib/carrier/driverSummary";
import { AVAILABILITY_LABELS, type CarrierDriverCard } from "@/types/domain";
import { DRIVING_STYLE_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from "@/lib/onboarding/options";

interface DriverCardViewProps {
  driver: CarrierDriverCard;
  distanceMiles: number;
}

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) =>
  options.find((option) => option.value === value)?.label ?? value;

/** A row of the card. */
function Row({ label, value, selfReported = false }: { label: string; value: string; selfReported?: boolean }) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      <dt className="w-32 shrink-0 text-helper leading-helper text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-label leading-label font-semibold">
        {value}
        {selfReported && <SelfReportedTag />}
      </dd>
    </div>
  );
}

/**
 * One listed driver as a carrier sees them: the sign-up answers, the optional profile
 * answers when given. No phone number and no documents: those belong to a booked shift.
 * Only a Roster-Ready driver reaches this page (RLS), so each carries the carrier's badge, except
 * one in the grace period, whose documents may not be on file yet.
 */
export function DriverCardView({ driver, distanceMiles }: DriverCardViewProps) {
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
      selfReported: true,
    },
    driver.availability.length > 0 && {
      label: "Availability",
      value: driver.availability.map((slot) => AVAILABILITY_LABELS[slot]).join(", "),
    },
    driver.certifications.length > 0 && {
      label: "Certifications",
      value: driver.certifications.join(", "),
    },
  ].filter((row): row is { label: string; value: string; selfReported?: boolean } => Boolean(row));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">{driver.fullName}</h1>
        {driver.rosterGraceUntil === null && (
          <span className="flex">
            <Badge variant="secondary" data-slot="documented-profile">
              <FileCheck aria-hidden="true" />
              {DOCUMENTED_PROFILE}
            </Badge>
          </span>
        )}
        <p className="flex items-center gap-2 text-helper leading-helper text-muted-foreground">
          <MapPin aria-hidden="true" className="size-5" />
          <span>
            {driver.city}, {driver.state} {driver.zip}
          </span>
          <Badge variant="secondary" data-slot="distance">
            {formatMiles(distanceMiles)} from your yard
          </Badge>
        </p>
        {receivesShiftTexts(driver) ? (
          <p className="text-helper leading-helper text-muted-foreground" data-slot="texts-status">
            Travels up to {driver.serviceRadiusMiles} miles for work. Shift offers reach this
            driver by text through FleetGrid.
          </p>
        ) : (
          <p
            className="flex flex-wrap items-center gap-2 text-helper leading-helper text-muted-foreground"
            data-slot="texts-status"
          >
            <Badge variant="warning" data-slot="no-shift-texts">
              <MessageSquareOff aria-hidden="true" />
              {NO_SHIFT_TEXTS_LABEL}
            </Badge>
            <span>
              Travels up to {driver.serviceRadiusMiles} miles for work. This driver has not turned
              on shift texts, so a broadcast will not reach them.
            </span>
          </p>
        )}
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
          <Row label="Experience" value={summary.experience} selfReported />
          <Row label="Record" value={summary.record} />
          <Row label="Cards" value={summary.cards} selfReported />
          <Row label="Endorsements" value={summary.endorsements} />
          <Row label="Transmission" value={summary.transmission} />
          <Row label="Equipment" value={summary.equipment} />
          {optional.map((row) => (
            <Row key={row.label} label={row.label} value={row.value} selfReported={row.selfReported} />
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

    </div>
  );
}
