"use client";

import { Check, Smartphone } from "lucide-react";
import { useEffect, useRef } from "react";
import { RoadScene } from "@/components/marketing/RoadScene";
import { HOME } from "@/content/marketing";
import { SMS_SAMPLE_THREAD } from "@/content/sms-samples";
import { MOTION_CLASS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const HERO_PLAYING_CLASS = "is-playing";
export const HERO_START_DELAY_MS = 300;

interface HeroSceneProps {
  /** The phone card's header line: "FleetGrid", with the sending number only when the switch is on. */
  phoneHeader: string;
}

/**
 * The hero's highway and phone. The phone card is drawn finished in the server HTML: three
 * bubbles, progress full, SHIFT FILLED. When the page is marked for motion, the card starts
 * at frame zero and plays once (globals.css keyframes), 300ms after it is in view with the
 * tab visible. The highway underneath (RoadScene) rolls on its own for as long as the scene
 * is on screen. Reduced motion never marks the page, so both stay on their still frame.
 */
export function HeroScene({ phoneHeader }: HeroSceneProps) {
  const scene = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scene.current;
    if (!element || !document.documentElement.classList.contains(MOTION_CLASS)) return;
    if (typeof IntersectionObserver === "undefined") {
      element.classList.add(HERO_PLAYING_CLASS);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || document.visibilityState !== "visible") return;
      observer.disconnect();
      timer = setTimeout(() => element.classList.add(HERO_PLAYING_CLASS), HERO_START_DELAY_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={scene}
      data-slot="hero"
      className="relative mx-auto aspect-3/2 w-full max-w-lg lg:max-w-xl"
    >
      {/* The highway. Decorative; the phone card carries the description. */}
      <RoadScene className="absolute inset-0 h-full w-full" />

      {/* The phone card, over the right side of the road. */}
      <div
        role="img"
        aria-label={HOME.hero.sceneLabel}
        data-slot="hero-phone"
        className="absolute top-2 right-2 flex w-56 flex-col overflow-hidden rounded-card border border-border bg-card shadow-0 sm:w-60"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-small leading-small font-semibold">
          <Smartphone aria-hidden="true" className="size-4 text-muted-foreground" />
          {phoneHeader}
        </div>
        <ol className="flex flex-col gap-2 p-3">
          {SMS_SAMPLE_THREAD.map((bubble, index) => (
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
    </div>
  );
}
