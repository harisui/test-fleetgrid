import type { ComponentType } from "react";
import type { z } from "zod";
import type { SavableStepId } from "@/lib/onboarding/steps";
import type {
  CdlClass,
  Driver,
  Endorsement,
  EquipmentType,
  MvrStatus,
  TransmissionType,
} from "@/types/domain";

/** Every field any onboarding screen can hold. One form, one set of keys. */
export interface OnboardingFormValues {
  fullName?: string;
  zip?: string;
  city?: string;
  state?: string;
  serviceRadiusMiles?: number;
  cdlClass?: CdlClass;
  yearsExperience?: number | null;
  mvrStatus?: MvrStatus;
  twicActive?: boolean;
  medicalCardActive?: boolean;
  endorsements?: Endorsement[];
  transmission?: TransmissionType;
  equipmentTypes?: EquipmentType[];
  consent?: boolean;
}

export type OnboardingField = keyof OnboardingFormValues;

export interface ScreenContext {
  driver: Driver | null;
  /** The signed-in driver's E.164 phone, for the consent and done screens. */
  phone: string;
}

/** Each screen shows its question as a label: a page holds every screen of its mile. */
export interface ScreenFieldsProps extends ScreenContext {
  question: string;
  helper?: string;
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
