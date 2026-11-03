import { createHmac } from "node:crypto";
import type { DocReminderItems } from "@/content/sms-samples";
import { smsSegments } from "@/lib/sms/segments";

/**
 * The longest first name the welcome text carries. The plan said 20 (CR-5 decision 5), but
 * the text is 148 characters before the name, so 11 is the most that keeps it under 160.
 */
export const WELCOME_NAME_MAX = 11;

/** The key when PHONE_HASH_SECRET is not set. Production sets its own, once, and never changes it. */
export const DEFAULT_PHONE_HASH_SECRET = "fleetgrid-welcome-texts";

/**
 * The welcome's first name: the first word of the full name, or null when there is none, it
 * is longer than 20 characters, or it is not plain GSM-7 (then the text leaves it out).
 */
export function welcomeFirstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0] ?? "";
  if (!first || first.length > WELCOME_NAME_MAX) return null;
  return smsSegments(first).encoding === "GSM-7" ? first : null;
}

/**
 * What the missing-documents reminder names, from the checklist only: either CDL photo makes
 * "CDL photos". Null when nothing it covers is missing.
 */
export function docReminderItems(missing: readonly string[]): DocReminderItems | null {
  const cdl = missing.includes("cdl_front") || missing.includes("cdl_back");
  const medical = missing.includes("medical_card");
  if (cdl && medical) return "CDL photos and medical card";
  if (cdl) return "CDL photos";
  if (medical) return "medical card";
  return null;
}

/**
 * The welcome table's key for a phone number: an HMAC with a server secret, never the number
 * itself (user decision of 2026-11-03). Changing the secret would let a number be welcomed again.
 */
export function phoneHash(phone: string, secret: string = DEFAULT_PHONE_HASH_SECRET): string {
  return createHmac("sha256", secret).update(phone.replace(/[^\d+]/g, "")).digest("hex");
}
