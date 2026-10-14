import type { Metadata } from "next";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { DriverReviewTable } from "@/components/admin/DriverReviewTable";
import { AppShell } from "@/components/layout/AppShell";
import { REVIEW_FILTERS } from "@/lib/admin/options";
import { requireRole } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Driver review" };

/**
 * Driver review, the first piece of the admin panel (pulled forward from Milestone 3 so
 * carriers have approved drivers to find). Carriers, subscriptions and shifts follow there.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { user } = await requireRole("admin");
  const params = await searchParams;
  const requested = typeof params.status === "string" ? params.status : "pending";
  const filter = REVIEW_FILTERS.find((option) => option.value === requested)?.value ?? "pending";
  const { adminService } = await getContainer();
  const drivers = await adminService.listDrivers(user.id, {
    status: filter === "all" ? undefined : filter,
  });

  return (
    <AppShell headerActions={<LogoutButton />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-h1 leading-h1 font-semibold">Driver review</h1>
          <p className="text-helper leading-helper text-muted-foreground">
            Approve a driver to list them to subscribed carriers. Block one to hide them and
            sign them out. Carriers, subscriptions and shifts arrive with the next release.
          </p>
        </div>
        <DriverReviewTable drivers={drivers} filter={filter} />
      </div>
    </AppShell>
  );
}
