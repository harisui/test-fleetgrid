import { FileText, MessageSquareText, Search } from "lucide-react";
import { SummaryCard } from "@/components/driver/SummaryCard";
import { ActionBar } from "@/components/onboarding/ActionBar";
import { OnboardingContent } from "@/components/onboarding/OnboardingShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { ROLE_HOME } from "@/lib/auth/routes";
import { OUT_OF_AREA_DONE_TEXT, OUT_OF_AREA_DONE_TITLE } from "@/lib/launch";
import type { StepId } from "@/lib/onboarding/steps";
import { maskPhone } from "@/lib/phone";
import type { LocatedDriver } from "@/types/domain";

interface DoneScreenProps {
  driver: LocatedDriver;
  phone: string;
  onEdit: (stepId: StepId) => void;
}

const NEXT_STEPS = [
  {
    icon: Search,
    text: "A FleetGrid reviewer will check your profile.",
    /** Shift offers only come where FleetGrid is live. */
    inAreaOnly: false,
  },
  {
    icon: MessageSquareText,
    text: "Shift offers arrive by text. Reply YES to claim one.",
    inAreaOnly: true,
  },
  {
    icon: FileText,
    text: "You can add your CDL and medical card any time from Documents.",
    inAreaOnly: false,
  },
] as const;

/**
 * The end of the road, rendered inside the onboarding shell. A plain statement of what
 * happened and what comes next. No animation. A driver outside every launch area is told
 * so, and keeps the summary and the way to the profile.
 */
export function DoneScreen({ driver, phone, onEdit }: DoneScreenProps) {
  const outOfArea = driver.inServiceArea === false;
  return (
    <>
      <OnboardingContent>
        <div
          data-slot="done-screen"
          data-area={outOfArea ? "outside" : "inside"}
          className="contents"
        >
          <SignHeader
            eyebrow="Profile complete"
            title={outOfArea ? OUT_OF_AREA_DONE_TITLE : "You are listed."}
            srText="Step 5 of 5: Finish. Profile complete."
          />
          {outOfArea ? (
            <p>{OUT_OF_AREA_DONE_TEXT}</p>
          ) : (
            <p>
              Once your profile is approved, carriers near {driver.zip} can find you. We will text
              you at {maskPhone(phone)} when a carrier sends a shift.
            </p>
          )}
          <SummaryCard driver={driver} onEdit={onEdit} />
          <ul className="flex flex-col gap-3" aria-label="What happens next">
            {NEXT_STEPS.filter((item) => !outOfArea || !item.inAreaOnly).map((item) => (
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
