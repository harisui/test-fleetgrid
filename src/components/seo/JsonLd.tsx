import { serializeJsonLd } from "@/lib/seo";

type JsonLdData = Parameters<typeof serializeJsonLd>[0];

/** Structured data for search engines, server-rendered. Never shown, never interactive. */
export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      data-slot="json-ld"
      // Safe: serializeJsonLd escapes "<", and the data is our own constants.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
