import { ChevronLeft, ChevronRight, Loader2, MessageSquareOff, Users } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatMiles,
  NO_SHIFT_TEXTS_LABEL,
  receivesShiftTexts,
  summarizeDriver,
} from "@/lib/carrier/driverSummary";
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

const HEADINGS = [
  "Driver",
  "Distance",
  "Class",
  "Experience",
  "Endorsements",
  "Equipment",
  "Cards",
  "Record",
  "Texts",
] as const;

/** The mark on a driver a broadcast would not reach. Shown by the icon and the words, not a colour. */
function NoTextsBadge() {
  return (
    <Badge variant="warning" data-slot="no-shift-texts">
      <MessageSquareOff aria-hidden="true" />
      {NO_SHIFT_TEXTS_LABEL}
    </Badge>
  );
}

/** Stands in for the results while a search loads: a spinner with the words, and placeholder rows. */
export function DriverResultsLoading() {
  return (
    <div className="flex flex-col gap-4" data-slot="results-loading">
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 text-helper leading-helper text-muted-foreground"
      >
        <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        Finding drivers...
      </p>
      <div aria-hidden="true" className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * The results: cards on a phone, a table from the md breakpoint up. Every row opens the
 * driver's page. The phone number is never here; FleetGrid sends the texts. A driver who
 * declined shift texts, or replied STOP, is listed with the "No shift texts" mark.
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
              {!receivesShiftTexts(match.driver) && (
                <span className="flex">
                  <NoTextsBadge />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-card border border-border bg-card md:block">
        <table className="w-full text-helper leading-helper">
          <thead className="border-b border-border text-left text-small leading-small text-muted-foreground">
            <tr>
              {HEADINGS.map((heading) => (
                <th key={heading} scope="col" className="px-3 py-3 font-semibold whitespace-nowrap">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border align-top">
            {rows.map(({ match, summary }) => (
              <tr key={match.driver.id} className="hover:bg-muted">
                <th scope="row" className="px-3 py-3 text-left font-semibold whitespace-nowrap">
                  <Link href={driverPath(match.driver.id)} className="underline underline-offset-4">
                    {match.driver.fullName}
                  </Link>
                </th>
                <td className="px-3 py-3 whitespace-nowrap">{formatMiles(match.distanceMiles)}</td>
                <td className="px-3 py-3 whitespace-nowrap">{summary.cdlClass}</td>
                <td className="px-3 py-3 whitespace-nowrap">{summary.experience}</td>
                <td className="px-3 py-3">{summary.endorsements}</td>
                <td className="px-3 py-3">{summary.equipment}</td>
                <td className="px-3 py-3">
                  {summary.cardLines.map((line, index) => (
                    <span key={index} className="block whitespace-nowrap first-letter:uppercase">
                      {line}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-3">{summary.record}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {receivesShiftTexts(match.driver) ? "Shift texts on" : <NoTextsBadge />}
                </td>
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
