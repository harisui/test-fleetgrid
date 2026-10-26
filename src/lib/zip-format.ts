/**
 * ZIP code formatting with no dependencies, so browser code can use it without pulling a
 * validation library into the page. The zod schemas in src/lib/validation build on it.
 */

/** Accepts "60601", "60601-1234", "60601 1234" and spaces. Keeps the first five digits. */
export function normalizeZip(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  return digits.length === 9 ? digits.slice(0, 5) : digits;
}
