import { clearinghouseScreen } from "@/components/driver/screens/ClearinghouseScreen";
import { consentScreen } from "@/components/driver/screens/ConsentScreen";
import { credentialsScreen } from "@/components/driver/screens/CredentialsScreen";
import { distanceScreen } from "@/components/driver/screens/DistanceScreen";
import { endorsementsScreen } from "@/components/driver/screens/EndorsementsScreen";
import { equipmentScreen } from "@/components/driver/screens/EquipmentScreen";
import { experienceScreen } from "@/components/driver/screens/ExperienceScreen";
import { heardFromScreen } from "@/components/driver/screens/HeardFromScreen";
import { leadScreen } from "@/components/driver/screens/LeadScreen";
import { recordScreen } from "@/components/driver/screens/RecordScreen";
import { transmissionScreen } from "@/components/driver/screens/TransmissionScreen";
import type { ScreenDefinition } from "@/components/driver/screens/types";
import type { SavableStepId } from "@/lib/onboarding/steps";

/** One definition per savable screen, keyed like steps.ts. */
export const SCREENS: Record<SavableStepId, ScreenDefinition> = {
  lead: leadScreen,
  distance: distanceScreen,
  experience: experienceScreen,
  record: recordScreen,
  clearinghouse: clearinghouseScreen,
  credentials: credentialsScreen,
  endorsements: endorsementsScreen,
  transmission: transmissionScreen,
  equipment: equipmentScreen,
  heardFrom: heardFromScreen,
  consent: consentScreen,
};
