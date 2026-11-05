import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CancelAndRepost } from "@/components/carrier/CancelAndRepost";
import { ShiftDetailsForm } from "@/components/carrier/ShiftDetailsForm";
import { ShiftSummary } from "@/components/shifts/ShiftSummary";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { formatE164ForDisplay } from "@/lib/phone";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";

export const metadata: Metadata = { title: "Edit shift details" };

/** The details of a live shift (T3.3). The time, place and requirements go through cancel and repost. */
export default async function EditShiftPage({ params }: PageProps<"/carrier/shifts/[id]/edit">) {
  const { user } = await requireActiveSubscription();
  const { id } = await params;
  const { shiftService } = await getContainer();
  const { shift, bookedDriver } = await shiftService.getCarrierShift(user.id, { shiftId: id }).catch((error: unknown) => {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "VALIDATION")) notFound();
    throw error;
  });
  const status = shiftService.statusOf(shift);
  if (status !== "open" && status !== "booked") redirect(`/carrier/shifts/${shift.id}`);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <Link href={`/carrier/shifts/${shift.id}`} className="flex min-h-target items-center gap-2 self-start text-label underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-5" />
        Back to the shift
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">Edit shift details</h1>
        <p className="text-helper leading-helper text-muted-foreground">
          The booked driver sees your changes on My shifts. No text goes out.
        </p>
      </div>
      <ShiftDetailsForm
        initial={{
          shiftId: shift.id,
          workDescription: shift.workDescription,
          payText: shift.payText ?? "",
          onsiteContactName: shift.onsiteContactName,
          onsiteContactPhone: formatE164ForDisplay(shift.onsiteContactPhone),
        }}
      />
      <section className="flex flex-col items-start gap-3 rounded-card border-2 border-border bg-card p-5" aria-labelledby="fixed-details" data-slot="fixed-details">
        <h2 id="fixed-details" className="font-heading text-h3 leading-h3 font-semibold">
          Time, place and requirements
        </h2>
        <ShiftSummary shift={shift} />
        <p className="text-helper leading-helper text-muted-foreground">
          These can&apos;t be edited, because drivers decide on them. To change them, cancel this shift and post a new one.
        </p>
        <CancelAndRepost shiftId={shift.id} status={status} driverName={bookedDriver?.fullName ?? null} />
      </section>
    </div>
  );
}
