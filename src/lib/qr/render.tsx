import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { ogTokens } from "@/lib/og/tokens";

/**
 * The printable QR code for one flyer: the code itself from the qrcode package (no outside
 * service), the location name printed under it in Barlow Condensed, and the short link in
 * small type so a person can type it. SVG for the print shop, PNG for everyone else.
 */

export const QR_PNG_SIZE = { width: 1500, height: 1800 } as const;
export const QR_SVG_SIZE = { width: 1000, height: 1200 } as const;

const FONT_DIR = join(process.cwd(), "src/lib/og/fonts");

interface QrArtwork {
  /** What the code encodes: the short link. */
  url: string;
  /** Printed under the code. */
  label: string;
  /** Printed small under the label, for people who would rather type it. */
  caption: string;
}

let fonts: { semibold: Buffer; bold: Buffer } | undefined;

function loadFonts() {
  fonts ??= {
    semibold: readFileSync(join(FONT_DIR, "BarlowCondensed-SemiBold.ttf")),
    bold: readFileSync(join(FONT_DIR, "BarlowCondensed-Bold.ttf")),
  };
  return fonts;
}

/** The code alone as an SVG document, ink on paper (the print tokens in themes.css), with a quiet zone. */
export async function qrSvgDocument(url: string): Promise<string> {
  const color = ogTokens();
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 800,
    color: { dark: color["print-ink"], light: color["print-paper"] },
  });
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

/**
 * The print-ready SVG: the code at 800 of 1000 wide, the label and the caption under it.
 * The text uses the condensed face when the print shop has it and a plain sans otherwise.
 */
export async function renderQrSvg({ url, label, caption }: QrArtwork): Promise<string> {
  const color = ogTokens();
  const code = await qrSvgDocument(url);
  // Keep the code's own document, nested, so its viewBox scales it into our page. Its own
  // width and height go, or the tag would carry each attribute twice and no longer parse.
  const inner = code
    .replace(/^<\?xml[^>]*>\s*/, "")
    .replace(/^(<svg[^>]*?)\s+width="[^"]*"/, "$1")
    .replace(/^(<svg[^>]*?)\s+height="[^"]*"/, "$1")
    .replace("<svg ", `<svg x="100" y="80" width="800" height="800" `);
  const { width, height } = QR_SVG_SIZE;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${color["print-paper"]}"/>`,
    inner,
    `<text x="${width / 2}" y="990" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="700" font-size="72" fill="${color["print-ink"]}">${escapeXml(label)}</text>`,
    `<text x="${width / 2}" y="1070" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, Arial, sans-serif" font-weight="600" font-size="40" fill="${color["print-ink"]}">${escapeXml(caption)}</text>`,
    `</svg>`,
  ].join("\n");
}

/** The print-ready PNG, 1500 by 1800 (5 by 6 inches at 300 dpi), rendered with the repo's fonts. */
export async function renderQrPng({ url, label, caption }: QrArtwork): Promise<ImageResponse> {
  const { semibold, bold } = loadFonts();
  const color = ogTokens();
  const code = await qrSvgDocument(url);
  const codeSrc = `data:image/svg+xml;base64,${Buffer.from(code).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          background: color["print-paper"],
          color: color["print-ink"],
          fontFamily: "Barlow Condensed",
        }}
      >
        <div style={{ display: "flex", height: 24, width: "100%", background: color["sign-panel-border"] }} />
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain img only */}
        <img src={codeSrc} width={1200} height={1200} alt="" style={{ marginTop: 96 }} />
        <div style={{ display: "flex", marginTop: 48, fontSize: 112, fontWeight: 700, lineHeight: 1.05, textAlign: "center", padding: "0 80px" }}>
          {label}
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 56, fontWeight: 600, color: color["sign-panel-muted"] }}>
          {caption}
        </div>
      </div>
    ),
    {
      ...QR_PNG_SIZE,
      fonts: [
        { name: "Barlow Condensed", data: semibold, weight: 600, style: "normal" },
        { name: "Barlow Condensed", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
