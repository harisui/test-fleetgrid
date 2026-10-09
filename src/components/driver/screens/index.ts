import { cdlClassScreen } from "@/components/driver/screens/CdlClassScreen";
import { consentScreen } from "@/components/driver/screens/ConsentScreen";
import { credentialsScreen } from "@/components/driver/screens/CredentialsScreen";
import { distanceScreen } from "@/components/driver/screens/DistanceScreen";
import { endorsementsScreen } from "@/components/driver/screens/EndorsementsScreen";
import { equipmentScreen } from "@/components/driver/screens/EquipmentScreen";
import { experienceScreen } from "@/components/driver/screens/ExperienceScreen";
import { nameScreen } from "@/components/driver/screens/NameScreen";
import { recordScreen } from "@/components/driver/screens/RecordScreen";
import { transmissionScreen } from "@/components/driver/screens/TransmissionScreen";
import type { ScreenDefinition } from "@/components/driver/screens/types";
import { zipScreen } from "@/components/driver/screens/ZipScreen";
import type { SavableStepId } from "@/lib/onboarding/steps";

/** One definition per savable screen, keyed like steps.ts. */
export const SCREENS: Record<SavableStepId, ScreenDefinition> = {
  name: nameScreen,
  zip: zipScreen,
  distance: distanceScreen,
  cdlClass: cdlClassScreen,
  experience: experienceScreen,
  record: recordScreen,
  credentials: credentialsScreen,
  endorsements: endorsementsScreen,
  transmission: transmissionScreen,
  equipment: equipmentScreen,
  consent: consentScreen,
};
