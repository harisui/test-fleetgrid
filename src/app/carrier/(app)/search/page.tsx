import type { Metadata } from "next";
import { DriverResults } from "@/components/carrier/DriverResults";
import { SearchFilters } from "@/components/carrier/SearchFilters";
import { InlineNote } from "@/components/shared/InlineNote";
import { requireActiveSubscription } from "@/lib/auth/guards";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors/AppError";

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

/** Driver search for a subscribed carrier: filters in the URL, results from the yard outwards. */
export default async function CarrierSearchPage({ searchParams }: PageProps<"/carrier/search">) {
  const { user, access } = await requireActiveSubscription();
  const params = await searchParams;
  const { driverSearchService } = await getContainer();

  let error: string | undefined;
  let page;
  try {
    page = await driverSearchService.search(user.id, params);
  } catch (caught) {
    if (!(caught instanceof AppError) || caught.code !== "VALIDATION") throw caught;
    error = Object.values(caught.fieldErrors ?? {})[0] ?? caught.message;
    page = await driverSearchService.search(user.id, {});
  }
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <SearchFilters filters={page.filters} />
        <DriverResults page={page} query={error ? new URLSearchParams() : toQuery(params)} />
      </div>
    </div>
  );
}
