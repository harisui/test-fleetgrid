import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/**
 * Everything public may be crawled. The signed-in areas, the sign-in steps past the first
 * page and the API may not. Login itself stays crawlable: it is where "Sign up to drive"
 * lands.
 */
export const DISALLOWED_PATHS = [
  "/admin",
  "/api/",
  "/driver/",
  "/carrier/",
  "/verify",
  "/choose-role",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...DISALLOWED_PATHS] },
    sitemap: siteUrl("/sitemap.xml"),
    host: new URL(siteUrl("/")).host,
  };
}
