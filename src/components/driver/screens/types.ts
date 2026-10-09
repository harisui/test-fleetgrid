import type { ComponentType } from "react";
import type { z } from "zod";
import type { SavableStepId } from "@/lib/onboarding/steps";
import type {
  AvailabilityType,
  CdlClass,
  Driver,
  DriverDocument,
  DrivingStyle,
  EmploymentType,
  Endorsement,
  EquipmentType,
  MvrStatus,
  OperatorType,
  TransmissionType,
} from "@/types/domain";

/** Every field any onboarding screen can hold. One form, one set of keys. */
export interface OnboardingFormValues {
  fullName?: string;
  zip?: string;
  city?: string;
  state?: string;
  serviceRadiusMiles?: number;
  operatorTypes?: OperatorType[];
  employmentType?: EmploymentType;
  drivingStyles?: DrivingStyle[];
  transmission?: TransmissionType;
  equipmentTypes?: EquipmentType[];
  yearsExperience?: number | null;
  availability?: AvailabilityType[];
  cdlClass?: CdlClass;
  endorsements?: Endorsement[];
  certifications?: string[];
  twicActive?: boolean;
  medicalCardActive?: boolean;
  clearinghouseRegistered?: boolean;
  mvrStatus?: MvrStatus;
  bio?: string;
  consent?: boolean;
}

export type OnboardingField = keyof OnboardingFormValues;

export interface ScreenContext {
  driver: Driver | null;
  /** The signed-in driver's E.164 phone, for the consent and done screens. */
  phone: string;
  /** Papers uploaded so far, for the Papers screen. */
  documents: DriverDocument[];
}

export interface ScreenFieldsProps extends ScreenContext {
  /** On wide screens a mile's questions share one page, so each one shows its question. */
  showQuestion: boolean;
  question: string;
  helper?: string;
  onDocumentsChange: (documents: DriverDocument[]) => void;
}

/** What the flow needs to know about one screen. The fields live in the component. */
export interface ScreenDefinition {
  id: SavableStepId;
  fields: OnboardingField[];
  schema: (context: ScreenContext) => z.ZodType;
  defaults: (driver: Driver | null) => Partial<OnboardingFormValues>;
  Fields: ComponentType<ScreenFieldsProps>;
  /** Label of the Next button. Defaults to "Next". */
  nextLabel?: (values: OnboardingFormValues, context: ScreenContext) => string;
  /** True when Next must stay disabled until the driver resolves something on the screen. */
  blocked?: (values: OnboardingFormValues, context: ScreenContext) => boolean;
}
