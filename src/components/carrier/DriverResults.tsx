import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { formatMiles, summarizeDriver } from "@/lib/carrier/driverSummary";
import type { DriverSearchPage } from "@/server/services/DriverSearchService";

interface DriverResultsProps {
  page: DriverSearchPage;
  /** The current query string, so page links keep the filters. */
  query: URLSearchParams;
}

const driverPath = (id: string) => `/carrier/drivers/${id}`;

function pageHref(query: URLSearchParams, page: number): string {
  const next = new URLSearchParams(query);
  next.set("page", String(page));
  return `/carrier/search?${next.toString()}`;
}

/**
 * The results: cards on a phone, a table from the md breakpoint up. Every row opens the
 * driver's page. The phone number is never here; FleetGrid sends the texts.
 */
export function DriverResults({ page, query }: DriverResultsProps) {
  if (page.total === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No drivers match"
        description="Widen the distance or drop a filter. New drivers are listed as they are approved."
      />
    );
  }

  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.total, page.page * page.pageSize);
  const rows = page.matches.map((match) => ({
    match,
    summary: summarizeDriver(match.driver),
  }));

  return (
    <div className="flex flex-col gap-4" data-slot="driver-results">
      <p className="text-helper leading-helper text-muted-foreground" data-slot="result-count">
        Showing {first} to {last} of {page.total} {page.total === 1 ? "driver" : "drivers"},
        nearest first.
      </p>

      <ul className="flex flex-col gap-3 md:hidden" aria-label="Drivers">
        {rows.map(({ match, summary }) => (
          <li key={match.driver.id}>
            <Link
              href={driverPath(match.driver.id)}
              className="flex flex-col gap-2 rounded-card border border-border-strong bg-card p-4 hover:bg-muted"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-label leading-label font-semibold">{match.driver.fullName}</span>
                <span className="shrink-0 text-helper leading-helper text-muted-foreground">
                  {formatMiles(match.distanceMiles)}
                </span>
              </span>
              <span className="text-helper leading-helper text-muted-foreground">
                {summary.cdlClass}, {summary.experience}. {summary.endorsements === "None" ? "No endorsements" : `Endorsements ${summary.endorsements}`}.
              </span>
              <span className="text-helper leading-helper text-muted-foreground">
                {summary.equipment}. {summary.cards}.
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-card border border-border bg-card md:block">
        <table className="w-full text-helper leading-helper">
          <thead className="border-b border-border text-left text-small leading-small text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Driver
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Distance
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Class
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Experience
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Endorsements
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Equipment
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Cards
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Record
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ match, summary }) => (
              <tr key={match.driver.id} className="hover:bg-muted">
                <th scope="row" className="px-4 py-3 font-semibold">
                  <Link href={driverPath(match.driver.id)} className="underline underline-offset-4">
                    {match.driver.fullName}
                  </Link>
                </th>
                <td className="px-4 py-3 whitespace-nowrap">{formatMiles(match.distanceMiles)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{summary.cdlClass}</td>
                <td className="px-4 py-3 whitespace-nowrap">{summary.experience}</td>
                <td className="px-4 py-3">{summary.endorsements}</td>
                <td className="px-4 py-3">{summary.equipment}</td>
                <td className="px-4 py-3">{summary.cards}</td>
                <td className="px-4 py-3">{summary.record}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {page.pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page.page > 1 ? (
            <Button asChild variant="secondary" size="md">
              <Link href={pageHref(query, page.page - 1)} rel="prev">
                <ChevronLeft aria-hidden="true" />
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-helper leading-helper text-muted-foreground">
            Page {page.page} of {page.pageCount}
          </span>
          {page.page < page.pageCount ? (
            <Button asChild variant="secondary" size="md">
              <Link href={pageHref(query, page.page + 1)} rel="next">
                Next
                <ChevronRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
