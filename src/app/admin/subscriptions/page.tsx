import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { WaiveFillButton } from "@/components/admin/WaiveFillButton";
import { Badge } from "@/components/ui/badge";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/carrier/options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { isAccessStatus } from "@/server/repositories/SubscriptionRepository";

export const metadata: Metadata = { title: "Subscriptions" };

const usd = (dollars: number) =>
  dollars.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const FILL_CHARGE_LABELS = { included: "Included in trial", billable: "$35", waived: "Waived" } as const;

/**
 * Every carrier subscription as Stripe last reported it, with the active count and MRR, and
 * this month's completed fills with their revenue and the waive (pricing of 2026-11-11).
 */
export default async function AdminSubscriptionsPage() {
  const { user } = await requireAdmin();
  const { adminOpsService, adminBillingService } = await getContainer();
  const [page, fills] = await Promise.all([adminOpsService.getSubscriptions(user.id), adminBillingService.getFills(user.id)]);

  return (
    <AdminPage title="Subscriptions" subtitle="Each carrier's subscription as Stripe last reported it. Active and trialing grant access.">
      <StatTileGrid label="Subscription counts" columns={4}>
        <StatTile label="Active" value={page.active} caption="carriers with access" />
        <StatTile label="In trial" value={page.trialing} caption="not billed yet" />
        <StatTile label="MRR" value={usd(page.mrr)} caption="paying carriers, $99 each" />
        <StatTile label="Fill revenue" value={usd(fills.revenueCents / 100)} caption={`this month, ${fills.billable} fills at $35`} />
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

      <section className="flex flex-col gap-3" aria-labelledby="fills-title">
        <h2 id="fills-title" className="font-heading text-h3 leading-h3 font-semibold">
          Completed fills this month
        </h2>
        <p className="text-helper leading-helper text-muted-foreground">
          A booked shift counts 2 hours after its end. {fills.included} included in trials, {fills.waived} waived.
        </p>
        {fills.rows.length === 0 ? (
          <p className="text-body leading-body text-muted-foreground">No completed fills this month.</p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Completed fills">
            {fills.rows.map(({ fill, companyName }) => (
              <li
                key={fill.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4"
                data-slot="fill-row"
              >
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{companyName ?? "Removed carrier"}</span>
                  <span className="text-helper leading-helper text-muted-foreground">
                    Shift of {format(new Date(fill.shiftStartsAt), "MMM d, yyyy")}
                    {fill.billedAt ? ", billed" : fill.charge === "billable" ? ", not billed yet" : ""}
                    {fill.waiveReason ? `. Waived: ${fill.waiveReason}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge variant={fill.charge === "billable" ? "success" : "secondary"}>{FILL_CHARGE_LABELS[fill.charge]}</Badge>
                  {fill.charge === "billable" && (
                    <WaiveFillButton fillId={fill.id} label={`${companyName ?? "this carrier"}, ${format(new Date(fill.shiftStartsAt), "MMM d")}`} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  );
}
