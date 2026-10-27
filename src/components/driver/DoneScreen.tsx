import { FileText, MessageSquareOff, MessageSquareText } from "lucide-react";
import { SummaryCard } from "@/components/driver/SummaryCard";
import { ActionBar } from "@/components/onboarding/ActionBar";
import { OnboardingContent } from "@/components/onboarding/OnboardingShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { SignupConversion } from "@/components/seo/SignupConversion";
import { ROLE_HOME } from "@/lib/auth/routes";
import {
  DONE_TEXT,
  DONE_TEXT_SMS,
  DONE_TITLE,
  OUT_OF_AREA_DONE_TEXT,
  OUT_OF_AREA_DONE_TITLE,
} from "@/lib/launch";
import { MILES, type StepId } from "@/lib/onboarding/steps";
import type { LocatedDriver } from "@/types/domain";

interface DoneScreenProps {
  driver: LocatedDriver;
  onEdit: (stepId: StepId) => void;
}

/** Shown when the driver finished without ticking the shift-text box. */
export const NO_TEXTS_NEXT_STEP =
  "You chose not to receive shift texts. Turn them on from your profile when you want offers.";

const NEXT_STEPS = [
  {
    icon: MessageSquareText,
    text: "Shift offers arrive by text. Reply YES to claim one.",
    /** Only where FleetGrid is live, and only for drivers who said yes to texts. */
    when: "texts" as const,
  },
  {
    icon: MessageSquareOff,
    text: NO_TEXTS_NEXT_STEP,
    /** Only for drivers who left the shift-text box unticked. */
    when: "declined" as const,
  },
  {
    icon: FileText,
    text: "You can add your CDL and medical card any time from Documents.",
    when: "always" as const,
  },
];

/**
 * The end of the road, rendered inside the onboarding shell, in the client's words
 * (2026-10-25): the profile is under review, carriers find approved drivers, and the SMS
 * line only for drivers who said yes to shift texts. No animation. A driver outside every
 * launch area is told so, and keeps the summary and the way to the profile.
 */
export function DoneScreen({ driver, onEdit }: DoneScreenProps) {
  const outOfArea = driver.inServiceArea === false;
  const textsOn = driver.smsOptIn && !driver.smsOptedOut;
  const nextSteps = NEXT_STEPS.filter((item) => {
    if (item.when === "texts") return !outOfArea && textsOn;
    if (item.when === "declined") return !driver.smsOptIn;
    return true;
  });
  return (
    <>
      <OnboardingContent>
        <div
          data-slot="done-screen"
          data-area={outOfArea ? "outside" : "inside"}
          data-texts={textsOn ? "on" : "off"}
          className="contents"
        >
          {/* Counts the finished sign-up for Google Ads, where that is configured. */}
          <SignupConversion />
          <SignHeader
            eyebrow="Profile complete"
            title={outOfArea ? OUT_OF_AREA_DONE_TITLE : DONE_TITLE}
            srText={`Step ${MILES.length} of ${MILES.length}: Finish. Profile complete.`}
          />
          <p data-slot="done-text">
            {outOfArea ? OUT_OF_AREA_DONE_TEXT : textsOn ? `${DONE_TEXT} ${DONE_TEXT_SMS}` : DONE_TEXT}
          </p>
          <SummaryCard driver={driver} onEdit={onEdit} />
          <ul className="flex flex-col gap-3" aria-label="What happens next">
            {nextSteps.map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-helper leading-helper">
                <item.icon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </OnboardingContent>
      <ActionBar nextHref={ROLE_HOME.driver} nextLabel="Go to my profile" />
    </>
  );
}
