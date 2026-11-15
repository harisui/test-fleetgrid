import type { Metadata } from "next";
import Link from "next/link";
import { AdminPage } from "@/components/admin/AdminPage";
import { StatTile, StatTileGrid } from "@/components/admin/StatTile";
import { TermsAwaitingTable } from "@/components/admin/TermsAwaitingTable";
import { TermsLinkButton } from "@/components/admin/TermsLinkButton";
import { InlineNote } from "@/components/shared/InlineNote";
import { requireAdmin } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";

export const metadata: Metadata = { title: "Terms" };

/**
 * The Terms of Service (Milestone 6): the current version, and when a version needs everyone
 * again, the drivers who have not accepted it, with the one-time link to text them.
 */
export default async function AdminTermsPage() {
  const { user } = await requireAdmin();
  const { termsService } = await getContainer();
  const overview = await termsService.overview(user.id);

  return (
    <AdminPage
      title="Terms"
      subtitle="Every published version is archived word for word. New drivers accept the current Terms when they sign up."
    >
      <StatTileGrid label="Terms acceptance">
        <StatTile label="Current version" value={overview.current.version} caption={`Effective ${overview.current.effectiveLabel}`} />
        <StatTile
          label="Waiting to accept"
          value={overview.awaiting.length.toLocaleString("en-US")}
          caption="Shift offers paused until they accept"
        />
        <StatTile label="Can be texted" value={overview.textable.toLocaleString("en-US")} caption="Shift texts on, no STOP" />
      </StatTileGrid>

      {overview.requiredVersion === null ? (
        <InlineNote variant="info">
          No version needs drivers to accept it again. When the revised Terms are published, drivers who have not
          accepted them are listed here, their shift offers pause, and they see the{" "}
          <Link href="/terms" className="font-semibold underline underline-offset-4" target="_blank" rel="noopener">
            Terms
          </Link>{" "}
          when they sign in.
        </InlineNote>
      ) : (
        <section aria-labelledby="waiting" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="waiting" className="font-heading text-h2 leading-h2 font-semibold">
              Waiting to accept {overview.requiredVersion}
            </h2>
            <TermsLinkButton count={overview.textable} />
          </div>
          <TermsAwaitingTable rows={overview.awaiting} />
        </section>
      )}
    </AdminPage>
  );
}
