import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { GenerateQrSheet } from "@/components/admin/GenerateQrSheet";
import { QrDetailSheet } from "@/components/admin/QrDetailSheet";
import { QrTable } from "@/components/admin/QrTable";
import { SignupTiles } from "@/components/admin/SignupTiles";
import { SourcesTable } from "@/components/admin/SourcesTable";
import { analyticsHref } from "@/lib/admin/analytics-options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { QrLinkRow } from "@/server/services/AnalyticsService";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Sign-up sources and the QR codes (Milestone 3, part 3). Sections, so the carrier,
 * subscription and shift metrics can join them later.
 */
export default async function AdminAnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  const { user } = await requireAdmin();
  const params = await searchParams;
  const { analyticsService, qrService } = await getContainer();
  const overview = await analyticsService.getOverview(user.id, params);

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
      subtitle="Where drivers come from, and the QR codes on the flyers."
      actions={<GenerateQrSheet period={overview.period} />}
    >
      <SignupTiles tiles={overview.tiles} />
      <SourcesTable sources={overview.sources} period={overview.period} />
      <QrTable rows={overview.qrLinks} period={overview.period} />
      <QrDetailSheet row={openRow} closeHref={analyticsHref({ period: overview.period })} />
    </AdminPage>
  );
}
