import type { QrLink } from "@/types/domain";

/** The path of a short link: what the printed code encodes. */
export const SHORT_LINK_PREFIX = "/q/";

export function shortLinkPath(slug: string): string {
  return `${SHORT_LINK_PREFIX}${slug}`;
}

/** The full short link, for the code and the copy button. */
export function shortLinkUrl(siteUrl: string, slug: string): string {
  return new URL(shortLinkPath(slug), siteUrl).toString();
}

/**
 * Where a scan lands: the link's page with the four UTM tags, utm_content being the slug so
 * the sign-up can be tied back to this code. Relative, so the host is whatever served /q/.
 */
export function redirectPathFor(link: Pick<QrLink, "slug" | "targetPath" | "utmSource" | "utmMedium" | "campaign">): string {
  const params = new URLSearchParams({
    utm_source: link.utmSource,
    utm_medium: link.utmMedium,
    utm_campaign: link.campaign,
    utm_content: link.slug,
  });
  return `${link.targetPath}?${params.toString()}`;
}

/** Where an unknown or inactive code lands: the home page, untagged. */
export const UNTAGGED_FALLBACK = "/";
