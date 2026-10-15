"use client";

import { Check, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RoadScene } from "@/components/marketing/RoadScene";
import { HOME } from "@/content/marketing";
import { nextShiftCode, SMS_SAMPLE_CODE, threadWithCode } from "@/content/sms-samples";
import { MOTION_CLASS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const HERO_PLAYING_CLASS = "is-playing";
export const HERO_START_DELAY_MS = 300;

/** The offer bubble's keyframes; its restart marks a new time round the loop. */
export const HERO_LOOP_ANIMATION = "hero-bubble-1";

interface HeroSceneProps {
  /** The phone card's header line: "FleetGrid", with the sending number only when the switch is on. */
  phoneHeader: string;
  /** Injected by tests for predictable shift codes. */
  random?: () => number;
}

/**
 * The hero's highway and phone. The phone is drawn finished in the server HTML: three
 * bubbles, progress full, SHIFT FILLED. When the page is marked for motion, the thread
 * starts empty and plays on a nine-second loop (globals.css keyframes), beginning 300ms
 * after the scene is in view with the tab visible. The first time round it is the exact
 * Twilio sample; every later round carries a fresh shift code in the offer and the reply,
 * swapped while the thread is cleared, so it reads as a new shift each time. The highway
 * underneath (RoadScene) rolls on its own. Reduced motion never marks the page, so both
 * stay on their still frame.
 */
export function HeroScene({ phoneHeader, random = Math.random }: HeroSceneProps) {
  const scene = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(SMS_SAMPLE_CODE);
  const thread = threadWithCode(code);

  useEffect(() => {
    const element = scene.current;
    if (!element || !document.documentElement.classList.contains(MOTION_CLASS)) return;

    // Each restart of the offer's keyframes is a new time round: a new shift, a new code.
    const onIteration = (event: Event) => {
      if ((event as AnimationEvent).animationName !== HERO_LOOP_ANIMATION) return;
      setCode((previous) => nextShiftCode(previous, random));
    };
    element.addEventListener("animationiteration", onIteration);

    if (typeof IntersectionObserver === "undefined") {
      element.classList.add(HERO_PLAYING_CLASS);
      return () => element.removeEventListener("animationiteration", onIteration);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || document.visibilityState !== "visible") return;
      observer.disconnect();
      timer = setTimeout(() => element.classList.add(HERO_PLAYING_CLASS), HERO_START_DELAY_MS);
    });
    observer.observe(element);
    return () => {
      element.removeEventListener("animationiteration", onIteration);
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [random]);

  return (
    <div
      ref={scene}
      data-slot="hero"
      className="relative mx-auto aspect-3/2 w-full max-w-lg lg:max-w-xl"
    >
      {/* The highway. Decorative; the phone card carries the description. */}
      <RoadScene className="absolute inset-0 h-full w-full" />

      {/* The phone, over the right side of the road: a graphite shell with the speaker slot
          and the home bar, the thread on its screen. The thread plays on a loop with motion
          (globals.css): the offer lands, the driver replies, the confirmation lands, the bar
          fills and SHIFT FILLED appears, then it clears and starts over. */}
      <div
        role="img"
        aria-label={HOME.hero.sceneLabel}
        data-slot="hero-phone"
        className="absolute top-2 right-2 flex w-56 flex-col rounded-sheet border border-border-strong bg-sign-panel p-1.5 shadow-1 sm:w-60"
      >
        <div aria-hidden="true" className="flex h-5 items-center justify-center">
          <span className="h-1 w-10 rounded-badge bg-sign-panel-muted" />
        </div>
        <div className="flex flex-col overflow-hidden rounded-card bg-card text-card-foreground">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-small leading-small font-semibold">
            <Smartphone aria-hidden="true" className="size-4 text-muted-foreground" />
            {phoneHeader}
          </div>
          <ol className="flex flex-col gap-2 p-3">
            {thread.map((bubble, index) => (
              <li
                key={index}
                data-slot="hero-bubble"
                data-bubble={index + 1}
                className={cn("flex", bubble.direction === "out" ? "justify-end" : "justify-start")}
              >
                <span
                  className={cn(
                    "max-w-11/12 rounded-card px-2 py-1.5 text-small leading-small",
                    bubble.direction === "out"
                      ? "bg-selection font-mono tracking-code text-selection-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {bubble.text}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <span className="relative h-2 flex-1 overflow-hidden rounded-badge bg-progress-track">
              <span
                data-slot="hero-fill"
                className="absolute inset-y-0 left-0 w-full origin-left rounded-badge bg-progress-fill"
              />
            </span>
            <span
              data-slot="hero-badge"
              className="flex items-center gap-1 rounded-badge bg-progress-fill px-1.5 py-0.5 font-heading text-small leading-small font-semibold tracking-eyebrow uppercase text-primary-foreground"
            >
              <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
              {HOME.hero.badge}
            </span>
          </div>
        </div>
        <div aria-hidden="true" className="flex h-4 items-center justify-center">
          <span className="h-1 w-12 rounded-badge bg-sign-panel-muted" />
        </div>
      </div>
    </div>
  );
}
