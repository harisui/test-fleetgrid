import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { EmptyState } from "@/components/shared/EmptyState";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Analytics" };

/** Sign-up sources and QR codes arrive with the next part; the page and its place in the nav exist now. */
export default async function AdminAnalyticsPage() {
  await requireAdmin();
  return (
    <AdminPage title="Analytics" subtitle="Where drivers come from, and the QR codes on the flyers.">
      <EmptyState
        icon={ChartNoAxesColumn}
        title="Nothing to show yet."
        description="Sign-up sources and QR codes arrive with the next release."
      />
    </AdminPage>
  );
}
