import { z } from "zod";

/**
 * The missing-documents reminder (CR-5). No text field: one driver's id, or none for every
 * Registered driver missing a document, and the typed SEND {N} for the bulk send.
 */
const driverId = z.uuid().nullish().transform((value) => value ?? null);

export const docReminderPreviewSchema = z.strictObject({ driverId });

export const sendDocReminderSchema = z.strictObject({
  driverId,
  confirm: z.string().max(20).default(""),
});
