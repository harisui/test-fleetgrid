import { z } from "zod";
import { ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { DOCUMENT_TYPES } from "@/types/domain";

export const FILE_TYPE_MESSAGE = "Upload a JPG, PNG, WebP or PDF file";
export const FILE_SIZE_MESSAGE = "File must be 10 MB or smaller";

/** Metadata of an upload. Used on the client before uploading and on the server again. */
export const documentUploadSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: "Select a document type" }),
  fileName: z
    .string({ error: "File name is required" })
    .trim()
    .min(1, "File name is required")
    .max(200, "File name must be 200 characters or fewer"),
  mimeType: z.enum(ALLOWED_UPLOAD_MIME, { error: FILE_TYPE_MESSAGE }),
  sizeBytes: z
    .number({ error: "File is empty" })
    .int()
    .positive("File is empty")
    .max(MAX_UPLOAD_BYTES, FILE_SIZE_MESSAGE),
});

/** Sent after the browser has stored the file. Size and type are read from storage, not trusted from here. */
export const confirmUploadSchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: "Select a document type" }),
  fileName: z
    .string({ error: "File name is required" })
    .trim()
    .min(1, "File name is required")
    .max(200, "File name must be 200 characters or fewer"),
  storagePath: z
    .string({ error: "Upload did not finish. Please try again." })
    .regex(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/,
      "Upload did not finish. Please try again.",
    ),
});

export const documentIdSchema = z.object({
  documentId: z.uuid("Invalid document"),
});

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

/** Quick client-side check for a File before compression and upload. Returns an error message or null. */
export function validateUploadFile(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(file.type)) return FILE_TYPE_MESSAGE;
  if (file.size <= 0) return "File is empty";
  if (file.size > MAX_UPLOAD_BYTES) return FILE_SIZE_MESSAGE;
  return null;
}
