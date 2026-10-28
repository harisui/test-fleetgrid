import { HEARD_FROM_LABELS, type Driver, type QrLink, type SignupSource } from "@/types/domain";

/**
 * How a driver found FleetGrid, as the admin's Drivers page shows it (Milestone 3, part 4).
 * The kinds match the Analytics page: a sign-up counts under its QR code, else its campaign,
 * else "Direct or unknown". What the driver said on the last page is kept apart, since it
 * is their word and may differ from the link they came by.
 */

export type DriverSourceKind = "qr" | "campaign" | "direct";

export interface DriverSource {
  kind: DriverSourceKind;
  /** "QR: Love's, Hwy 225", "Campaign: fb-october" or "Direct or unknown". */
  label: string;
  /** The code the driver scanned, when known. */
  qrLinkId: string | null;
}

/** The source column until a tag or a code says otherwise. */
export const SOURCE_UNKNOWN = "Direct or unknown";

export function describeSource(source: SignupSource, link: Pick<QrLink, "locationName"> | null): DriverSource {
  if (source.qrLinkId && link) {
    return { kind: "qr", label: `QR: ${link.locationName}`, qrLinkId: source.qrLinkId };
  }
  if (source.utmCampaign) {
    return { kind: "campaign", label: `Campaign: ${source.utmCampaign}`, qrLinkId: null };
  }
  return { kind: "direct", label: SOURCE_UNKNOWN, qrLinkId: null };
}

/** What the driver answered to "How did you hear about FleetGrid?", or null when they skipped it. */
export function heardFromLabel(driver: Pick<Driver, "heardFrom" | "heardFromOther">): string | null {
  if (!driver.heardFrom) return null;
  const label = HEARD_FROM_LABELS[driver.heardFrom];
  return driver.heardFrom === "other" && driver.heardFromOther ? `${label}: ${driver.heardFromOther}` : label;
}

/** The tags of a visit as one line, "flyer / qr / loves-hwy-225", or null without any. */
export function tagsLabel(source: SignupSource): string | null {
  const tags = [source.utmSource, source.utmMedium, source.utmContent].filter((tag): tag is string => Boolean(tag));
  return tags.length > 0 ? tags.join(" / ") : null;
}

/** The site a visitor came from, by host, or null for a direct visit. */
export function referrerLabel(source: SignupSource): string | null {
  if (!source.referrer) return null;
  try {
    return new URL(source.referrer).host;
  } catch {
    return source.referrer;
  }
}
