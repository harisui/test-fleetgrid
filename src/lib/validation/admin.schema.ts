import { z } from "zod";
import { ACCOUNT_STATUSES } from "@/types/domain";

/** The admin's driver review: which drivers to list, and the status to give one. */

export const driverListSchema = z.object({
  /** "all" or blank lists everyone; otherwise one status. */
  status: z.preprocess(
    (value) => (value === "" || value === "all" || value === undefined ? undefined : value),
    z.enum(ACCOUNT_STATUSES).optional(),
  ),
});

export const STATUS_CHANGE_MESSAGE = "Pick Approve, Block or Set pending";

export const driverStatusSchema = z.object({
  profileId: z.uuid({ error: "Driver not found" }),
  status: z.enum(ACCOUNT_STATUSES, { error: STATUS_CHANGE_MESSAGE }),
});

export type DriverListInput = z.infer<typeof driverListSchema>;
export type DriverStatusInput = z.infer<typeof driverStatusSchema>;
