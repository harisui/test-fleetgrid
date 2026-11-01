import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/carrier/options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { isAccessStatus } from "@/server/repositories/SubscriptionRepository";

export const metadata: Metadata = { title: "Subscriptions" };

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Every carrier subscription as Stripe last reported it, with the active count and MRR. */
export default async function AdminSubscriptionsPage() {
  const { user } = await requireAdmin();
  const { adminOpsService } = await getContainer();
  const page = await adminOpsService.getSubscriptions(user.id);

  return (
    <AdminPage title="Subscriptions" subtitle="Each carrier's subscription as Stripe last reported it. Active and trialing grant access.">
      <StatTileGrid label="Subscription counts" columns={4}>
        <StatTile label="Active" value={page.active} caption="carriers with access" />
        <StatTile label="MRR" value={usd(page.mrr)} caption="monthly recurring revenue" />
      </StatTileGrid>
      {page.rows.length === 0 ? (
        <p className="text-body leading-body text-muted-foreground">No subscriptions yet.</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Subscriptions">
          {page.rows.map(({ subscription, companyName, carrierId }) => (
            <li key={subscription.id}>
              <Link
                href={`/admin/carriers?open=${carrierId}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4 hover:border-border-strong"
                data-slot="subscription-row"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{companyName}</span>
                  <span className="text-helper leading-helper text-muted-foreground">
                    Started {format(new Date(subscription.createdAt), "MMM d, yyyy")}
                    {subscription.currentPeriodEnd
                      ? `, paid until ${format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}`
                      : ""}
                    {subscription.cancelAtPeriodEnd ? ", ending" : ""}
                  </span>
                </span>
                <Badge variant={isAccessStatus(subscription.status) ? "success" : "secondary"}>
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  );
}
