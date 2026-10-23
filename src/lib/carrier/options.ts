import {
  SEARCH_RADIUS_DEFAULT_MILES,
  SUBSCRIPTION_PLAN_NAME,
  SUBSCRIPTION_PRICE_LABEL,
} from "@/lib/constants";
import type { Subscription, SubscriptionStatus } from "@/types/domain";

/** Words of the carrier side: the plan, the subscription states, the search filters. */

export const PLAN = {
  name: SUBSCRIPTION_PLAN_NAME,
  price: SUBSCRIPTION_PRICE_LABEL,
  includes: [
    "Search local CDL drivers near your yard",
    "See driver CDL class, endorsements, experience, and contact info",
    "Broadcast shifts by text (coming in the next release)",
  ],
} as const;

/** How each Stripe status reads, and whether it grants access. */
export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment failed",
  canceled: "Cancelled",
  unpaid: "Unpaid",
  incomplete: "Payment incomplete",
  incomplete_expired: "Payment expired",
  paused: "Paused",
};

/** The badge while a subscription that still grants access is set to end at the period end. */
export const SUBSCRIPTION_ENDING_LABEL = "Ending";

/** True while the subscription grants access but a cancellation is scheduled for its end. */
export const isEnding = (subscription: Pick<Subscription, "cancelAtPeriodEnd"> | null, subscribed: boolean) =>
  subscribed && subscription !== null && subscription.cancelAtPeriodEnd;

export const SUBSCRIPTION_STATUS_HELP: Record<SubscriptionStatus, string> = {
  trialing: "Your trial is running. Driver search is open.",
  active: "Your subscription is active. Driver search is open.",
  past_due:
    "The last payment failed, so driver search is closed. Update your card to open it again.",
  canceled: "Your subscription ended. Subscribe again to open driver search.",
  unpaid: "The subscription is unpaid, so driver search is closed. Update your card to open it.",
  incomplete: "The first payment did not go through. Try again to open driver search.",
  incomplete_expired: "The checkout expired before payment. Subscribe to open driver search.",
  paused: "Your subscription is paused, so driver search is closed.",
};

/** The distance dropdown on the search. The default is the brief's 50 miles. */
export const RADIUS_OPTIONS = [10, 25, SEARCH_RADIUS_DEFAULT_MILES, 100, 250].map((miles) => ({
  value: String(miles),
  label: `${miles} miles`,
}));

export const MIN_YEARS_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "1", label: "1 year or more" },
  { value: "3", label: "3 years or more" },
  { value: "5", label: "5 years or more" },
  { value: "10", label: "10 years or more" },
];

export const CDL_CLASS_FILTER_OPTIONS = [
  { value: "any", label: "A or B" },
  { value: "A", label: "Class A only" },
  { value: "B", label: "Class A or B" },
];

export const YES_NO_FILTER_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export const MVR_FILTER_OPTIONS = [
  { value: "any", label: "Any record" },
  { value: "clean", label: "No violations in 3 years" },
  { value: "minor_1_2", label: "At most 1 or 2 minor" },
];

/** Carrier-side words about the launch area. */
export const CARRIER_OUT_OF_AREA_NOTE =
  "FleetGrid isn't available in your area yet. You can still save your details and join the waitlist.";
export const CARRIER_WAITLIST_TITLE = "FleetGrid isn't available in your area yet";
export const CARRIER_WAITLIST_TEXT =
  "FleetGrid is launching in the Houston area first. Join the waitlist and we will email you when carriers near your yard can subscribe.";
export const CARRIER_WAITLIST_JOINED = "You're on the list.";
