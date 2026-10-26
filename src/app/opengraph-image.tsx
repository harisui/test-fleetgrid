import { OG_CONTENT_TYPE, OG_SIZE, ogAlt, renderOgImage } from "@/lib/og/image";

/** The default share image for every page without its own: the signed-in pages (src/lib/og/image.tsx). */
export const alt = ogAlt("/");
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage("/");
}
