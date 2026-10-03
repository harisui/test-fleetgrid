import { FileText, MessageSquareText, Search } from "lucide-react";
import { SummaryCard } from "@/components/driver/SummaryCard";
import { ActionBar } from "@/components/onboarding/ActionBar";
import { OnboardingContent } from "@/components/onboarding/OnboardingShell";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { ROLE_HOME } from "@/lib/auth/routes";
import type { StepId } from "@/lib/onboarding/steps";
import { maskPhone } from "@/lib/phone";
import type { Driver } from "@/types/domain";

interface DoneScreenProps {
  driver: Driver;
  phone: string;
  onEdit: (stepId: StepId) => void;
}

const NEXT_STEPS = [
  {
    icon: Search,
    text: "A FleetGrid reviewer checks your profile, usually within one business day.",
  },
  { icon: MessageSquareText, text: "Shift offers arrive by text. Reply YES to claim one." },
  { icon: FileText, text: "You can add your CDL and medical card any time from Documents." },
] as const;

/**
 * The end of the road, rendered inside the onboarding shell. A plain statement of what
 * happened and what comes next. No animation.
 */
export function DoneScreen({ driver, phone, onEdit }: DoneScreenProps) {
  return (
    <>
      <OnboardingContent>
        <SignHeader
          eyebrow="Profile complete"
          title="You are listed."
          srText="Step 5 of 5: Finish. Profile complete."
        />
        <p>
          Carriers near {driver.zip} can now find you. We will text you at {maskPhone(phone)} when a
          carrier sends a shift.
        </p>
        <SummaryCard driver={driver} onEdit={onEdit} />
        <ul className="flex flex-col gap-3" aria-label="What happens next">
          {NEXT_STEPS.map((item) => (
            <li key={item.text} className="flex items-start gap-3 text-helper leading-helper">
              <item.icon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      </OnboardingContent>
      <ActionBar nextHref={ROLE_HOME.driver} nextLabel="Go to my profile" />
    </>
  );
}
