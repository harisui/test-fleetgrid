import { IMAGE_MAX_DIMENSION, IMAGE_TARGET_MAX_MB } from "@/lib/constants";

const COMPRESSIBLE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isCompressibleImage(file: { type: string }): boolean {
  return COMPRESSIBLE_TYPES.includes(file.type);
}

/** True when an image is already small enough to upload as it is. */
export function isWithinImageTarget(file: { size: number }): boolean {
  return file.size <= IMAGE_TARGET_MAX_MB * 1024 * 1024;
}

type Compressor = (file: File, options: Record<string, unknown>) => Promise<Blob>;

/**
 * Prepares a file for upload in the browser.
 * Images are resized to at most 2000px and compressed to under 1 MB. PDFs and other files
 * are returned unchanged. If compression fails, the original file is returned so the server
 * limits still decide.
 *
 * The compression library is loaded on demand so it stays out of the main bundle.
 */
export async function prepareFileForUpload(file: File, compressor?: Compressor): Promise<File> {
  if (!isCompressibleImage(file)) return file;

  try {
    const compress =
      compressor ?? ((await import("browser-image-compression")).default as Compressor);
    const compressed = await compress(file, {
      maxSizeMB: IMAGE_TARGET_MAX_MB,
      maxWidthOrHeight: IMAGE_MAX_DIMENSION,
      useWebWorker: true,
      fileType: file.type,
    });
    // Never make a file bigger.
    if (compressed.size >= file.size && isWithinImageTarget(file)) return file;
    return new File([compressed], file.name, { type: compressed.type || file.type });
  } catch {
    return file;
  }
}

/** "1.2 MB", "340 KB", "512 B" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
