import { DeviceFrame } from "@/components/marketing/DeviceFrame";
import { LaneProgress } from "@/components/onboarding/LaneProgress";
import { SignHeader } from "@/components/onboarding/SignHeader";
import { progressFor } from "@/lib/onboarding/steps";

/** The sign-up's own progress bar on the CDL mile, drawn by the real components. */
export function LanePreview({ caption }: { caption?: string }) {
  const progress = progressFor("cdlClass");
  return (
    <DeviceFrame
      caption={caption ?? `The road through the sign-up: ${progress.eyebrow}, ${progress.mile.label}.`}
    >
      <SignHeader as="h2" eyebrow={progress.eyebrow} title={progress.mile.label} srText={progress.srLabel} />
      <LaneProgress stepId="cdlClass" />
      <p className="text-label leading-label font-semibold">What class is your CDL?</p>
    </DeviceFrame>
  );
}
