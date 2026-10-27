import Script from "next/script";
import { googleAdsSnippet } from "@/lib/analytics";

/**
 * Google's tag (gtag.js) for the Ads account, loaded after the page is interactive so it
 * never delays the first paint. Rendered by the root layout only where `googleAdsId` says so.
 */
export function GoogleAds({ id }: { id: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-tag" strategy="afterInteractive">
        {googleAdsSnippet(id)}
      </Script>
    </>
  );
}
