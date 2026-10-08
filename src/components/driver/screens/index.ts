import { availabilityScreen } from "@/components/driver/screens/AvailabilityScreen";
import { bioScreen } from "@/components/driver/screens/BioScreen";
import { cdlClassScreen } from "@/components/driver/screens/CdlClassScreen";
import { certificationsScreen } from "@/components/driver/screens/CertificationsScreen";
import { complianceScreen } from "@/components/driver/screens/ComplianceScreen";
import { consentScreen } from "@/components/driver/screens/ConsentScreen";
import { credentialsScreen } from "@/components/driver/screens/CredentialsScreen";
import { distanceScreen } from "@/components/driver/screens/DistanceScreen";
import { documentsScreen } from "@/components/driver/screens/DocumentsScreen";
import { drivingStyleScreen } from "@/components/driver/screens/DrivingStyleScreen";
import { employmentTypeScreen } from "@/components/driver/screens/EmploymentTypeScreen";
import { endorsementsScreen } from "@/components/driver/screens/EndorsementsScreen";
import { equipmentScreen } from "@/components/driver/screens/EquipmentScreen";
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
  employmentType: employmentTypeScreen,
  drivingStyle: drivingStyleScreen,
  equipment: equipmentScreen,
  experience: experienceScreen,
  availability: availabilityScreen,
  cdlClass: cdlClassScreen,
  endorsements: endorsementsScreen,
  certifications: certificationsScreen,
  credentials: credentialsScreen,
  documents: documentsScreen,
  compliance: complianceScreen,
  bio: bioScreen,
  consent: consentScreen,
};
