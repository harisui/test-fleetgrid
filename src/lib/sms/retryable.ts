/** Twilio errors a retry can fix (user decision of 2026-11-01); a send that never reached Twilio has no code. */
export const RETRYABLE_ERROR_CODES = ["30001", "30003", "30008"] as const;
