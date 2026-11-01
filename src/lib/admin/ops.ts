import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/carrier/options";
import type { AdminAction, Subscription } from "@/types/domain";

/** The subscription's state in words, or that there is none. */
export function subscriptionLabel(row: { subscription: Pick<Subscription, "status"> | null }): string {
  return row.subscription ? SUBSCRIPTION_STATUS_LABELS[row.subscription.status] : "No subscription";
}

/** How the audit log's Milestone 3 actions read in a history list. */
const AUDIT_LABELS: Partial<Record<AdminAction, string>> = {
  carrier_approved: "Approved",
  carrier_blocked: "Blocked",
  carrier_reopened: "Set pending",
  carrier_removed: "Removed",
  driver_removed: "Removed",
  driver_paused: "Shift texts paused",
  driver_unpaused: "Shift texts resumed",
  service_area_created: "Added",
  service_area_updated: "Edited",
  service_area_activated: "Activated",
  service_area_deactivated: "Deactivated",
  shift_cancelled: "Cancelled",
};

export function auditLabel(action: AdminAction): string {
  return AUDIT_LABELS[action] ?? action.replaceAll("_", " ");
}
