import { z } from "zod";

/**
 * The admin's Drivers page: the list's query (every filter is a URL parameter, so an
 * unknown value falls back quietly instead of breaking a shared link) and the id of the
 * driver an action is about.
 */

/** One of the given values, or the fallback for anything else (blank, missing, unknown). */
const oneOf = <const T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess(
    (value) => (typeof value === "string" && (values as readonly string[]).includes(value) ? value : fallback),
    z.enum(values),
  );

export const REVIEW_FILTERS = ["", "pending", "approved", "blocked"] as const;
export const COMPLETE_FILTERS = ["", "complete", "incomplete"] as const;
export const AREA_FILTERS = ["", "in", "out"] as const;
/** Where the driver came from: a QR code, another tagged link, or neither. */
export const SOURCE_FILTERS = ["", "qr", "campaign", "direct"] as const;
/** The self-reported Clearinghouse and SAP answer: given, or not answered. */
export const SELF_REPORT_FILTERS = ["", "yes", "none"] as const;
export const DRIVER_SORTS = ["created", "name", "status"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export const SEARCH_MAX_LENGTH = 80;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id from the address, or nothing for anything that is not one. */
const optionalId = z.preprocess((value) => (typeof value === "string" && UUID.test(value) ? value : undefined), z.string().optional());

export const adminDriversQuerySchema = z.object({
  status: oneOf(REVIEW_FILTERS, ""),
  complete: oneOf(COMPLETE_FILTERS, ""),
  area: oneOf(AREA_FILTERS, ""),
  source: oneOf(SOURCE_FILTERS, ""),
  selfReport: oneOf(SELF_REPORT_FILTERS, ""),
  /** One QR code's sign-ups only (linked from the Analytics page). */
  qr: optionalId,
  /** Name, phone or ZIP. */
  q: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().slice(0, SEARCH_MAX_LENGTH) : ""),
    z.string(),
  ),
  sort: oneOf(DRIVER_SORTS, "created"),
  dir: oneOf(SORT_DIRECTIONS, "desc"),
  page: z.preprocess((value) => {
    const number = typeof value === "string" ? Number.parseInt(value, 10) : typeof value === "number" ? value : 1;
    return Number.isInteger(number) && number >= 1 ? number : 1;
  }, z.number().int().min(1)),
  /** The driver whose details are open beside the list. */
  open: optionalId,
});

export const driverIdSchema = z.object({
  driverId: z.uuid({ error: "Driver not found" }),
});

export type AdminDriversQuery = z.infer<typeof adminDriversQuerySchema>;
export type DriverIdInput = z.infer<typeof driverIdSchema>;
