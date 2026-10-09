import {
  ArrowLeftRight,
  Building2,
  Bus,
  CalendarDays,
  Car,
  Clock,
  Cog,
  Cylinder,
  FlaskConical,
  Forklift,
  Gauge,
  Handshake,
  House,
  Layers,
  Link2,
  Map,
  Phone,
  Route,
  Sun,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CERTIFICATION_DOCUMENTS_MAX } from "@/lib/constants";
import type {
  AvailabilityType,
  CdlClass,
  DocumentType,
  DrivingStyle,
  EmploymentType,
  Endorsement,
  EquipmentType,
  MvrStatus,
  TransmissionType,
} from "@/types/domain";

/**
 * Everything a driver can pick during onboarding: labels, one-line descriptions and the icon
 * for each choice. Plain words first. The official term, if any, comes second.
 */

export interface CardOption<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** Profile page only since 2026-10-09; sign-up no longer asks. */
export const EMPLOYMENT_HELPER =
  "W-2 means you are on a company's payroll. 1099 means you contract or run your own truck.";

export const EMPLOYMENT_TYPE_OPTIONS: readonly CardOption<EmploymentType>[] = [
  {
    value: "w2",
    label: "W-2 employee",
    description: "On the carrier's payroll",
    icon: Building2,
  },
  {
    value: "owner_operator_1099",
    label: "1099 owner-operator",
    description: "Your own truck or a contract",
    icon: Handshake,
  },
  {
    value: "either",
    label: "Either works",
    description: "Open to both",
    icon: ArrowLeftRight,
  },
];

/** Profile page only since 2026-10-09; sign-up no longer asks. */
export const DRIVING_STYLE_OPTIONS: readonly CardOption<DrivingStyle>[] = [
  {
    value: "local_day_cab",
    label: "Local day cab",
    description: "Home every night",
    icon: House,
  },
  {
    value: "yard_spotter",
    label: "Yard spotter",
    description: "Trailers around a yard or port",
    icon: Forklift,
  },
  { value: "regional", label: "Regional", description: "Out a few nights a week", icon: Map },
  { value: "otr", label: "OTR (over the road)", description: "Long hauls, weeks out", icon: Route },
];

export const TRANSMISSION_QUESTION = "Can you drive a manual?";

export const TRANSMISSION_OPTIONS: readonly CardOption<TransmissionType>[] = [
  {
    value: "automatic_only",
    label: "Automatic only",
    description: "No manual gearbox",
    icon: Gauge,
  },
  {
    value: "manual_ok",
    label: "Automatic and manual",
    description: "I can shift gears",
    icon: Cog,
  },
];

export const AVAILABILITY_OPTIONS: readonly CardOption<AvailabilityType>[] = [
  { value: "full_time", label: "Full time", description: "40 hours a week or more", icon: Sun },
  { value: "part_time", label: "Part time", description: "Some days or some hours", icon: Clock },
  { value: "on_call", label: "On call", description: "Text me when a shift opens", icon: Phone },
  { value: "weekends", label: "Weekends", description: "Saturday and Sunday", icon: CalendarDays },
];

/** A, B or C. FleetGrid lists CDL drivers only at launch, so there is no "No CDL" card. */
export const CDL_CLASS_OPTIONS: readonly CardOption<CdlClass>[] = [
  { value: "A", label: "Class A", description: "Tractor-trailers and big rigs", icon: Truck },
  { value: "B", label: "Class B", description: "Straight trucks, buses, dump trucks", icon: Bus },
  {
    value: "C",
    label: "Class C",
    description: "Passenger vans (16+) and small hazmat vehicles",
    icon: Car,
  },
];

/** Shown in the order drivers most often hold them. Each letter has its own icon. */
export const ENDORSEMENT_OPTIONS: readonly CardOption<Endorsement>[] = [
  { value: "X", label: "X", description: "Tank and hazmat", icon: Layers },
  { value: "H", label: "H", description: "Hazmat", icon: FlaskConical },
  { value: "N", label: "N", description: "Tank vehicles", icon: Cylinder },
  { value: "T", label: "T", description: "Doubles and triples", icon: Link2 },
  { value: "P", label: "P", description: "Passengers", icon: Users },
  { value: "S", label: "S", description: "School bus", icon: Bus },
];

export const ENDORSEMENT_X_NOTE = "X includes H and N.";
export const ENDORSEMENT_S_NOTE =
  "S includes P. School bus drivers also need the passenger endorsement.";

/**
 * Applies the endorsement rules after one letter is tapped:
 * picking X also picks H and N; dropping H or N also drops X;
 * picking S also picks P (federal rule); dropping P also drops S.
 */
export function toggleEndorsement(
  current: readonly Endorsement[],
  letter: Endorsement,
): Endorsement[] {
  const selected = new Set(current);
  if (selected.has(letter)) {
    selected.delete(letter);
    if (letter === "H" || letter === "N") selected.delete("X");
    if (letter === "P") selected.delete("S");
  } else {
    selected.add(letter);
    if (letter === "X") {
      selected.add("H");
      selected.add("N");
    }
    if (letter === "S") selected.add("P");
  }
  return ENDORSEMENT_OPTIONS.map((option) => option.value).filter((value) => selected.has(value));
}

/** The same rules for saved data: X always comes with H and N, S with P. Keeps the display order. */
export function normalizeEndorsements(values: readonly Endorsement[]): Endorsement[] {
  const selected = new Set(values);
  if (selected.has("X")) {
    selected.add("H");
    selected.add("N");
  }
  if (selected.has("S")) selected.add("P");
  return ENDORSEMENT_OPTIONS.map((option) => option.value).filter((value) => selected.has(value));
}

export interface ChipOption<T> {
  value: T;
  label: string;
}

export const DISTANCE_CHIPS: readonly ChipOption<number>[] = [
  { value: 10, label: "10 miles" },
  { value: 25, label: "25 miles" },
  { value: 50, label: "50 miles" },
  { value: 100, label: "100 miles" },
  { value: 250, label: "250 miles or more" },
];

/** Chips, pick all that apply. */
export const EQUIPMENT_CHIPS: readonly ChipOption<EquipmentType>[] = [
  { value: "container_drayage", label: "Container drayage" },
  { value: "dry_van", label: "Dry van" },
  { value: "flatbed", label: "Flatbed" },
  { value: "reefer", label: "Reefer" },
  { value: "yard_mule", label: "Yard mule" },
];

/**
 * Experience ranges. The stored number is the lower bound of the chip. A card saved under the
 * old flow may hold an exact number; it shows as the chip that contains it.
 */
export const EXPERIENCE_CHIPS: readonly (ChipOption<number> & { max: number })[] = [
  { value: 0, max: 0, label: "Under 1" },
  { value: 1, max: 2, label: "1 to 2" },
  { value: 3, max: 5, label: "3 to 5" },
  { value: 6, max: 9, label: "6 to 10" },
  { value: 10, max: 60, label: "10 or more" },
];

/** The range chip that contains an exact number of years, or null when nothing is set. */
export function experienceChipFor(years: number | null | undefined): number | null {
  if (years === null || years === undefined || Number.isNaN(years)) return null;
  const chip = EXPERIENCE_CHIPS.find(
    (candidate) => years >= candidate.value && years <= candidate.max,
  );
  return chip ? chip.value : null;
}

/** A yes-or-no answer on the card: the question and the words on its two chips. */
export interface CheckOption {
  question: string;
  yes: string;
  no: string;
  /** How the answer reads on the summary card and the profile. */
  summary: { yes: string; no: string };
}

/** The three yes-or-no checks. TWIC and medical card are asked at sign-up; the Clearinghouse on the profile. */
export const CARD_CHECKS = {
  twicActive: {
    question: "Do you have an active TWIC card?",
    yes: "Yes",
    no: "No",
    summary: { yes: "TWIC", no: "No TWIC" },
  },
  medicalCardActive: {
    question: "Is your DOT medical card current?",
    yes: "Yes",
    no: "No",
    summary: { yes: "medical card current", no: "medical card not current" },
  },
  clearinghouseRegistered: {
    question: "Are you registered in the FMCSA Clearinghouse?",
    yes: "Registered",
    no: "Not yet",
    summary: { yes: "In the Clearinghouse", no: "Not in the Clearinghouse" },
  },
} as const satisfies Record<string, CheckOption>;

export type CardCheck = keyof typeof CARD_CHECKS;

/** The MVR in three levels (client decision of 2026-10-09). */
export const MVR_QUESTION = "Any moving violations in the last 3 years?";
export const MVR_HELPER =
  "Major means a DUI, reckless driving, leaving the scene or a suspended license.";

export const MVR_CHIPS: readonly ChipOption<MvrStatus>[] = [
  { value: "clean", label: "None" },
  { value: "minor_1_2", label: "1 or 2 minor" },
  { value: "major_3_plus", label: "3 or more, or a major one" },
];

/** How each level reads on the summary card. */
export const MVR_SUMMARY: Record<MvrStatus, string> = {
  clean: "No violations in 3 years",
  minor_1_2: "1 or 2 minor violations in 3 years",
  major_3_plus: "3 or more or a major violation in 3 years",
};

export const CREDENTIALS_HELPER = "Carriers ask for both. You can update these any time.";

export interface DocumentTile {
  type: DocumentType;
  label: string;
  /** Shown under the label instead of the file rules. */
  helper?: string;
  /** How many files the tile holds. One means a new upload replaces the old file. */
  max: number;
}

/** Proof of certifications: TWIC, forklift cards and the like. */
export const OTHER_PAPERS_TILE: DocumentTile = {
  type: "certification",
  label: "Other papers",
  helper: "TWIC card, forklift card, other certificates",
  max: CERTIFICATION_DOCUMENTS_MAX,
};

/**
 * The tiles of the Documents page. Sign-up no longer asks for papers (client decision of
 * 2026-10-09); the CDL photos are asked for when a shift comes up (Milestone 3).
 */
export const ONBOARDING_DOCUMENT_TILES: readonly DocumentTile[] = [
  { type: "cdl_front", label: "Front of your CDL", max: 1 },
  { type: "cdl_back", label: "Back of your CDL", max: 1 },
  { type: "medical_card", label: "Medical card", max: 1 },
  OTHER_PAPERS_TILE,
];
