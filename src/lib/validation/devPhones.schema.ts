import { z } from "zod";
import { FAKE_PHONE_PREFIX } from "@/lib/dev/phones";

export const FAKE_TIERS = ["roster_ready", "registered"] as const;
export const FAKE_TWIC = ["valid", "expired", "none"] as const;
export const FAKE_PLACES = ["pasadena", "houston", "dallas"] as const;
export const FAKE_TEXTS = ["on", "stopped", "no_consent"] as const;

export const createFakeDriversSchema = z.strictObject({
  count: z.coerce.number().int().min(1).max(20),
  cdlClass: z.enum(["A", "B"]),
  endorsements: z.boolean(),
  tier: z.enum(FAKE_TIERS),
  twic: z.enum(FAKE_TWIC),
  place: z.enum(FAKE_PLACES),
  texts: z.enum(FAKE_TEXTS),
  paused: z.boolean(),
});

export const fakeReplySchema = z.strictObject({
  phone: z.string().startsWith(FAKE_PHONE_PREFIX),
  body: z.string().trim().min(1, "Type a reply").max(160),
});

export type CreateFakeDriversInput = z.infer<typeof createFakeDriversSchema>;
