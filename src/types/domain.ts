import type { ReactNode } from "react";
import type { Database } from "@/types/database.types";

/** App-level types. Database row types live in database.types.ts (generated). */

type Enums = Database["public"]["Enums"];

export type UserRole = Enums["user_role"];
export type AccountStatus = Enums["account_status"];
export type OperatorType = Enums["operator_type"];
export type CdlClass = Enums["cdl_class"];
export type Endorsement = Enums["endorsement"];
export type AvailabilityType = Enums["availability_type"];
export type DocumentType = Enums["document_type"];
export type SmsConsentEvent = Enums["sms_consent_event"];
export type SmsConsentSource = Enums["sms_consent_source"];
export type EmploymentType = Enums["employment_type"];
export type DrivingStyle = Enums["driving_style"];
export type TransmissionType = Enums["transmission_type"];
export type EquipmentType = Enums["equipment_type"];
export type MvrStatus = Enums["mvr_status"];
export type SubscriptionStatus = Enums["subscription_status"];

export const USER_ROLES = ["driver", "carrier", "admin"] as const satisfies readonly UserRole[];
/** Roles a user can pick for themselves at sign-up. */
export const SIGNUP_ROLES = ["driver", "carrier"] as const satisfies readonly UserRole[];
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const ACCOUNT_STATUSES = [
  "pending",
  "approved",
  "blocked",
] as const satisfies readonly AccountStatus[];

export const OPERATOR_TYPES = [
  "cdl_driver",
  "yard_spotter",
  "mechanic",
] as const satisfies readonly OperatorType[];

export const CDL_CLASSES = ["A", "B", "none"] as const satisfies readonly CdlClass[];

/**
 * The classes a driver can hold: A and B, the launch scope (client decision of 2026-10-11).
 * "none" is the database default before the class is picked.
 */
export const CDL_HELD_CLASSES = ["A", "B"] as const satisfies readonly CdlClass[];

/** The freight endorsements. P (passengers) and S (school bus) left on 2026-10-11. */
export const ENDORSEMENTS = ["H", "N", "T", "X"] as const satisfies readonly Endorsement[];

export const AVAILABILITY_TYPES = [
  "full_time",
  "part_time",
  "on_call",
  "weekends",
] as const satisfies readonly AvailabilityType[];

export const DOCUMENT_TYPES = [
  "cdl_front",
  "cdl_back",
  "medical_card",
  "certification",
  "other",
] as const satisfies readonly DocumentType[];

/** W-2, 1099 contractor (never an owner-operator: drivers run the carrier's truck), or either. */
export const EMPLOYMENT_TYPES = [
  "w2",
  "contractor_1099",
  "either",
] as const satisfies readonly EmploymentType[];

/** Local shift coverage only: no OTR, and no yard spotting (client decision of 2026-10-11). */
export const DRIVING_STYLES = [
  "local_day_cab",
  "regional",
] as const satisfies readonly DrivingStyle[];

export const TRANSMISSION_TYPES = [
  "automatic_only",
  "manual_ok",
] as const satisfies readonly TransmissionType[];

export const EQUIPMENT_TYPES = [
  "container_drayage",
  "dry_van",
  "flatbed",
  "reefer",
] as const satisfies readonly EquipmentType[];

/** Moving violations in the last 3 years: none, 1 to 2 minor, or 3 or more or a major one. */
export const MVR_STATUSES = [
  "clean",
  "minor_1_2",
  "major_3_plus",
] as const satisfies readonly MvrStatus[];

/** Every status Stripe reports. Access needs one of ALLOWED_SUB_STATUSES (constants.ts). */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const satisfies readonly SubscriptionStatus[];

/** The one work type at launch (client decision of 2026-10-09). Set on every new card. */
export const CDL_WORK_TYPE: OperatorType = "cdl_driver";

export const OPERATOR_TYPE_LABELS: Record<OperatorType, string> = {
  cdl_driver: "CDL driver",
  yard_spotter: "Yard spotter",
  mechanic: "Mechanic",
};

export const ENDORSEMENT_LABELS: Record<Endorsement, string> = {
  H: "H - Hazardous materials",
  N: "N - Tank vehicles",
  T: "T - Double/triple trailers",
  X: "X - Tanker and hazmat",
};

export const AVAILABILITY_LABELS: Record<AvailabilityType, string> = {
  full_time: "Full time",
  part_time: "Part time",
  on_call: "On call",
  weekends: "Weekends",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  cdl_front: "CDL (front)",
  cdl_back: "CDL (back)",
  medical_card: "Medical card",
  certification: "Certification",
  other: "Other",
};

/**
 * Where a sign-up came from: the first-touch UTM tags, the referrer and the landing path
 * from the first-party cookie, and the QR code when utm_content named one. Set once when the
 * profile is created; null everywhere for a direct or unknown visit.
 */
export interface SignupSource {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  referrer: string | null;
  landingPath: string | null;
  qrLinkId: string | null;
}

export const NO_SOURCE: SignupSource = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  referrer: null,
  landingPath: null,
  qrLinkId: null,
};

export interface Profile {
  id: string;
  role: UserRole;
  phone: string;
  status: AccountStatus;
  source: SignupSource;
  createdAt: string;
  updatedAt: string;
}

/** How a driver said they heard of FleetGrid (optional, the last question before consent). */
export const HEARD_FROM = [
  "flyer",
  "facebook_instagram",
  "google_search",
  "friend_coworker",
  "other",
] as const satisfies readonly Enums["heard_from"][];
export type HeardFrom = (typeof HEARD_FROM)[number];

export const HEARD_FROM_LABELS: Record<HeardFrom, string> = {
  flyer: "Flyer at a truck stop or shop",
  facebook_instagram: "Facebook or Instagram",
  google_search: "Google search",
  friend_coworker: "A friend or coworker",
  other: "Other",
};

/** One printed QR code: the short link /q/<slug> and where it sends people, with the UTM tags. */
export interface QrLink {
  id: string;
  slug: string;
  locationName: string;
  campaign: string;
  targetPath: string;
  utmSource: string;
  utmMedium: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** One visit to a short link. The address is kept hashed, never raw. */
export interface QrScan {
  id: string;
  qrLinkId: string;
  scannedAt: string;
}

export interface Driver {
  id: string;
  profileId: string;
  fullName: string;
  operatorTypes: OperatorType[];
  cdlClass: CdlClass;
  endorsements: Endorsement[];
  yearsExperience: number | null;
  city: string | null;
  /** Null until the ZIP screen is saved. */
  state: string | null;
  zip: string | null;
  serviceRadiusMiles: number;
  /** Centre of the saved ZIP in decimal degrees, from the bundled dataset. Null when unknown. */
  lat: number | null;
  lng: number | null;
  availability: AvailabilityType[];
  certifications: string[];
  bio: string | null;
  /** W-2, 1099 or either. Null until the employment screen is saved. */
  employmentType: EmploymentType | null;
  /** CDL drivers only. Empty or null for everyone else. */
  drivingStyles: DrivingStyle[];
  transmission: TransmissionType | null;
  equipmentTypes: EquipmentType[];
  /** Asked of everyone. Null until the cards screen is saved. */
  twicActive: boolean | null;
  medicalCardActive: boolean | null;
  /** CDL drivers only. Null for everyone else. */
  clearinghouseRegistered: boolean | null;
  /** Moving violations in the last 3 years, in three levels. */
  mvrStatus: MvrStatus | null;
  smsOptIn: boolean;
  smsOptInAt: string | null;
  smsOptInText: string | null;
  smsOptedOut: boolean;
  smsOptedOutAt: string | null;
  /** The optional "How did you hear about FleetGrid?" answer, with the free text for Other. */
  heardFrom: HeardFrom | null;
  heardFromOther: string | null;
  /**
   * When the driver confirmed, themselves, no unresolved Clearinghouse violations and no SAP
   * process; null when they did not answer or withdrew it. Read for the driver and admins
   * only (its own table, 0021); always null where carriers read a card.
   */
  clearinghouseSelfReportedAt: string | null;
  onboardingStep: number;
  cardCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A card plus whether its ZIP sits inside an active service area. Computed live on every
 * read, never stored. Null when the card has no coordinates yet.
 */
export interface LocatedDriver extends Driver {
  inServiceArea: boolean | null;
}

export interface DriverDocument {
  id: string;
  driverId: string;
  type: DocumentType;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** A carrier company (Milestone 2). The yard is the ZIP with its place from the dataset. */
export interface Carrier {
  id: string;
  profileId: string;
  companyName: string;
  contactName: string;
  billingEmail: string;
  usdot: string | null;
  mc: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  /** Set by server code when checkout first starts. Null until then. */
  stripeCustomerId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A carrier plus whether the yard sits inside an active service area, computed live. */
export interface LocatedCarrier extends Carrier {
  inServiceArea: boolean;
}

/** The mirror of a carrier's Stripe subscription, kept current by the webhook. */
export interface Subscription {
  id: string;
  carrierId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  status: SubscriptionStatus;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A carrier waiting for FleetGrid to reach their yard. */
export interface WaitlistEntry {
  id: string;
  carrierId: string;
  zip: string;
  lat: number;
  lng: number;
  createdAt: string;
}

export interface TosAcceptance {
  id: string;
  profileId: string;
  version: string;
  acceptedAt: string;
  ip: string | null;
  userAgent: string | null;
}

/** A launch area: a centre ZIP with its coordinates and a radius in miles. */
export interface ServiceArea {
  id: string;
  name: string;
  centerZip: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  isActive: boolean;
}

/** What the admin did, as the audit log records it. Milestone 3 adds the carrier and QR actions. */
export const ADMIN_ACTIONS = [
  "driver_approved",
  "driver_blocked",
  "driver_reopened",
  "qr_link_created",
  "qr_link_activated",
  "qr_link_deactivated",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
export type AuditTargetType = "driver" | "carrier" | "qr_link";

/** One line of the admin audit log: who, when, what, to which record. */
export interface AuditEntry {
  id: string;
  adminId: string;
  adminPhone: string;
  action: AdminAction;
  targetType: AuditTargetType;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

/** A listed driver as a search result: the card and how far it is from the yard. */
export interface DriverMatch {
  driver: Driver;
  distanceMiles: number;
}

/** The signed-in auth user, before any profile lookup. */
export interface SessionUser {
  id: string;
  phone: string;
}

export interface NavItem {
  href: string;
  label: string;
  /** A rendered icon element, for example <User />. Elements can cross the server/client boundary. */
  icon?: ReactNode;
}
