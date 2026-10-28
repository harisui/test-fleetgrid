import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { DriverReviewTable } from "@/components/admin/DriverReviewTable";
import { REVIEW_FILTERS } from "@/lib/admin/options";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Drivers" };

/**
 * Driver review (pulled forward from Milestone 3 so carriers have approved drivers to find),
 * now the admin's first page. The tiles, the full table and the detail sheet follow.
 */
export default async function AdminDriversPage({ searchParams }: PageProps<"/admin/drivers">) {
  const { user } = await requireAdmin();
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status : "pending";
  const filter = REVIEW_FILTERS.find((option) => option.value === requested)?.value ?? "pending";
  const { adminService } = await getContainer();
  const drivers = await adminService.listDrivers(user.id, {
    status: filter === "all" ? undefined : filter,
  });

  return (
    <AdminPage
      title="Drivers"
      subtitle="Approve a driver to list them to subscribed carriers. Block one to hide them and sign them out."
    >
      <DriverReviewTable drivers={drivers} filter={filter} />
    </AdminPage>
  );
}
