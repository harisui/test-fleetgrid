import { normalizeUsPhone } from "@/lib/phone";

/**
 * SHIFT_ALERTS_ONLY_TO, for a live test with real phones: shift alerts go only to these numbers.
 * Unset, nobody is held back. Set, only the numbers in it get an alert; set but with no valid
 * number in it (empty, or "none"), no alert goes to anyone. Remove the variable after the test.
 */
export function shiftAlertAllowlist(value: string | undefined): ReadonlySet<string> | null {
  if (value === undefined) return null;
  const phones = value
    .split(",")
    .map((part) => normalizeUsPhone(part))
    .filter((phone): phone is string => phone !== null);
  return new Set(phones);
}

/** True when an alert may go to this number. */
export function alertAllowed(allowlist: ReadonlySet<string> | null, phone: string): boolean {
  return allowlist === null || allowlist.has(phone);
}
