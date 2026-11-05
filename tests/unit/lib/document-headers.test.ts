// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { carriesDocuments, documentRedirect } from "@/lib/documents/headers";
import { SIGNED_URL_TTL_SECONDS } from "@/lib/constants";

describe("document responses", () => {
  it("a redirect to a signed link is never indexed or cached", () => {
    const response = documentRedirect("https://storage.test/x?token=1");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://storage.test/x?token=1");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("covers every path that can carry a document, and no public page", () => {
    for (const path of ["/admin/drivers", "/carrier/shifts/1", "/driver/documents", "/api/documents/1/url", "/api/admin/documents/1/url"]) {
      expect(carriesDocuments(path), path).toBe(true);
    }
    for (const path of ["/", "/faq", "/carriers", "/driver", "/administrator"]) {
      expect(carriesDocuments(path), path).toBe(false);
    }
  });

  it("links stay short: 60 seconds (user decision of 2026-11-05)", () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(60);
  });

  it("no text template can carry a storage link", () => {
    for (const file of ["src/content/sms-samples.ts", "src/lib/shifts/texts.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/storage\/v1|supabase\.co|createSignedUrl|token=/);
    }
    expect(readdirSync("src/server/services").length).toBeGreaterThan(0);
    for (const file of readdirSync("src/server/services")) {
      const source = readFileSync(`src/server/services/${file}`, "utf8");
      if (source.includes("createSignedUrl")) expect(source, file).not.toMatch(/texts\.send\(/);
    }
  });
});
