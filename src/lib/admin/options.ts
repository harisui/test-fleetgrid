import type { AdminDriversQuery } from "@/lib/validation/admin.schema";
import type { AccountStatus } from "@/types/domain";

/** Words and links of the admin's Drivers page. */

export const ADMIN_DRIVERS_PATH = "/admin/drivers";

export const REVIEW_STATUS_OPTIONS = [
  { value: "", label: "Any review status" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "blocked", label: "Blocked" },
] as const;

export const COMPLETE_OPTIONS = [
  { value: "", label: "Any profile" },
  { value: "complete", label: "Complete" },
  { value: "incomplete", label: "Incomplete" },
] as const;

export const AREA_OPTIONS = [
  { value: "", label: "Any area" },
  { value: "in", label: "In the service area" },
  { value: "out", label: "Outside the service area" },
] as const;

/** Why Approve is off for a card that is not finished. */
export const APPROVE_INCOMPLETE_REASON =
  "This driver has not finished their card, so they cannot be approved yet.";

/** The toast after each action. */
export const STATUS_DONE: Record<AccountStatus, string> = {
  approved: "Approved. Subscribed carriers can find this driver now.",
  blocked: "Blocked. The driver is signed out and hidden from carriers.",
  pending: "Back in the review queue.",
};

/** What the detail sheet says before each action, with the driver's name filled in. */
export const CONFIRMATIONS: Record<
  AccountStatus,
  { title: (name: string) => string; description: (name: string) => string; label: string; pending: string }
> = {
  approved: {
    title: (name) => `Approve ${name}?`,
    description: (name) => `Subscribed carriers can find ${name} from now on.`,
    label: "Approve",
    pending: "Approving...",
  },
  blocked: {
    title: (name) => `Block ${name}?`,
    description: (name) => `${name} will be signed out and hidden from carriers.`,
    label: "Block",
    pending: "Blocking...",
  },
  pending: {
    title: (name) => `Put ${name} back in review?`,
    description: (name) => `${name} leaves carrier search until approved again.`,
    label: "Set pending",
    pending: "Saving...",
  },
};

/** The source column until sign-up source tracking lands (part 4). */
export const SOURCE_UNKNOWN = "Direct or unknown";

const QUERY_DEFAULTS: Partial<Record<keyof AdminDriversQuery, string>> = {
  status: "",
  complete: "",
  area: "",
  q: "",
  sort: "created",
  dir: "desc",
  page: "1",
};

/** The Drivers page for a query, leaving out every parameter at its default. */
export function driversHref(query: Partial<Record<keyof AdminDriversQuery, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const key of ["q", "status", "complete", "area", "sort", "dir", "page", "open"] as const) {
    const value = query[key];
    if (value === undefined || value === "" || String(value) === QUERY_DEFAULTS[key]) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${ADMIN_DRIVERS_PATH}?${search}` : ADMIN_DRIVERS_PATH;
}
