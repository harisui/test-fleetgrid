import { CircleCheck, CreditCard, MapPinOff, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/carrier/options";
import type { CarrierAccess } from "@/server/services/CarrierService";
import type { LocatedCarrier } from "@/types/domain";

interface CarrierStatusCardProps {
  carrier: LocatedCarrier;
  access: Pick<CarrierAccess, "subscription" | "subscribed">;
}

/** The company, the yard and the subscription at a glance, with a link to billing. */
export function CarrierStatusCard({ carrier, access }: CarrierStatusCardProps) {
  return (
    <section
      aria-label="Company status"
      className="flex flex-col gap-4 rounded-card border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-label leading-label font-semibold">{carrier.companyName}</h2>
          {!carrier.inServiceArea && (
            <Badge variant="info" data-area="outside">
              <MapPinOff aria-hidden="true" />
              Outside launch area
            </Badge>
          )}
        </div>
        <p className="text-helper leading-helper text-muted-foreground">
          Yard at {carrier.city}, {carrier.state} {carrier.zip}. Contact {carrier.contactName},{" "}
          {carrier.billingEmail}.
        </p>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-label leading-label font-semibold">Subscription</h2>
          {access.subscription ? (
            <Badge
              variant={access.subscribed ? "success" : "warning"}
              data-subscription={access.subscription.status}
            >
              {access.subscribed ? <CircleCheck aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
              {SUBSCRIPTION_STATUS_LABELS[access.subscription.status]}
            </Badge>
          ) : (
            <Badge variant="outline" data-subscription="none">
              <CreditCard aria-hidden="true" />
              Not subscribed
            </Badge>
          )}
        </div>
        <p className="text-helper leading-helper text-muted-foreground">
          {access.subscribed
            ? "Driver search is open."
            : "Driver search opens with an active subscription."}{" "}
          <Button asChild variant="link">
            <Link href="/carrier/billing">Billing</Link>
          </Button>
        </p>
      </div>
    </section>
  );
}
