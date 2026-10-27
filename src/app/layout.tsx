import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { GoogleAds } from "@/components/seo/GoogleAds";
import { JsonLd } from "@/components/seo/JsonLd";
import { googleAdsId } from "@/lib/analytics";
import { getSiteEnv } from "@/lib/env";
import { SITE_INIT_SCRIPT } from "@/lib/motion";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// All three are SIL Open Font License and self-hosted at build time by next/font.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // Only the shift codes and SMS replies use it: not worth a high-priority download on every page.
  preload: false,
});

// Headings, eyebrows and numbers. Condensed like US highway signage.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteEnv().NEXT_PUBLIC_SITE_URL),
  title: {
    default: "FleetGrid",
    template: "%s | FleetGrid",
  },
  description:
    "FleetGrid connects Houston-area carriers with approved local Class A and B CDL drivers and fills open shifts by text.",
  applicationName: "FleetGrid",
  openGraph: { type: "website", siteName: "FleetGrid", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // The Google Ads tag, on the production deployment only (src/lib/analytics.ts).
  const adsId = googleAdsId({
    NEXT_PUBLIC_GOOGLE_ADS_ID: getSiteEnv().NEXT_PUBLIC_GOOGLE_ADS_ID,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved dark mode choice before first paint (no flash, pages stay static). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Marks the page for section reveals (not under reduced motion) and hides a dismissed launch strip. */}
        <script dangerouslySetInnerHTML={{ __html: SITE_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* Who runs the site and what the site is, on every page. */}
        <JsonLd data={[organizationJsonLd(), websiteJsonLd()]} />
        {adsId && <GoogleAds id={adsId} />}
        {children}
      </body>
    </html>
  );
}
