import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminFilterLinks } from "@/components/admin/AdminFilterLinks";
import { CarriersTable } from "@/components/admin/CarriersTable";
import { CarrierStatusActions } from "@/components/admin/CarrierStatusActions";
import { RemoveAccountButton } from "@/components/admin/RemoveAccountButton";
import { RoutedDetailSheet, SheetRow, SheetSection } from "@/components/admin/RoutedDetailSheet";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { ShiftStatusBadge } from "@/components/shifts/ShiftStatusBadge";
import { auditLabel, subscriptionLabel } from "@/lib/admin/ops";
import { requireAdmin } from "@/lib/auth/guards";
import { formatE164ForDisplay } from "@/lib/phone";
import { shiftTimeRange } from "@/lib/shifts/copy";
import { CARRIER_FILTERS } from "@/lib/validation/admin-ops.schema";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { AdminCarrierDetail } from "@/server/services/AdminOpsService";

export const metadata: Metadata = { title: "Carriers" };

const FILTER_LABELS: Record<(typeof CARRIER_FILTERS)[number], string> = {
  "": "All",
  subscribed: "Subscribed",
  unpaid: "Not subscribed",
  blocked: "Blocked",
};

function carriersHref(status: string, open?: string): string {
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (open) query.set("open", open);
  const text = query.toString();
  return `/admin/carriers${text ? `?${text}` : ""}`;
}

/** Every carrier with their subscription and yard; ?open=<id> shows one with its shifts and history. */
export default async function AdminCarriersPage({ searchParams }: PageProps<"/admin/carriers">) {
  const { user } = await requireAdmin();
  const { adminOpsService } = await getContainer();
  const page = await adminOpsService.getCarriersPage(user.id, await searchParams);
  let detail: AdminCarrierDetail | null = null;
  if (page.query.open) {
    detail = await adminOpsService.getCarrier(user.id, { carrierId: page.query.open }).catch((error: unknown) => {
      if (error instanceof AppError && error.code === "NOT_FOUND") return null;
      throw error;
    });
  }
  const status = page.query.status;

  return (
    <AdminPage
      title="Carriers"
      subtitle="Every company that signed up, with its yard and subscription. Block a carrier to stop their access at once."
    >
      <StatTileGrid label="Carrier counts" columns={4}>
        <StatTile label="Total" value={page.tiles.total} />
        <StatTile label="Subscribed" value={page.tiles.subscribed} caption="active or trialing" />
        <StatTile label="Not subscribed" value={page.tiles.unpaid} />
        <StatTile label="Blocked" value={page.tiles.blocked} />
      </StatTileGrid>
      <AdminFilterLinks
        label="Filter carriers"
        current={status}
        links={CARRIER_FILTERS.map((filter) => ({ value: filter, label: FILTER_LABELS[filter], href: carriersHref(filter) }))}
      />
      <CarriersTable
        rows={page.rows}
        openHrefs={Object.fromEntries(page.rows.map((row) => [row.carrier.id, carriersHref(status, row.carrier.id)]))}
      />
      {detail && (
        <RoutedDetailSheet
          closeHref={carriersHref(status)}
          title={detail.carrier.companyName}
          description={`Signed up ${format(new Date(detail.carrier.createdAt), "MMMM d, yyyy")}`}
          footer={
            <>
              <RemoveAccountButton profileId={detail.profile.id} name={detail.carrier.companyName} afterHref={carriersHref(status)} />
              <CarrierStatusActions carrierId={detail.carrier.id} name={detail.carrier.companyName} status={detail.profile.status} />
            </>
          }
        >
          <div className="flex flex-wrap gap-2">
            <AdminStatusBadge status={detail.profile.status} />
          </div>
          <SheetSection title="Company">
            <dl className="divide-y divide-border rounded-card border border-border bg-card">
              <SheetRow label="Contact">{detail.carrier.contactName}</SheetRow>
              <SheetRow label="Phone">
                <a href={`tel:${detail.profile.phone}`} className="font-mono underline-offset-4 hover:underline">
                  {formatE164ForDisplay(detail.profile.phone)}
                </a>
              </SheetRow>
              <SheetRow label="Billing email">{detail.carrier.billingEmail}</SheetRow>
              <SheetRow label="USDOT">{detail.carrier.usdot ?? "Not given"}</SheetRow>
              <SheetRow label="MC">{detail.carrier.mc ?? "Not given"}</SheetRow>
              <SheetRow label="Yard">
                {detail.carrier.city} {detail.carrier.state} {detail.carrier.zip},{" "}
                {detail.inServiceArea ? "inside an area" : "outside every area"}
              </SheetRow>
            </dl>
          </SheetSection>
          <SheetSection title="Subscription">
            <dl className="divide-y divide-border rounded-card border border-border bg-card">
              <SheetRow label="Status">{subscriptionLabel(detail)}</SheetRow>
              {detail.subscription?.currentPeriodEnd && (
                <SheetRow label="Paid until">{format(new Date(detail.subscription.currentPeriodEnd), "MMM d, yyyy")}</SheetRow>
              )}
            </dl>
          </SheetSection>
          <SheetSection title={`Shifts (${detail.shifts.length})`}>
            {detail.shifts.length === 0 ? (
              <p className="text-helper leading-helper text-muted-foreground">No shifts posted.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.shifts.map((shift) => (
                  <li key={shift.id}>
                    <Link
                      href={`/admin/shifts?open=${shift.id}`}
                      className="flex min-h-target items-center justify-between gap-2 rounded-field border border-border bg-card px-3 py-2 text-helper leading-helper hover:border-border-strong"
                    >
                      <span>{shiftTimeRange(shift)}</span>
                      <ShiftStatusBadge status={shift.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SheetSection>
          {detail.history.length > 0 && (
            <SheetSection title="History">
              <ul className="flex flex-col gap-1 text-helper leading-helper">
                {detail.history.map((entry) => (
                  <li key={entry.id}>
                    {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}: {auditLabel(entry.action)} by{" "}
                    {formatE164ForDisplay(entry.adminPhone)}
                  </li>
                ))}
              </ul>
            </SheetSection>
          )}
        </RoutedDetailSheet>
      )}
    </AdminPage>
  );
}
