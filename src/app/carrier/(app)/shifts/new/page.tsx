import type { Metadata } from "next";
import { ShiftForm } from "@/components/carrier/ShiftForm";
import { requireActiveSubscription } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Post a shift" };

export default async function NewShiftPage() {
  await requireActiveSubscription();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">Post a shift</h1>
        <p className="text-helper leading-helper text-muted-foreground">
          FleetGrid texts the drivers who match. The first to reply YES with the code books it, and you see their
          name and number here.
        </p>
      </div>
      <ShiftForm />
    </div>
  );
}
