import { CalendarPlus, Truck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { ShiftSummary } from "@/components/shifts/ShiftSummary";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Shifts" };

/** The carrier's shifts, newest first, with their state at a glance. */
export default async function CarrierShiftsPage() {
  const { user } = await requireActiveSubscription();
  const { shiftService } = await getContainer();
  const shifts = await shiftService.listCarrierShifts(user.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-h1 leading-h1 font-semibold">Shifts</h1>
          <p className="text-helper leading-helper text-muted-foreground">
            Post an open shift and FleetGrid texts the drivers who match. The first YES books it.
          </p>
        </div>
        <Button asChild>
          <Link href="/carrier/shifts/new">
            <CalendarPlus aria-hidden="true" />
            Post a shift
          </Link>
        </Button>
      </div>

      {shifts.length === 0 ? (
        <EmptyState icon={Truck} title="No shifts yet" description="Your posted shifts show here with who booked them." />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Your shifts">
          {shifts.map((shift) => (
            <li key={shift.id}>
              <Link
                href={`/carrier/shifts/${shift.id}`}
                className="flex flex-col gap-3 rounded-card border-2 border-border bg-card p-4 transition-colors duration-(--dur-state) hover:border-border-strong"
                data-slot="shift-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">CDL-{shift.cdlClass} shift</span>
                  <ShiftStatusBadge status={shiftService.statusOf(shift)} scheduled={shift.sendAfter !== null} />
                </div>
                <ShiftSummary shift={shift} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
