import type { Metadata } from "next";
import { Suspense } from "react";
import { DriverResults, DriverResultsLoading } from "@/components/carrier/DriverResults";
import { SearchFilters } from "@/components/carrier/SearchFilters";
import { InlineNote } from "@/components/shared/InlineNote";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { driverSearchSchema, type DriverSearchInput } from "@/lib/validation/carrier.schema";
import { getContainer } from "@/server/container";
import { AppError, parseInput } from "@/server/errors/AppError";

export const metadata: Metadata = { title: "Find drivers" };

type Params = Record<string, string | string[] | undefined>;

/** The query as a URLSearchParams, for the page links. */
function toQuery(params: Params): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of [value].flat()) if (item !== undefined) query.append(key, item);
  }
  return query;
}

/** The results for one query. Streams in under the filters, which stay on screen meanwhile. */
async function SearchResults({ userId, input, query }: { userId: string; input: Params; query: URLSearchParams }) {
  const { driverSearchService } = await getContainer();
  const page = await driverSearchService.search(userId, input);
  return <DriverResults page={page} query={query} />;
}

/**
 * Driver search for a subscribed carrier. The filters live in the URL, so a reload or a
 * shared link shows the same search; submitting them is a client-side navigation (no page
 * reload) and only the results show a loading state while the new ones arrive.
 */
export default async function CarrierSearchPage({ searchParams }: PageProps<"/carrier/search">) {
  const { user, access } = await requireActiveSubscription();
  const params = await searchParams;

  let error: string | undefined;
  let filters: DriverSearchInput;
  try {
    filters = parseInput(driverSearchSchema, params);
  } catch (caught) {
    if (!(caught instanceof AppError) || caught.code !== "VALIDATION") throw caught;
    error = Object.values(caught.fieldErrors ?? {})[0] ?? caught.message;
    filters = driverSearchSchema.parse({});
  }
  const query = error ? new URLSearchParams() : toQuery(params);
  // A new query is a new key: the form starts from it (Clear filters resets every field) and
  // the results boundary shows its loading state instead of the previous drivers.
  const key = query.toString();
  const carrier = access.carrier!;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-h1 leading-h1 font-semibold">Find drivers</h1>
        <p className="text-helper leading-helper text-muted-foreground">
          Listed drivers near your yard at {carrier.city}, {carrier.state} {carrier.zip}, nearest
          first. Every driver here is approved, has a complete card and takes shift offers by text.
        </p>
      </div>
      {error && (
        <InlineNote variant="error" role="alert">
          {error} Showing the default search instead.
        </InlineNote>
      )}
      {/* Filters above the results, so the table has the page's whole width. */}
      <SearchFilters key={`filters-${key}`} filters={filters} />
      <Suspense key={`results-${key}`} fallback={<DriverResultsLoading />}>
        <SearchResults userId={user.id} input={error ? {} : params} query={query} />
      </Suspense>
    </div>
  );
}
