import { ShieldBan } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * The 403 page: a signed-in driver or carrier who opens the admin area. Rendered by Next.js
 * with that status when a guard calls forbidden() (next.config.ts, authInterrupts).
 */
export default function ForbiddenPage() {
  return (
    <AppShell width="narrow" showFooter={false}>
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">403</h1>
        <EmptyState
          icon={ShieldBan}
          title="Only FleetGrid staff can open this page."
          description="Your account does not have access here. If you think it should, contact support."
          action={
            <Button asChild size="md" variant="secondary">
              <Link href="/">Back to FleetGrid</Link>
            </Button>
          }
        />
      </div>
    </AppShell>
  );
}
