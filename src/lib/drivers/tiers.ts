import type { AccountStatus, DocumentType, Driver } from "@/types/domain";

/**
 * The labels (Annie, confirmed 2026-11-04), each in this one place. Internal names (shift_ready,
 * ShiftReady..., approved) stay as they are; a test keeps these words out of every other file.
 */
/** A driver who meets every requirement, as drivers and admins read it. */
export const ROSTER_READY = "Roster-Ready";
/** The same driver as a carrier reads it. */
export const DOCUMENTED_PROFILE = "Documented profile";
/** An answer that is the driver's own word, not something FleetGrid checked. */
export const SELF_REPORTED = "Self-reported";

/**
 * Registered and Roster-Ready (change request CR-5). The database keeps pending, approved and
 * blocked; for drivers they read Registered, Roster-Ready and Blocked. Never the V-word (a test bans it):
 * FleetGrid runs no background check.
 */
export const DRIVER_STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "Registered",
  approved: ROSTER_READY,
  blocked: "Blocked",
};

/** What Shift-Ready needs, in the order the checklist shows it (shift_ready_missing in 0028). */
export const SHIFT_READY_ITEMS = ["cdl_front", "cdl_back", "medical_card", "cdl_state", "last_name", "profile"] as const;
export type ShiftReadyItem = (typeof SHIFT_READY_ITEMS)[number];

/** The documents Shift-Ready needs. */
export const REQUIRED_DOCUMENTS = ["cdl_front", "cdl_back", "medical_card"] as const satisfies readonly DocumentType[];

export const SHIFT_READY_ITEM_LABELS: Record<ShiftReadyItem, string> = {
  cdl_front: "CDL front photo",
  cdl_back: "CDL back photo",
  medical_card: "Medical card",
  cdl_state: "Texas CDL",
  last_name: "Last name missing",
  profile: "Profile not complete",
};

/** Under the three photos in the admin's Shift-Ready review. */
export const SHIFT_READY_PHOTO_NOTE = "Check the name, state and expiry match the profile.";

/** At least two words: the brief's "first and last name present" (user decision of 2026-11-03). */
export function hasTwoWordName(fullName: string): boolean {
  return fullName.trim().split(/\s+/).filter(Boolean).length >= 2;
}

/**
 * What keeps a driver from Shift-Ready, the same rule as the database's shift_ready_missing():
 * the three documents, a Texas CDL (or an admin's override), two words of name, a full card.
 */
export function shiftReadyMissing(
  driver: Pick<Driver, "fullName" | "cdlState" | "shiftReadyOverrideReason" | "cardCompleted">,
  documentTypes: readonly DocumentType[],
): ShiftReadyItem[] {
  const has = new Set(documentTypes);
  const missing: ShiftReadyItem[] = [];
  for (const type of REQUIRED_DOCUMENTS) if (!has.has(type)) missing.push(type);
  if (driver.cdlState !== "TX" && !driver.shiftReadyOverrideReason) missing.push("cdl_state");
  if (!hasTwoWordName(driver.fullName)) missing.push("last_name");
  if (!driver.cardCompleted) missing.push("profile");
  return missing;
}
