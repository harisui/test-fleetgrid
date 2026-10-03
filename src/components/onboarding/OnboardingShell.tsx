import type { ReactNode } from "react";
import { HelpDialog } from "@/components/onboarding/HelpDialog";
import { LaneProgress } from "@/components/onboarding/LaneProgress";
import type { StepId } from "@/lib/onboarding/steps";

interface OnboardingShellProps {
  stepId: StepId;
  children: ReactNode;
  /** The sticky action bar, rendered below the content. */
  actionBar?: ReactNode;
}

/**
 * The frame around every onboarding screen: wordmark and Help in a graphite header, the
 * lane progress bar, a 560px content column, and the action bar. No app navigation, no
 * log out, no page title. Nothing competes with the question.
 */
export function OnboardingShell({ stepId, children, actionBar }: OnboardingShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background" data-slot="onboarding-shell">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-badge bg-card px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="bg-sign-panel text-sign-panel-foreground">
        <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-4">
          <span className="font-heading text-h2 leading-h2 font-bold tracking-wide">FLEETGRID</span>
          <HelpDialog />
        </div>
      </header>
      <div className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-content px-4 pt-2 pb-3">
          <LaneProgress stepId={stepId} />
        </div>
      </div>
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-content flex-1 flex-col gap-4 px-4 py-4 pb-8"
      >
        {children}
      </main>
      {actionBar}
    </div>
  );
}
