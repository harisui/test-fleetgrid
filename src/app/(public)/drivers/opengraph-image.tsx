import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderOgImage } from "@/lib/og/image";

/** The share image for /drivers (src/lib/og/image.tsx). */
export const alt = ogAlt("/drivers");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage("/drivers");
}
