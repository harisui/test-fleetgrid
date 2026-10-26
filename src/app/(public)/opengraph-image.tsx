import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderOgImage } from "@/lib/og/image";

/** The share image for the home page (src/lib/og/image.tsx). It sits in the page's own segment: the page sets its Open Graph block, which would hide the root file. */
export const alt = ogAlt("/");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage("/");
}
