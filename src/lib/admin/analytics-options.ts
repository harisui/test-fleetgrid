import type { Period } from "@/lib/validation/qr.schema";

/** Words and links of the admin's Analytics page. */

export const ADMIN_ANALYTICS_PATH = "/admin/analytics";

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

/** The Analytics page for a period and, optionally, an open QR code. */
export function analyticsHref(query: { period?: Period; open?: string }): string {
  const params = new URLSearchParams();
  if (query.period && query.period !== "30") params.set("period", query.period);
  if (query.open) params.set("open", query.open);
  const search = params.toString();
  return search ? `${ADMIN_ANALYTICS_PATH}?${search}` : ADMIN_ANALYTICS_PATH;
}

/** The download links for one code. */
export function qrDownloadHref(qrLinkId: string, format: "png" | "svg"): string {
  return `/api/admin/qr/${qrLinkId}/${format}`;
}

export const QR_DONE = {
  created: "QR code made. Download it and print it with the location name under the code.",
  activated: "The code is on again. Scans count and land on the tagged page.",
  deactivated: "The code is off. A scan now lands on the home page, untagged.",
} as const;
