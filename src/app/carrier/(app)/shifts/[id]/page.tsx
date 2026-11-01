import { ArrowLeft, Phone, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShiftActions } from "@/components/carrier/ShiftActions";
import { ShiftLiveRefresh } from "@/components/carrier/ShiftLiveRefresh";
import { SimulateReply } from "@/components/carrier/SimulateReply";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { ShiftSummary } from "@/components/shifts/ShiftSummary";
import { InlineNote } from "@/components/shared/InlineNote";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { formatE164ForDisplay } from "@/lib/phone";
import { RECIPIENT_STATUS_LABELS, scheduledLine } from "@/lib/shifts/copy";
import { getContainer, smsProviderKind } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { BroadcastRecipient } from "@/types/domain";

export const metadata: Metadata = { title: "Shift" };

function countBy(recipients: BroadcastRecipient[], round: number) {
  const current = recipients.filter((r) => r.round === round);
  const delivered = current.filter((r) => ["delivered", "booked", "too_late"].includes(r.status)).length;
  return { sent: current.length, delivered, current };
}

/**
 * One shift: its state, live (T3.9); the booked driver's name and phone, on this page only
 * (2026-10-25); who was texted in the current round; cancel and release.
 */
export default async function CarrierShiftPage({ params }: PageProps<"/carrier/shifts/[id]">) {
  const { user } = await requireActiveSubscription();
  const { id } = await params;
  const { shiftService } = await getContainer();
  const detail = await shiftService.getCarrierShift(user.id, { shiftId: id }).catch((error: unknown) => {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "VALIDATION")) notFound();
    throw error;
  });
  const { shift, recipients, bookedDriver } = detail;
  const status = shiftService.statusOf(shift);
  const { sent, delivered, current } = countBy(recipients, shift.broadcastRound);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ShiftLiveRefresh shiftId={shift.id} />
      <Link href="/carrier/shifts" className="flex min-h-target items-center gap-2 self-start text-label underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-5" />
        All shifts
      </Link>

      <div className="flex flex-col gap-3 rounded-card border-2 border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading text-h2 leading-h2 font-semibold">CDL-{shift.cdlClass} shift</h1>
          <ShiftStatusBadge status={status} scheduled={shift.sendAfter !== null} />
        </div>
        <ShiftSummary shift={shift} />
        {status === "open" && shift.sendAfter && (
          <InlineNote variant="info" data-slot="scheduled-line">
            {scheduledLine(shift.sendAfter)}
          </InlineNote>
        )}
        {status === "open" && !shift.sendAfter && (
          <p className="text-body leading-body" data-slot="shift-code">
            Code in the text: <span className="font-semibold tabular-nums">{shift.shortCode}</span>
          </p>
        )}
        <p className="text-body leading-body whitespace-pre-line">{shift.workDescription}</p>
        <p className="text-helper leading-helper text-muted-foreground">
          On site: {shift.onsiteContactName}, {formatE164ForDisplay(shift.onsiteContactPhone)}
          {shift.payText ? `. Pay: ${shift.payText}` : ""}
        </p>
        {shift.status === "cancelled" && (
          <p className="text-helper leading-helper text-muted-foreground">
            Cancelled{shift.cancelReason ? `: ${shift.cancelReason}` : "."}
          </p>
        )}
      </div>

      {bookedDriver && (
        <section className="flex flex-col gap-3 rounded-card border-2 border-success bg-success-subtle p-5" aria-labelledby="booked-by" data-slot="booked-driver">
          <h2 id="booked-by" className="font-heading text-h3 leading-h3 font-semibold">
            Booked by
          </h2>
          <p className="flex items-center gap-2 text-body leading-body">
            <UserRound aria-hidden="true" className="size-5" />
            {bookedDriver.fullName}
          </p>
          <a href={`tel:${bookedDriver.phone}`} className="flex min-h-target items-center gap-2 text-body leading-body font-semibold underline underline-offset-4">
            <Phone aria-hidden="true" className="size-5" />
            {formatE164ForDisplay(bookedDriver.phone)}
          </a>
          <p className="text-helper leading-helper">
            Use this number to arrange this shift only. If the driver does not show, release the shift and it goes out
            again.
          </p>
        </section>
      )}

      <ShiftActions shiftId={shift.id} status={status} driverName={bookedDriver?.fullName ?? null} />

      <section className="flex flex-col gap-3" aria-labelledby="texted">
        <h2 id="texted" className="font-heading text-h3 leading-h3 font-semibold">
          Texted drivers
        </h2>
        {shift.broadcastRound === 0 ? (
          <p className="text-body leading-body text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <>
            <p className="text-body leading-body" data-slot="recipient-counts">
              {sent} texted, {delivered} delivered{shift.broadcastRound > 1 ? `, round ${shift.broadcastRound}` : ""}.
            </p>
            {current.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Texted drivers">
                {current.map((recipient) => (
                  <li key={recipient.id} className="flex items-center justify-between gap-2 rounded-field border border-border bg-card px-3 py-2 text-helper leading-helper" data-status={recipient.status}>
                    <span>Driver {recipient.position}</span>
                    <span className="font-semibold">{RECIPIENT_STATUS_LABELS[recipient.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {smsProviderKind() === "fake" && current.length > 0 && <SimulateReply shiftId={shift.id} recipients={current} />}
    </div>
  );
}
