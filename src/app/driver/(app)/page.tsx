import { CalendarCheck, Phone } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { ShiftSummary } from "@/components/shifts/ShiftSummary";
import { EmptyState } from "@/components/shared/EmptyState";
import { RosterStatusBanner } from "@/components/driver/RosterStatusBanner";
import { requireDriverWithCdlState } from "@/lib/auth/guards";
import { shiftReadyMissing } from "@/lib/drivers/tiers";
import { formatE164ForDisplay } from "@/lib/phone";
import { getContainer } from "@/server/container";
import type { Shift } from "@/types/domain";

export const metadata: Metadata = { title: "My shifts" };

function ShiftCard({ shift }: { shift: Shift }) {
  const cancelled = shift.status === "cancelled";
  return (
    <li className="flex flex-col gap-3 rounded-card border-2 border-border bg-card p-5" data-slot="my-shift">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-h3 leading-h3 font-semibold">CDL-{shift.cdlClass} shift</h2>
        <ShiftStatusBadge status={shift.status} />
      </div>
      <ShiftSummary shift={shift} />
      {cancelled ? (
        <p className="text-body leading-body">The company that posted this shift cancelled it.</p>
      ) : (
        <>
          <p className="text-body leading-body whitespace-pre-line">{shift.workDescription}</p>
          {shift.payText && <p className="text-body leading-body">Pay: {shift.payText}</p>}
          <div className="flex flex-col gap-1">
            <p className="text-label leading-label font-semibold">Ask for {shift.onsiteContactName}</p>
            <a
              href={`tel:${shift.onsiteContactPhone}`}
              className="flex min-h-target items-center gap-2 self-start text-body leading-body underline underline-offset-4"
            >
              <Phone aria-hidden="true" className="size-5" />
              {formatE164ForDisplay(shift.onsiteContactPhone)}
            </a>
          </div>
        </>
      )}
    </li>
  );
}

/**
 * My shifts: the shifts the driver booked by text, with the time, the place, the work, the
 * pay line and the on-site contact (decision 1 of 2026-11-01: the approved booked text points
 * here instead of carrying the contact).
 */
export default async function MyShiftsPage() {
  const { user, profile } = await requireDriverWithCdlState();
  const { driverService, shiftService, documentService } = await getContainer();
  const state = await driverService.getOnboardingState(user.id);
  if (!state.completed || !state.driver) redirect("/driver/onboarding");

  const [{ upcoming, past }, documents] = await Promise.all([
    shiftService.listDriverShifts(state.driver.id),
    documentService.list(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">My shifts</h1>
        <p className="text-helper leading-helper text-muted-foreground">
          Shifts you booked by replying YES. Reply STOP to any text to stop shift texts.
        </p>
      </div>
      <RosterStatusBanner
        status={profile.status}
        missing={shiftReadyMissing(state.driver, documents.map((document) => document.type))}
        textsOn={state.driver.smsOptIn && !state.driver.smsOptedOut}
      />
      {upcoming.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No booked shifts"
          description={
            state.driver.smsOptIn && !state.driver.smsOptedOut
              ? "When a shift that fits your card is posted, we text you. Reply YES with the code to book it."
              : "Turn on shift texts on your profile to hear about shifts near you."
          }
        />
      ) : (
        <ul className="flex flex-col gap-4" aria-label="Upcoming shifts">
          {upcoming.map((shift) => (
            <ShiftCard key={shift.id} shift={shift} />
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="past-shifts">
          <h2 id="past-shifts" className="font-heading text-h3 leading-h3 font-semibold">
            Past shifts
          </h2>
          <ul className="flex flex-col gap-4" aria-label="Past shifts">
            {past.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
