"use client";

import { BatteryFull, Check, Signal, Smartphone, Wifi } from "lucide-react";
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
      className="relative mx-auto flex w-full max-w-lg justify-end p-2 lg:max-w-xl"
    >
      {/* The highway fills the box behind the phone, which sets the box's height; the road's
          sides are cropped on narrow screens. Decorative; the phone carries the description. */}
      <RoadScene className="absolute inset-0 h-full w-full" />

      {/* The phone, over the right side of the road, in the proportions of a 6.3-inch iPhone
          18 Pro (71.9 by 150mm body, bezels under 3mm, the island about 13.5mm wide): the
          graphite shell with the Action button and the volume keys on the left, the side
          button and Camera Control on the right, the camera island, a status row, the
          thread as a messages screen, the shift bar at the bottom and the home bar. The
          thread plays on a loop with motion (globals.css): the offer lands, the driver
          replies, the confirmation lands, the bar fills and SHIFT FILLED appears, then it
          clears and starts over. */}
      <div
        role="img"
        aria-label={HOME.hero.sceneLabel}
        data-slot="hero-phone"
        className="relative flex aspect-phone w-56 shrink-0 flex-col rounded-phone bg-sign-panel p-2 shadow-2 ring-1 ring-border-strong lg:w-64 lg:p-2.5"
      >
        {/* The side buttons: Action and the two volume keys on the left, the side button and Camera Control on the right. */}
        <span aria-hidden="true" className="absolute top-20 -left-1 h-6 w-1 rounded-round bg-sign-panel" />
        <span aria-hidden="true" className="absolute top-30 -left-1 h-10 w-1 rounded-round bg-sign-panel" />
        <span aria-hidden="true" className="absolute top-42 -left-1 h-10 w-1 rounded-round bg-sign-panel" />
        <span aria-hidden="true" className="absolute top-32 -right-1 h-16 w-1 rounded-round bg-sign-panel" />
        <span aria-hidden="true" className="absolute top-80 -right-1 h-9 w-1 rounded-round bg-sign-panel" />

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-screen bg-card text-card-foreground">
          {/* The camera island, about a fifth of the width. */}
          <span aria-hidden="true" className="absolute top-2 left-1/2 h-4 w-10 -translate-x-1/2 rounded-round bg-sign-panel sm:w-12" />
          {/* The status row: the clock and the indicators. */}
          <div aria-hidden="true" className="flex items-center justify-between px-3 pt-2 text-small leading-small font-semibold sm:px-4 sm:pt-2.5">
            <span>6:02</span>
            <span className="flex items-center gap-1 text-foreground">
              <Signal className="size-3" strokeWidth={2.5} />
              <Wifi className="size-3" strokeWidth={2.5} />
              <BatteryFull className="size-3.5" strokeWidth={2.5} />
            </span>
          </div>
          {/* The conversation header. */}
          <div className="flex flex-col items-center gap-1 border-b border-border px-3 pt-2 pb-2">
            <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-round bg-progress-fill text-primary-foreground">
              <Smartphone className="size-3.5" strokeWidth={2.5} />
            </span>
            <span className="text-small leading-small font-semibold">{phoneHeader}</span>
          </div>
          <ol className="flex flex-col gap-2 px-2.5 py-3">
            {thread.map((bubble, index) => (
              <li
                key={index}
                data-slot="hero-bubble"
                data-bubble={index + 1}
                className={cn("flex", bubble.direction === "out" ? "justify-end" : "justify-start")}
              >
                <span
                  className={cn(
                    "max-w-11/12 rounded-bubble px-2.5 py-1.5 text-small leading-small",
                    bubble.direction === "out"
                      ? "rounded-br-badge bg-selection font-mono tracking-code text-selection-foreground"
                      : "rounded-bl-badge bg-muted text-foreground",
                  )}
                >
                  {bubble.text}
                </span>
              </li>
            ))}
          </ol>
          {/* The shift bar, where the compose field would be, then the home bar. */}
          <div className="mt-auto flex items-center gap-2 border-t border-border px-3 pt-2 pb-1">
            <span className="relative h-2 flex-1 overflow-hidden rounded-round bg-progress-track">
              <span
                data-slot="hero-fill"
                className="absolute inset-y-0 left-0 w-full origin-left rounded-round bg-progress-fill"
              />
            </span>
            <span
              data-slot="hero-badge"
              className="flex items-center gap-1 rounded-round bg-progress-fill px-2 py-0.5 font-heading text-small leading-small font-semibold tracking-eyebrow uppercase text-primary-foreground"
            >
              <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
              {HOME.hero.badge}
            </span>
          </div>
          <div aria-hidden="true" className="flex h-4 items-center justify-center">
            <span className="h-1 w-14 rounded-round bg-foreground opacity-40" />
          </div>
        </div>
      </div>
    </div>
  );
}
