import { describe, expect, it, vi } from "vitest";
import {
  formatFileSize,
  isCompressibleImage,
  isWithinImageTarget,
  prepareFileForUpload,
} from "@/lib/image";

const MB = 1024 * 1024;

function fileOf(sizeBytes: number, type: string, name = "file"): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const libraryCompress = vi.hoisted(() => vi.fn());
vi.mock("browser-image-compression", () => ({ default: libraryCompress }));

describe("isCompressibleImage", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("%s is compressed", (type) => {
    expect(isCompressibleImage({ type })).toBe(true);
  });

  it.each(["application/pdf", "image/gif", "image/heic", "text/plain", ""])(
    "%j is left alone",
    (type) => {
      expect(isCompressibleImage({ type })).toBe(false);
    },
  );
});

describe("isWithinImageTarget", () => {
  it("is true up to 1 MB", () => {
    expect(isWithinImageTarget({ size: MB })).toBe(true);
    expect(isWithinImageTarget({ size: MB + 1 })).toBe(false);
  });
});

describe("prepareFileForUpload", () => {
  it("returns PDFs unchanged without calling the compressor", async () => {
    const compressor = vi.fn();
    const pdf = fileOf(5 * MB, "application/pdf", "scan.pdf");
    await expect(prepareFileForUpload(pdf, compressor)).resolves.toBe(pdf);
    expect(compressor).not.toHaveBeenCalled();
  });

  it("compresses images to under 1 MB and at most 2000px", async () => {
    const original = fileOf(4 * MB, "image/jpeg", "cdl.jpg");
    const compressor = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array(300_000)], { type: "image/jpeg" }));

    const result = await prepareFileForUpload(original, compressor);

    expect(compressor).toHaveBeenCalledWith(original, {
      maxSizeMB: 1,
      maxWidthOrHeight: 2000,
      useWebWorker: true,
      fileType: "image/jpeg",
    });
    expect(result).toBeInstanceOf(File);
    expect(result.size).toBe(300_000);
    expect(result.name).toBe("cdl.jpg");
    expect(result.type).toBe("image/jpeg");
  });

  it("keeps the original type when the compressor returns an untyped blob", async () => {
    const original = fileOf(2 * MB, "image/png", "a.png");
    const compressor = vi.fn().mockResolvedValue(new Blob([new Uint8Array(1000)]));
    const result = await prepareFileForUpload(original, compressor);
    expect(result.type).toBe("image/png");
  });

  it("keeps a small original when compression would not make it smaller", async () => {
    const original = fileOf(200_000, "image/webp", "small.webp");
    const compressor = vi.fn().mockResolvedValue(new Blob([new Uint8Array(250_000)]));
    await expect(prepareFileForUpload(original, compressor)).resolves.toBe(original);
  });

  it("uses the compressed result for a large original even if it did not shrink", async () => {
    const original = fileOf(3 * MB, "image/jpeg", "big.jpg");
    const compressor = vi
      .fn()
      .mockResolvedValue(new Blob([new Uint8Array(3 * MB)], { type: "image/jpeg" }));
    const result = await prepareFileForUpload(original, compressor);
    expect(result).not.toBe(original);
    expect(result.size).toBe(3 * MB);
  });

  it("falls back to the original when compression fails", async () => {
    const original = fileOf(2 * MB, "image/jpeg", "broken.jpg");
    const compressor = vi.fn().mockRejectedValue(new Error("canvas failed"));
    await expect(prepareFileForUpload(original, compressor)).resolves.toBe(original);
  });

  it("loads browser-image-compression by default", async () => {
    libraryCompress.mockResolvedValue(new Blob([new Uint8Array(100)], { type: "image/png" }));
    const original = fileOf(2 * MB, "image/png", "photo.png");

    const result = await prepareFileForUpload(original);
    expect(libraryCompress).toHaveBeenCalledOnce();
    expect(result.size).toBe(100);
  });
});

describe("formatFileSize", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [250_000, "244 KB"],
    [MB, "1.0 MB"],
    [2.5 * MB, "2.5 MB"],
    [10 * MB, "10.0 MB"],
  ])("%i bytes is %s", (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});
