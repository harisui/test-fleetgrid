import type { MetadataRoute } from "next";
import { SEO_PAGES } from "@/content/seo";
import { siteUrl } from "@/lib/seo";

/** When the marketing pages last changed in substance. Bump it with the copy. */
export const MARKETING_LAST_MODIFIED = "2026-11-01";
/** LEGAL_EFFECTIVE_DATE (src/lib/constants.ts) as a date: the Terms and Privacy took effect then. */
export const LEGAL_EFFECTIVE_DATE_ISO = "2026-10-29";
/** SMS_TERMS_EFFECTIVE_DATE as a date. */
export const SMS_TERMS_EFFECTIVE_DATE_ISO = "2026-11-01";

/**
 * The public marketing and legal pages only. Sign-in, onboarding, the driver and carrier
 * areas, admin and the API are left out on purpose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return SEO_PAGES.map((page) => ({
    url: siteUrl(page.path),
    lastModified:
      page.path === "/sms-terms"
        ? SMS_TERMS_EFFECTIVE_DATE_ISO
        : ["/terms", "/privacy"].includes(page.path)
          ? LEGAL_EFFECTIVE_DATE_ISO
          : MARKETING_LAST_MODIFIED,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
