import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { GenerateQrSheet } from "@/components/admin/GenerateQrSheet";
import { QrDetailSheet } from "@/components/admin/QrDetailSheet";
import { QrTable } from "@/components/admin/QrTable";
import { SignupTiles } from "@/components/admin/SignupTiles";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { SourcesTable } from "@/components/admin/SourcesTable";
import { analyticsHref } from "@/lib/admin/analytics-options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { QrLinkRow } from "@/server/services/AnalyticsService";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Sign-up sources and the QR codes (Milestone 3, part 3), and the carrier, revenue and shift
 * tiles (T3.11).
 */
export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const { user } = await requireAdmin();
  const params = await searchParams;
  const { analyticsService, qrService, adminOpsService } = await getContainer();
  const [overview, ops] = await Promise.all([
    analyticsService.getOverview(user.id, params),
    adminOpsService.getOpsTiles(user.id),
  ]);

  let openRow: QrLinkRow | null = null;
  if (overview.query.open) {
    try {
      const link = await qrService.getLink(user.id, { qrLinkId: overview.query.open });
      openRow = await analyticsService.getQrLinkRow(user.id, link);
    } catch (error) {
      if (!(error instanceof AppError && error.code === "NOT_FOUND")) throw error;
    }
  }

  return (
    <AdminPage
      title="Analytics"
      subtitle="Where drivers come from, the QR codes on the flyers, and how carriers and shifts are doing."
      actions={<GenerateQrSheet period={overview.period} />}
    >
      <SignupTiles tiles={overview.tiles} />
      <StatTileGrid label="Carriers, revenue and shifts" columns={4}>
        <StatTile label="Carriers" value={ops.carriers} caption={`${ops.subscribed} subscribed`} />
        <StatTile label="MRR" value={`$${ops.mrr.toLocaleString("en-US")}`} caption="monthly recurring revenue" />
        <StatTile label="Shifts, 30 days" value={ops.shifts30d} caption={`${ops.booked30d} booked`} />
        <StatTile label="Fill rate, 30 days" value={ops.fillRate30d === null ? "None yet" : `${ops.fillRate30d}%`} caption="booked of booked or expired" />
      </StatTileGrid>
      <SourcesTable sources={overview.sources} period={overview.period} />
      <QrTable rows={overview.qrLinks} period={overview.period} />
      <QrDetailSheet row={openRow} closeHref={analyticsHref({ period: overview.period })} />
    </AdminPage>
  );
}
