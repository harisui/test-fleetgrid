import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { NoticeComposer } from "@/components/admin/NoticeComposer";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Send notice" };

/**
 * Send notice (change request CR-3): account notifications in fixed words. ?driver=<id>
 * (from the driver sheet) opens the security notice for that driver.
 */
export default async function SendNoticePage({ searchParams }: PageProps<"/admin/messaging/send">) {
  const { user } = await requireAdmin();
  const { noticeService } = await getContainer();
  const params = await searchParams;
  const options = await noticeService.getOptions(user.id);
  const driverId = typeof params.driver === "string" ? params.driver : null;
  const found = driverId ? await noticeService.findDriverChoice(user.id, driverId) : null;

  return (
    <AdminPage
      title="Send notice"
      subtitle="Policy changes, service problems and account security, in fixed words. No marketing, and never to drivers who replied STOP."
    >
      <NoticeComposer
        initial={options}
        initialDriver={found ? { driverId: found.driverId, fullName: found.fullName, phoneLast4: found.phone.slice(-4) } : null}
      />
    </AdminPage>
  );
}
