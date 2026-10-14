import { z } from "zod";

/**
 * The contact form, shared by the browser (inline errors as you type) and the server (the
 * only check that counts). No phone number is asked for: a phone field on a contact form
 * invites Twilio's "silent enrollment" scrutiny and is not needed to reply by email.
 */

export const CONTACT_ROLES = ["carrier", "driver", "other"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  carrier: "Carrier",
  driver: "Driver",
  other: "Other",
};

export const CONTACT_NAME_MIN = 2;
export const CONTACT_NAME_MAX = 80;
export const CONTACT_COMPANY_MAX = 120;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 2000;

export const CONTACT_MESSAGES = {
  name: "Enter your name",
  nameLong: `Your name must be ${CONTACT_NAME_MAX} characters or fewer`,
  email: "Enter a valid email address",
  role: "Choose Carrier, Driver or Other",
  companyLong: `The company name must be ${CONTACT_COMPANY_MAX} characters or fewer`,
  messageShort: `Tell us a little more, at least ${CONTACT_MESSAGE_MIN} characters`,
  messageLong: `Your message must be ${CONTACT_MESSAGE_MAX} characters or fewer`,
  token: "The page has expired. Reload it and send your message again",
} as const;

const trimmed = (message: string) =>
  z.preprocess((value) => (typeof value === "string" ? value.trim() : value), z.string({ error: message }));

/** The five fields a person fills in. */
export const contactFieldsSchema = z.object({
  name: trimmed(CONTACT_MESSAGES.name)
    .pipe(z.string().min(CONTACT_NAME_MIN, CONTACT_MESSAGES.name))
    .pipe(z.string().max(CONTACT_NAME_MAX, CONTACT_MESSAGES.nameLong)),
  email: trimmed(CONTACT_MESSAGES.email)
    .pipe(z.string().toLowerCase())
    .pipe(z.email(CONTACT_MESSAGES.email)),
  role: z.enum(CONTACT_ROLES, { error: CONTACT_MESSAGES.role }),
  company: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .max(CONTACT_COMPANY_MAX, CONTACT_MESSAGES.companyLong)
      .optional()
      .transform((value) => (value ? value : undefined)),
  ),
  message: trimmed(CONTACT_MESSAGES.messageShort)
    .pipe(z.string().min(CONTACT_MESSAGE_MIN, CONTACT_MESSAGES.messageShort))
    .pipe(z.string().max(CONTACT_MESSAGE_MAX, CONTACT_MESSAGES.messageLong)),
});

/** What the browser posts: the fields, the honeypot and the signed timestamp. */
export const contactSubmissionSchema = contactFieldsSchema.extend({
  /** The honeypot. A person never sees it; anything in it means a bot. */
  company_website: z.string().optional().default(""),
  /** Issued when the page rendered; signed, and at least three seconds old when posted. */
  token: z.string({ error: CONTACT_MESSAGES.token }).min(1, CONTACT_MESSAGES.token),
});

export type ContactFields = z.infer<typeof contactFieldsSchema>;
export type ContactFieldsInput = z.input<typeof contactFieldsSchema>;
export type ContactSubmission = z.infer<typeof contactSubmissionSchema>;
