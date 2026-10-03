import { availabilityScreen } from "@/components/driver/screens/AvailabilityScreen";
import { bioScreen } from "@/components/driver/screens/BioScreen";
import { cdlClassScreen } from "@/components/driver/screens/CdlClassScreen";
import { certificationsScreen } from "@/components/driver/screens/CertificationsScreen";
import { consentScreen } from "@/components/driver/screens/ConsentScreen";
import { distanceScreen } from "@/components/driver/screens/DistanceScreen";
import { documentsScreen } from "@/components/driver/screens/DocumentsScreen";
import { endorsementsScreen } from "@/components/driver/screens/EndorsementsScreen";
import { experienceScreen } from "@/components/driver/screens/ExperienceScreen";
import { nameScreen } from "@/components/driver/screens/NameScreen";
import type { ScreenDefinition } from "@/components/driver/screens/types";
import { workTypeScreen } from "@/components/driver/screens/WorkTypeScreen";
import { zipScreen } from "@/components/driver/screens/ZipScreen";
import type { SavableStepId } from "@/lib/onboarding/steps";

/** One definition per savable screen, keyed like steps.ts. */
export const SCREENS: Record<SavableStepId, ScreenDefinition> = {
  name: nameScreen,
  zip: zipScreen,
  distance: distanceScreen,
  workType: workTypeScreen,
  experience: experienceScreen,
  availability: availabilityScreen,
  cdlClass: cdlClassScreen,
  endorsements: endorsementsScreen,
  certifications: certificationsScreen,
  documents: documentsScreen,
  bio: bioScreen,
  consent: consentScreen,
};
