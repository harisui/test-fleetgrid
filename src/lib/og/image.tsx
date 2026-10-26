import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_FOOTER, seoPage, type SeoPath } from "@/content/seo";
import { ogTokens } from "@/lib/og/tokens";

/**
 * The share image for one public page, 1200 by 630, in the Workshop style: a graphite sign
 * panel with the orange stripe on top, the logo, an uppercase eyebrow and the headline in
 * Barlow Condensed, and at the foot a lane line with a truck and "fleetgridus.com · Houston
 * area". Fonts and the logo are read from the repo, never the network. Colours come from
 * themes.css through ogTokens().
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const FONT_DIR = join(process.cwd(), "src/lib/og/fonts");

function loadAssets() {
  return {
    semibold: readFileSync(join(FONT_DIR, "BarlowCondensed-SemiBold.ttf")),
    bold: readFileSync(join(FONT_DIR, "BarlowCondensed-Bold.ttf")),
    logo: `data:image/svg+xml;base64,${readFileSync(join(process.cwd(), "public/brand/fleetgrid-logo-dark.svg")).toString("base64")}`,
  };
}

let assets: ReturnType<typeof loadAssets> | undefined;

/** The alt text Next puts beside the image: the headline, said plainly. */
export function ogAlt(path: SeoPath): string {
  return `FleetGrid: ${seoPage(path).og.headline}`;
}

export function renderOgImage(path: SeoPath): ImageResponse {
  assets ??= loadAssets();
  const color = ogTokens();
  const { eyebrow, headline } = seoPage(path).og;
  const dashes = Array.from({ length: 22 }, (_, index) => index);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: color["sign-panel"],
          color: color["sign-panel-foreground"],
          fontFamily: "Barlow Condensed",
        }}
      >
        <div style={{ display: "flex", height: 14, background: color["sign-panel-border"] }} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 72px 0" }}>
          {/* The logo, drawn from the brand file for dark surfaces. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain img only */}
          <img src={assets.logo} width={204} height={60} alt="" />
          <div
            style={{
              display: "flex",
              marginTop: 56,
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: color["sign-panel-muted"],
            }}
          >
            {eyebrow}
          </div>
          <div style={{ display: "flex", marginTop: 16, maxWidth: 1000, fontSize: 92, fontWeight: 700, lineHeight: 1.02 }}>
            {headline}
          </div>
        </div>
        {/* The lane line with a truck on it, then the address. */}
        <div style={{ display: "flex", flexDirection: "column", padding: "0 72px 48px", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", flex: 1, justifyContent: "space-between" }}>
              {dashes.map((index) => (
                <div
                  key={index}
                  style={{ display: "flex", width: 26, height: 4, borderRadius: 2, background: color["lane-line"], opacity: 0.55 }}
                />
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", width: 74, height: 30, borderRadius: 3, background: color["sign-panel-border"] }} />
              <div
                style={{
                  display: "flex",
                  width: 26,
                  height: 26,
                  marginLeft: 4,
                  borderRadius: 4,
                  background: color["sign-panel-foreground"],
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600, letterSpacing: 1, color: color["sign-panel-muted"] }}>
            {OG_FOOTER}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Barlow Condensed", data: assets.semibold, weight: 600, style: "normal" },
        { name: "Barlow Condensed", data: assets.bold, weight: 700, style: "normal" },
      ],
    },
  );
}
