/**
 * US phone numbers only. Stored and sent as E.164: +1XXXXXXXXXX.
 */

const E164_US = /^\+1[2-9]\d{2}[2-9]\d{6}$/;

/** Keeps digits only. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Converts user input to E.164, or returns null when it is not a valid US number.
 * Accepts "(555) 555-0100", "555-555-0100", "1 555 555 0100", "+1 555 555 0100".
 * Rejects international numbers and anything that is not 10 digits (11 with a leading 1).
 */
export function normalizeUsPhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  // Only digits and common separators are allowed.
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;

  const digits = digitsOnly(trimmed);
  const hasPlus = trimmed.startsWith("+");

  let national: string;
  if (digits.length === 11 && digits.startsWith("1")) {
    national = digits.slice(1);
  } else if (digits.length === 10 && !hasPlus) {
    national = digits;
  } else {
    return null;
  }

  const e164 = `+1${national}`;
  return E164_US.test(e164) ? e164 : null;
}

export function isValidUsPhone(input: string): boolean {
  return normalizeUsPhone(input) !== null;
}

/**
 * Formats what the user has typed so far as "(555) 555-0100".
 * Works on partial input and ignores a leading country code 1.
 */
export function formatUsPhoneInput(input: string): string {
  let digits = digitsOnly(input);
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  digits = digits.slice(0, 10);

  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** "+15555550100" becomes "(555) 555-0100". Other values are returned unchanged. */
export function formatE164ForDisplay(e164: string): string {
  if (!/^\+1\d{10}$/.test(e164)) return e164;
  return formatUsPhoneInput(e164.slice(2));
}

/** "+15555550100" becomes "(***) ***-0100" for screens that should not show the full number. */
export function maskPhone(e164: string): string {
  if (!/^\+1\d{10}$/.test(e164)) return e164;
  return `(***) ***-${e164.slice(-4)}`;
}
