import type { ReactNode } from "react";
import { HelpSheet } from "@/components/onboarding/HelpSheet";
import { LaneProgress } from "@/components/onboarding/LaneProgress";
import { Logo } from "@/components/shared/Logo";
import type { StepId } from "@/lib/onboarding/steps";
import type { SupportContact } from "@/lib/support";

interface OnboardingShellProps {
  stepId: StepId;
  /** The screen: an `OnboardingContent` column, then its action bar. */
  children: ReactNode;
  /** Shown in the Help sheet. */
  support?: SupportContact;
}

/**
 * The frame around every onboarding screen: wordmark and Help in a graphite header, the
 * lane progress bar, then the screen. No app navigation, no log out, no page title. Nothing
 * competes with the question. The shell stays mounted while screens change inside it, so
 * the road animates from one step to the next instead of being redrawn.
 */
export function OnboardingShell({ stepId, children, support }: OnboardingShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background" data-slot="onboarding-shell">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-badge bg-card px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      {/* The road is part of the banner, so every piece of the page sits in a landmark. */}
      <header>
        <div className="bg-sign-panel text-sign-panel-foreground">
          <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-4">
            <Logo height={34} />
            <HelpSheet support={support} />
          </div>
        </div>
        <div className="border-b border-border bg-card text-foreground">
          <div className="mx-auto w-full max-w-content px-4 pt-2 pb-3">
            <LaneProgress stepId={stepId} />
          </div>
        </div>
      </header>
      {/* The action bar belongs to the main content, so it too sits in a landmark. */}
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}

/** The 560px content column of a screen. The action bar follows it, outside the column. */
export function OnboardingContent({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-4 px-4 py-4 pb-8">
      {children}
    </div>
  );
}
