import { Check } from "lucide-react";
import Link from "next/link";
import { LoadingButton } from "@/components/shared/LoadingButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ActionBarProps {
  /** The form the Next button submits. Lets the bar live outside the form element. */
  formId?: string;
  /** A link instead of a submit button, for the done screen. */
  nextHref?: string;
  nextLabel?: string;
  pending?: boolean;
  nextDisabled?: boolean;
  onBack?: () => void;
  /** Shows "Saved" with a check after an auto-save. */
  saved?: boolean;
}

/**
 * Sticky bottom bar. "Saved" above, then Back (secondary) and Next (primary, orange, 56px),
 * each at least half the width. Padded for the iPhone home bar.
 */
export function ActionBar({
  formId,
  nextHref,
  nextLabel = "Next",
  pending = false,
  nextDisabled = false,
  onBack,
  saved = false,
}: ActionBarProps) {
  return (
    <div
      data-slot="action-bar"
      className="sticky bottom-0 z-30 border-t border-border bg-card shadow-1 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex w-full max-w-content flex-col gap-2 px-4 pt-3">
        <p
          aria-live="polite"
          data-slot="saved-indicator"
          className="flex min-h-5 items-center gap-1.5 text-small leading-small font-semibold text-muted-foreground"
        >
          {saved && (
            <>
              <Check aria-hidden="true" className="size-4 text-success" />
              Saved
            </>
          )}
        </p>
        <div className={cn("grid gap-3", onBack ? "grid-cols-2" : "grid-cols-1")}>
          {onBack && (
            <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
              Back
            </Button>
          )}
          {nextHref ? (
            <Button asChild>
              <Link href={nextHref}>{nextLabel}</Link>
            </Button>
          ) : (
            <LoadingButton
              type="submit"
              form={formId}
              loading={pending}
              loadingText="Saving..."
              disabled={nextDisabled}
            >
              {nextLabel}
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );
}
