import { z } from "zod";

/** The admin Messaging pages: Activity's tabs and filters, and the resend. All in the URL. */

export const MESSAGING_PERIODS = ["today", "7d", "30d"] as const;
export const MESSAGING_TABS = ["broadcasts", "account", "notices", "unmatched"] as const;
export const MESSAGE_STATUS_FILTERS = ["", "sent", "delivered", "failed"] as const;
export const ACCOUNT_KINDS = ["approved", "reminder", "welcome", "doc_reminder", "cdl_state_notice", "twic_date_notice", "cancelled", "security"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
const optionalUuid = z.preprocess(first, z.uuid().optional().catch(undefined));
const optionalDate = z.preprocess(first, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined));

export const messagingQuerySchema = z.object({
  period: z.preprocess(first, z.enum(MESSAGING_PERIODS).catch("7d")),
  tab: z.preprocess(first, z.enum(MESSAGING_TABS).catch("broadcasts")),
  // "any" is the dropdown's choice for no status filter (a dropdown item cannot be empty).
  status: z.preprocess((v) => {
    const value = first(v) ?? "";
    return value === "any" ? "" : value;
  }, z.enum(MESSAGE_STATUS_FILTERS).catch("")),
  type: z.preprocess(first, z.enum(ACCOUNT_KINDS).optional().catch(undefined)),
  shift: optionalUuid,
  driver: optionalUuid,
  batch: optionalUuid,
  message: optionalUuid,
  from: optionalDate,
  to: optionalDate,
});

export type MessagingQuery = z.infer<typeof messagingQuerySchema>;

export const messageIdSchema = z.object({ messageId: z.uuid({ error: "Text not found" }) });
