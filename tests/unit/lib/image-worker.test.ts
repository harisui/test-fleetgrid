import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { IMAGE_WORKER_LIB_PATH, prepareFileForUpload } from "@/lib/image";

describe("the image compression worker", () => {
  it("loads the library from this site, never the CDN", async () => {
    const compressor = vi.fn(async (file: File) => file as Blob);
    await prepareFileForUpload(new File(["x"], "a.png", { type: "image/png" }), compressor);
    const options = compressor.mock.calls[0]?.[1 as never] as unknown as Record<string, unknown>;
    expect(options.useWebWorker).toBe(true);
    expect(options.libURL).toBe(`${window.location.origin}${IMAGE_WORKER_LIB_PATH}`);
  });

  it("serves an exact copy of the installed package, under its version", () => {
    const require = createRequire(join(process.cwd(), "package.json"));
    const entry = require.resolve("browser-image-compression");
    const root = dirname(dirname(entry));
    const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
    expect(IMAGE_WORKER_LIB_PATH).toBe(`/vendor/browser-image-compression-${version}.js`);
    const served = readFileSync(join(process.cwd(), "public", IMAGE_WORKER_LIB_PATH));
    expect(served.equals(readFileSync(join(root, "dist", "browser-image-compression.js")))).toBe(true);
  });
});
