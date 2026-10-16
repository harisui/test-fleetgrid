import type { Metadata } from "next";
import type { FaqGroup } from "@/content/faq";
import { seoPage, type SeoPath } from "@/content/seo";
import { getSiteEnv } from "@/lib/env";
import { BUSINESS_NAME, getSupportContact } from "@/lib/support";

/**
 * Page metadata and structured data for the public site. Everything reads the one page
 * table in src/content/seo.ts, so a title, a canonical and a breadcrumb never disagree.
 */

export const SITE_NAME = "FleetGrid";

/** Pasadena, TX: the centre of the service the carriers page describes. */
export const SERVICE_AREA_CENTER = { latitude: 29.6911, longitude: -95.2091 };
/** 50 miles, in meters, as schema.org wants a GeoCircle radius. */
export const SERVICE_AREA_RADIUS_METERS = 80467;

export function siteUrl(path = "/"): string {
  return new URL(path, getSiteEnv().NEXT_PUBLIC_SITE_URL).toString();
}

/**
 * The metadata for one public page: title, description, canonical, and the Open Graph and
 * Twitter cards. The share image itself comes from the route's opengraph-image file, which
 * Next adds to both cards.
 */
export function pageMetadata(path: SeoPath): Metadata {
  const page = seoPage(path);
  const title = path === "/" ? { absolute: page.title } : page.title;
  const fullTitle = path === "/" ? page.title : `${page.title} | ${SITE_NAME}`;
  return {
    title,
    description: page.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      url: path,
      title: fullTitle,
      description: page.description,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: page.description,
    },
  };
}

type JsonLdObject = { "@context"?: string; "@type": string } & Record<string, unknown>;

export function organizationJsonLd(): JsonLdObject {
  const contact = getSupportContact();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": siteUrl("/#organization"),
    name: SITE_NAME,
    legalName: BUSINESS_NAME,
    url: siteUrl("/"),
    logo: siteUrl("/brand/fleetgrid-logo-light.svg"),
    email: contact.email,
    areaServed: "Houston, TX",
  };
}

export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": siteUrl("/#website"),
    name: SITE_NAME,
    url: siteUrl("/"),
    publisher: { "@id": siteUrl("/#organization") },
    inLanguage: "en-US",
  };
}

/** The carrier subscription, on /carriers. */
export function carrierServiceJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "FleetGrid for carriers",
    serviceType: "Transport operator directory and shift messaging",
    provider: { "@id": siteUrl("/#organization") },
    url: siteUrl("/carriers"),
    areaServed: {
      "@type": "GeoCircle",
      geoMidpoint: { "@type": "GeoCoordinates", ...SERVICE_AREA_CENTER },
      geoRadius: SERVICE_AREA_RADIUS_METERS,
    },
    offers: {
      "@type": "Offer",
      price: 399,
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: 399,
        priceCurrency: "USD",
        unitText: "monthly",
      },
    },
  };
}

/** Home, then the page. */
export function breadcrumbJsonLd(path: SeoPath): JsonLdObject {
  const trail = path === "/" ? [seoPage("/")] : [seoPage("/"), seoPage(path)];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((page, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: page.name,
      item: siteUrl(page.path),
    })),
  };
}

/**
 * Every question on /faq, word for word as the page shows it. Google stopped showing FAQ
 * rich results on May 7, 2026; the markup stays because it describes the page accurately.
 */
export function faqPageJsonLd(groups: readonly FaqGroup[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.entries.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    ),
  };
}

/** JSON for a script tag: "<" becomes < so no string can close the tag. */
export function serializeJsonLd(data: JsonLdObject | readonly JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
