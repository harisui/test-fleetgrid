import {
  Bus,
  CalendarDays,
  Car,
  CircleOff,
  Clock,
  Cylinder,
  FlaskConical,
  Forklift,
  Layers,
  Link2,
  Phone,
  Sun,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { CERTIFICATION_DOCUMENTS_MAX } from "@/lib/constants";
import type {
  AvailabilityType,
  CdlClass,
  DocumentType,
  Endorsement,
  OperatorType,
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

export const WORK_TYPE_OPTIONS: readonly CardOption<OperatorType>[] = [
  {
    value: "cdl_driver",
    label: "CDL driver",
    description: "Drive trucks that need a CDL",
    icon: Truck,
  },
  {
    value: "yard_spotter",
    label: "Yard spotter",
    description: "Move trailers around a yard",
    icon: Forklift,
  },
  { value: "mechanic", label: "Mechanic", description: "Repair and service trucks", icon: Wrench },
];

export const AVAILABILITY_OPTIONS: readonly CardOption<AvailabilityType>[] = [
  { value: "full_time", label: "Full time", description: "40 hours a week or more", icon: Sun },
  { value: "part_time", label: "Part time", description: "Some days or some hours", icon: Clock },
  { value: "on_call", label: "On call", description: "Text me when a shift opens", icon: Phone },
  { value: "weekends", label: "Weekends", description: "Saturday and Sunday", icon: CalendarDays },
];

export const CDL_CLASS_OPTIONS: readonly CardOption<CdlClass>[] = [
  { value: "A", label: "Class A", description: "Tractor-trailers and big rigs", icon: Truck },
  { value: "B", label: "Class B", description: "Straight trucks, buses, dump trucks", icon: Bus },
  {
    value: "C",
    label: "Class C",
    description: "Passenger vans (16+) and small hazmat vehicles",
    icon: Car,
  },
  { value: "none", label: "No CDL", description: "Fine for yard and shop work", icon: CircleOff },
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

/**
 * Applies the endorsement rules after one letter is tapped:
 * picking X also picks H and N; dropping H or N also drops X.
 */
export function toggleEndorsement(
  current: readonly Endorsement[],
  letter: Endorsement,
): Endorsement[] {
  const selected = new Set(current);
  if (selected.has(letter)) {
    selected.delete(letter);
    if (letter === "H" || letter === "N") selected.delete("X");
  } else {
    selected.add(letter);
    if (letter === "X") {
      selected.add("H");
      selected.add("N");
    }
  }
  return ENDORSEMENT_OPTIONS.map((option) => option.value).filter((value) => selected.has(value));
}

/** The same rule for saved data: X always comes with H and N. Keeps the display order. */
export function normalizeEndorsements(values: readonly Endorsement[]): Endorsement[] {
  const selected = new Set(values);
  if (selected.has("X")) {
    selected.add("H");
    selected.add("N");
  }
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

/** Experience ranges. The stored number is the lower bound unless the driver types an exact one. */
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

export const CERTIFICATION_SUGGESTIONS = ["Forklift", "TWIC", "OSHA 10", "ASE"] as const;

export interface DocumentTile {
  type: DocumentType;
  label: string;
  /** Shown under the label instead of the file rules. */
  helper?: string;
  /** How many files the tile holds. One means a new upload replaces the old file. */
  max: number;
}

/** Proof of the certifications listed on screen 9: TWIC, forklift cards and the like. */
export const OTHER_PAPERS_TILE: DocumentTile = {
  type: "certification",
  label: "Other papers",
  helper: "TWIC card, forklift card, other certificates",
  max: CERTIFICATION_DOCUMENTS_MAX,
};

/** The papers asked for during onboarding. The same tiles appear on the Documents page. */
export const ONBOARDING_DOCUMENT_TILES: readonly DocumentTile[] = [
  { type: "cdl_front", label: "Front of your CDL", max: 1 },
  { type: "cdl_back", label: "Back of your CDL", max: 1 },
  { type: "medical_card", label: "Medical card", max: 1 },
  OTHER_PAPERS_TILE,
];
