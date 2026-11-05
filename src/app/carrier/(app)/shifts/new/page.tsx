import type { Metadata } from "next";
import { ShiftForm } from "@/components/carrier/ShiftForm";
import { InlineNote } from "@/components/shared/InlineNote";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { shiftFormValues } from "@/lib/shifts/copy";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Post a shift" };

/** With ?from=, the form starts filled in from one of this carrier's own shifts (Cancel and repost). */
export default async function NewShiftPage({ searchParams }: PageProps<"/carrier/shifts/new">) {
  const { user } = await requireActiveSubscription();
  const { from } = await searchParams;
  const { shiftService } = await getContainer();
  const source = typeof from === "string" ? await shiftService.getCarrierShift(user.id, { shiftId: from }).catch(() => null) : null;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">Post a shift</h1>
        <p className="text-helper leading-helper text-muted-foreground">
          FleetGrid texts the drivers who match. The first to reply YES with the code books it, and you see their
          name and number here.
        </p>
      </div>
      {source && (
        <InlineNote variant="info" data-slot="repost-note">
          Filled in from the shift you cancelled. Check the details, then post it. Nothing goes out until you do.
        </InlineNote>
      )}
      <ShiftForm initial={source ? shiftFormValues(source.shift) : undefined} />
    </div>
  );
}
