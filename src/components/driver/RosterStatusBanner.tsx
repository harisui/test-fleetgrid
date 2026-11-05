import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { InlineNote } from "@/components/shared/InlineNote";
import {
  DRIVER_MISSING_ITEMS,
  REQUIRED_DOCUMENTS,
  ROSTER_READY,
  type ShiftReadyItem,
} from "@/lib/drivers/tiers";
import type { AccountStatus } from "@/types/domain";

interface RosterStatusBannerProps {
  status: AccountStatus;
  /** What keeps the driver from Roster-Ready, from shiftReadyMissing(). */
  missing: readonly ShiftReadyItem[];
  /** True when shift texts reach this driver: opted in and never replied STOP. */
  textsOn: boolean;
  /** Inside the grace period: the time the driver must add what is missing by. */
  graceUntil?: string | null;
}

const LINK = "font-semibold underline underline-offset-4";

/**
 * Where the driver stands (CR-5), at the top of My shifts and the profile. Registered: exactly
 * what is missing, each item linked to where it is added. Roster-Ready: that matching shifts
 * will be texted, or how to turn texts on. Nothing for a blocked account; the profile explains.
 */
export function RosterStatusBanner({ status, missing, textsOn, graceUntil = null }: RosterStatusBannerProps) {
  if (status === "blocked") return null;

  if (status === "approved" && graceUntil && missing.length > 0) {
    return (
      <InlineNote variant="warning" data-slot="roster-status" data-status="grace">
        <p>
          Add these by {formatInTimeZone(new Date(graceUntil), "America/Chicago", "MMMM d")} to stay {ROSTER_READY}:
        </p>
        <ul className="mt-2 flex flex-col gap-1" aria-label="What is missing" data-slot="roster-missing">
          {missing.map((item) => (
            <li key={item}>
              <Link href={DRIVER_MISSING_ITEMS[item].href} className={LINK}>
                {DRIVER_MISSING_ITEMS[item].label}
              </Link>
            </li>
          ))}
        </ul>
      </InlineNote>
    );
  }

  if (status === "approved") {
    return (
      <InlineNote variant="success" data-slot="roster-status" data-status="approved">
        You&apos;re {ROSTER_READY}.{" "}
        {textsOn ? (
          "We'll text you when matching shifts open."
        ) : (
          <Link href="/driver/profile" className={LINK}>
            Turn on texts in your profile to get shift offers.
          </Link>
        )}
      </InlineNote>
    );
  }

  if (missing.length === 0) {
    return (
      <InlineNote variant="info" data-slot="roster-status" data-status="pending">
        Your documents are in. FleetGrid staff are reviewing your profile.
      </InlineNote>
    );
  }

  const missingDocuments = missing.some((item) => (REQUIRED_DOCUMENTS as readonly string[]).includes(item));
  return (
    <InlineNote variant="warning" data-slot="roster-status" data-status="pending">
      <p>{missingDocuments ? "Upload your CDL and medical card to start getting shift offers." : "To start getting shift offers, we still need:"}</p>
      <ul className="mt-2 flex flex-col gap-1" aria-label="What is missing" data-slot="roster-missing">
        {missing.map((item) => (
          <li key={item}>
            <Link href={DRIVER_MISSING_ITEMS[item].href} className={LINK}>
              {DRIVER_MISSING_ITEMS[item].label}
            </Link>
          </li>
        ))}
      </ul>
    </InlineNote>
  );
}
