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

export const CDL_CLASSES = ["A", "B", "C", "none"] as const satisfies readonly CdlClass[];

export const ENDORSEMENTS = [
  "H",
  "N",
  "P",
  "S",
  "T",
  "X",
] as const satisfies readonly Endorsement[];

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

export const OPERATOR_TYPE_LABELS: Record<OperatorType, string> = {
  cdl_driver: "CDL driver",
  yard_spotter: "Yard spotter",
  mechanic: "Mechanic",
};

export const CDL_CLASS_LABELS: Record<CdlClass, string> = {
  A: "Class A",
  B: "Class B",
  C: "Class C",
  none: "No CDL",
};

export const ENDORSEMENT_LABELS: Record<Endorsement, string> = {
  H: "H - Hazardous materials",
  N: "N - Tank vehicles",
  P: "P - Passengers",
  S: "S - School bus",
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

export interface Profile {
  id: string;
  role: UserRole;
  phone: string;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
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
  availability: AvailabilityType[];
  certifications: string[];
  bio: string | null;
  smsOptIn: boolean;
  smsOptInAt: string | null;
  smsOptInText: string | null;
  smsOptedOut: boolean;
  smsOptedOutAt: string | null;
  onboardingStep: number;
  cardCompleted: boolean;
  createdAt: string;
  updatedAt: string;
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
