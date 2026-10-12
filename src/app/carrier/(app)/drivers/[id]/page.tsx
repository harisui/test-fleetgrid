import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DriverCardView } from "@/components/carrier/DriverCardView";
import { Button } from "@/components/ui/button";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";

export const metadata: Metadata = { title: "Driver" };

/** One listed driver. A card the carrier may not see is a 404, the same as a wrong id. */
export default async function CarrierDriverPage({ params }: PageProps<"/carrier/drivers/[id]">) {
  const { user } = await requireActiveSubscription();
  const { id } = await params;
  const { driverSearchService } = await getContainer();

  let view;
  try {
    view = await driverSearchService.getDriver(user.id, { driverId: id });
  } catch (error) {
    if (error instanceof AppError && (error.code === "NOT_FOUND" || error.code === "VALIDATION")) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <Button asChild variant="link">
          <Link href="/carrier/search">
            <ChevronLeft aria-hidden="true" />
            Back to search
          </Link>
        </Button>
      </div>
      <DriverCardView
        driver={view.driver}
        distanceMiles={view.distanceMiles}
        documents={view.documents}
      />
    </div>
  );
}
