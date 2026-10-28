import type { AccountStatus } from "@/types/domain";

/** The driver review filters, in the order the page shows them. Pending is the default. */
export const REVIEW_FILTERS: { value: AccountStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" },
  { value: "all", label: "All drivers" },
];

export type ReviewFilter = (typeof REVIEW_FILTERS)[number]["value"];

/** The page for a filter: pending is the plain Drivers page. */
export function reviewFilterHref(filter: ReviewFilter): string {
  return filter === "pending" ? "/admin/drivers" : `/admin/drivers?status=${filter}`;
}
