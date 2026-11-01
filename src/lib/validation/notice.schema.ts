import { z } from "zod";
import { NOTICE_POLICIES, NOTICE_SERVICES, NOTICE_STATES } from "@/content/sms-samples";

/**
 * Send notice (CR-3). The admin only makes choices: every field is an enum, an id, a date or
 * a time, and the objects are strict, so a body or any other text field is refused. The
 * words come only from the templates in src/content/sms-samples.ts.
 */

const keys = <T extends Record<string, unknown>>(record: T) => Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];

export const NOTICE_CATEGORIES = ["policy_change", "service_notice", "service_restored", "account_security"] as const;
export const POLICY_KEYS = keys(NOTICE_POLICIES);
export const SERVICE_KEYS = keys(NOTICE_SERVICES);
export const STATE_KEYS = keys(NOTICE_STATES);

const date = z.string({ error: "Pick the date" }).regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date");
const time = z.string({ error: "Pick the time" }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick the time");
const areaId = z.uuid().nullish().transform((value) => value ?? null);

export const noticeChoicesSchema = z.discriminatedUnion("category", [
  z.strictObject({
    category: z.literal("policy_change"),
    policy: z.enum(POLICY_KEYS, { error: "Pick the policy" }),
    date,
    areaId,
  }),
  z.strictObject({
    category: z.literal("service_notice"),
    service: z.enum(SERVICE_KEYS, { error: "Pick the service" }),
    state: z.enum(STATE_KEYS, { error: "Pick what is wrong" }),
    time,
    areaId,
    sendNow: z.boolean().default(false),
  }),
  z.strictObject({
    category: z.literal("service_restored"),
    restoresBatchId: z.uuid({ error: "Pick the service notice this answers" }),
  }),
  z.strictObject({
    category: z.literal("account_security"),
    driverId: z.uuid({ error: "Pick the driver" }),
    sendNow: z.boolean().default(false),
  }),
]);

export const sendNoticeSchema = z.strictObject({
  choices: noticeChoicesSchema,
  /** Bulk: "SEND {N}" typed by the admin. Security: the dialog sends "SEND 1". */
  confirm: z.string().max(20),
});

export const driverSearchQuerySchema = z.strictObject({ query: z.string().trim().min(2).max(40) });

export type NoticeChoices = z.infer<typeof noticeChoicesSchema>;
export type NoticeChoicesInput = z.input<typeof noticeChoicesSchema>;
