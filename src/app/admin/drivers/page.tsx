import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { DocReminderButton } from "@/components/admin/DocReminderButton";
import { DriverDetailSheet } from "@/components/admin/DriverDetailSheet";
import { DriversTable } from "@/components/admin/DriversTable";
import { DriverTiles } from "@/components/admin/DriverTiles";
import { driversFilters, driversHref } from "@/lib/admin/options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";
import type { AdminDriverDetail } from "@/server/services/AdminService";
import type { DocReminderPreview } from "@/server/services/DocReminderService";
import { REQUIRED_DOCUMENTS } from "@/lib/drivers/tiers";

export const metadata: Metadata = { title: "Drivers" };

/**
 * Every driver who signed up: the counts, the filtered list (every filter in the URL) and,
 * with ?open=<id>, one driver's details beside it with Approve and Block.
 */
export default async function AdminDriversPage({ searchParams }: PageProps<"/admin/drivers">) {
  const { user } = await requireAdmin();
  const params = await searchParams;
  const { adminService, docReminderService } = await getContainer();
  const [page, bulkReminder] = await Promise.all([
    adminService.getDriversPage(user.id, params),
    docReminderService.preview(user.id, {}),
  ]);

  let detail: AdminDriverDetail | null = null;
  if (page.query.open) {
    try {
      detail = await adminService.getDriver(user.id, { driverId: page.query.open });
    } catch (error) {
      // A stale link to a deleted driver shows the list, not an error page.
      if (!(error instanceof AppError && error.code === "NOT_FOUND")) throw error;
    }
  }
  // The sheet's documents reminder: for a Registered driver missing a required document.
  let reminder: DocReminderPreview | null = null;
  if (detail && detail.profile.status === "pending" && detail.missing.some((item) => (REQUIRED_DOCUMENTS as readonly string[]).includes(item))) {
    reminder = await docReminderService.preview(user.id, { driverId: detail.driver.id });
  }
  const closeHref = driversHref({ ...driversFilters(page.query), page: page.page });

  return (
    <AdminPage
      title="Drivers"
      subtitle="Everyone who signed up, newest first. Approve a driver to list them to subscribed carriers; block one to hide them and sign them out."
      actions={<DocReminderButton initial={bulkReminder} />}
    >
      <DriverTiles tiles={page.tiles} />
      <DriversTable page={page} />
      <DriverDetailSheet detail={detail} closeHref={closeHref} docReminder={reminder} />
    </AdminPage>
  );
}
