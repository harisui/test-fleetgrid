import { z } from "zod";
import { SEO_PAGES, type SeoPath } from "@/content/seo";
import { isValidSlug, slugify } from "@/lib/qr/slug";

/** The QR codes and the Analytics page. */

export const LOCATION_NAME_MESSAGE = "Enter where the flyer hangs, for example Love's, Hwy 225";
export const CAMPAIGN_MESSAGE = "A campaign is lowercase letters, digits and dashes";
export const SLUG_MESSAGE = "A short link is 2 to 60 lowercase letters, digits and dashes";
export const SLUG_TAKEN_MESSAGE = "That short link is already used. Change the slug.";

export const DEFAULT_CAMPAIGN = "pasadena-225";

/** The public pages a code can land on. */
export const LANDING_PATHS = SEO_PAGES.filter((page) =>
  ["/", "/drivers", "/carriers", "/faq", "/contact"].includes(page.path),
).map((page) => ({ value: page.path, label: `${page.name} (${page.path})` }));

const landingPaths = LANDING_PATHS.map((option) => option.value) as [SeoPath, ...SeoPath[]];

export const createQrLinkSchema = z.object({
  locationName: z
    .string({ error: LOCATION_NAME_MESSAGE })
    .trim()
    .min(2, LOCATION_NAME_MESSAGE)
    .max(80, "The location name must be 80 characters or fewer"),
  campaign: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? DEFAULT_CAMPAIGN : value),
    z
      .string({ error: CAMPAIGN_MESSAGE })
      .trim()
      .toLowerCase()
      .refine(isValidSlug, CAMPAIGN_MESSAGE),
  ),
  targetPath: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? "/" : value),
    z.enum(landingPaths, { error: "Pick one of the public pages" }),
  ),
  /** Blank: made from the location name. */
  slug: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : ""),
    z.string().refine((value) => value === "" || isValidSlug(value), SLUG_MESSAGE),
  ),
});

/** The slug a form would get: the typed one, or the location name made into one. */
export function slugFor(input: { slug: string; locationName: string }): string {
  return input.slug || slugify(input.locationName);
}

export const qrLinkIdSchema = z.object({
  qrLinkId: z.uuid({ error: "QR code not found" }),
});

export const setQrLinkActiveSchema = z.object({
  qrLinkId: z.uuid({ error: "QR code not found" }),
  isActive: z.boolean({ error: "On or off" }),
});

export const PERIODS = ["7", "30", "all"] as const;
export type Period = (typeof PERIODS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const analyticsQuerySchema = z.object({
  period: z.preprocess(
    (value) => (typeof value === "string" && (PERIODS as readonly string[]).includes(value) ? value : "30"),
    z.enum(PERIODS),
  ),
  /** The QR code whose details are open beside the list. */
  open: z.preprocess((value) => (typeof value === "string" && UUID.test(value) ? value : undefined), z.string().optional()),
});

export type CreateQrLinkInput = z.infer<typeof createQrLinkSchema>;
export type CreateQrLinkFormValues = z.input<typeof createQrLinkSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
