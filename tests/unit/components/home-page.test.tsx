import { act, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LandingPage from "@/app/(public)/page";
import { HERO_PLAYING_CLASS, HeroScene } from "@/components/marketing/HeroScene";
import { HOME } from "@/content/marketing";
import { SMS_SAMPLE_CONFIRMATION, SMS_SAMPLE_OFFER, SMS_SAMPLE_REPLY } from "@/content/sms-samples";
import { resetEnvCache } from "@/lib/env";
import { MOTION_CLASS } from "@/lib/motion";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

function stubIntersectionObserver() {
  const observers: { callback: IOCallback; observed: Element[] }[] = [];
  class FakeObserver {
    observed: Element[] = [];
    constructor(public callback: IOCallback) {
      observers.push(this);
    }
    observe(element: Element) {
      this.observed.push(element);
    }
    unobserve() {}
    disconnect() {
      this.observed = [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return observers;
}

beforeEach(() => {
  document.documentElement.className = "";
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("home page", () => {
  it("has one H1, the two calls to action, the small print, the opt-in line and the launch line", () => {
    render(<LandingPage />);
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(HOME.hero.title);
    const hero = screen.getByRole("region", { name: HOME.hero.title });
    const find = within(hero).getByRole("link", { name: "Find drivers" });
    expect(find).toHaveAttribute("href", "/carriers");
    expect(find).toHaveAttribute("data-variant", "primary");
    expect(find).toHaveClass("h-target-lg");
    const drive = within(hero).getByRole("link", { name: "Sign up to drive, free" });
    expect(drive).toHaveAttribute("href", "/login?role=driver");
    expect(drive).toHaveAttribute("data-variant", "secondary");
    expect(hero.querySelector("[data-slot=hero-small-print]")).toHaveTextContent(
      "Carriers $399 a month, cancel anytime. Free for drivers.",
    );
    const optIn = hero.querySelector("[data-slot=sms-opt-in-line]") as HTMLElement;
    expect(optIn).toHaveTextContent("Drivers can opt in to receive shift offers by text. See SMS Terms.");
    expect(within(optIn).getByRole("link", { name: "SMS Terms" })).toHaveAttribute("href", "/sms-terms");
    expect(hero.querySelector("[data-slot=launch-line]")).toHaveTextContent("Now launching in the Houston area.");
  });

  it("the hero scene is described once, carries the Twilio sample thread, and names no number by default", () => {
    render(<LandingPage />);
    const phone = screen.getByRole("img", { name: HOME.hero.sceneLabel });
    expect(phone).toHaveTextContent("FleetGrid");
    expect(phone).not.toHaveTextContent("869-2040");
    expect(phone).toHaveTextContent(SMS_SAMPLE_OFFER);
    expect(phone).toHaveTextContent(SMS_SAMPLE_REPLY);
    expect(phone.querySelector("[data-slot=hero-badge]")).toHaveTextContent("Shift filled");
    // A phone: graphite shell on the sheet radius, the screen inside, three bubbles in order.
    expect(phone).toHaveClass("bg-sign-panel", "rounded-sheet");
    expect([...phone.querySelectorAll("[data-slot=hero-bubble]")].map((el) => el.getAttribute("data-bubble"))).toEqual(["1", "2", "3"]);
    expect(document.querySelector("[data-slot=hero-road]")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector("[data-slot=hero-road]")).toHaveAttribute("width", "480");
  });

  it("names the texting number in the phone header only with NEXT_PUBLIC_SHOW_SMS_NUMBER", () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_SMS_NUMBER", "true");
    resetEnvCache();
    render(<LandingPage />);
    expect(screen.getByRole("img", { name: HOME.hero.sceneLabel })).toHaveTextContent(
      "FleetGrid · (888) 869-2040",
    );
  });

  it("shows the two sides, the four miles, the three tiles and the review panel", () => {
    render(<LandingPage />);
    const carriers = screen.getByRole("region", { name: "For carriers" });
    expect(within(carriers).getAllByRole("listitem").map((item) => item.textContent)).toEqual(HOME.sides.carrier.items);
    expect(within(carriers).getByRole("link", { name: "How it works for carriers" })).toHaveAttribute("href", "/carriers");
    const drivers = screen.getByRole("region", { name: "For drivers" });
    expect(within(drivers).getByRole("link", { name: "How it works for drivers" })).toHaveAttribute("href", "/drivers");

    const miles = screen.getByRole("list", { name: "The four miles" });
    expect(within(miles).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
      HOME.miles.steps.map((step) => `${step.mile}${step.text}`),
    );
    expect(document.querySelector("[data-slot=miles]")).toHaveAttribute("data-reveal");
    expect(document.querySelector("[data-slot=miles-fill]")).toHaveClass("bg-progress-fill");

    const who = screen.getByRole("list", { name: "Who is on FleetGrid" });
    expect(within(who).getAllByRole("listitem")).toHaveLength(3);
    expect(who).toHaveTextContent("CDL Class A and B");
    expect(who).not.toHaveTextContent(/spotter|mechanic|Class C/i);

    const review = screen.getByRole("region", { name: "Review before visible" });
    expect(within(review).getAllByRole("listitem").map((item) => item.textContent)).toEqual(HOME.review.items);
    expect(review.querySelector("[data-slot=review-small-print]")).toHaveTextContent(
      "Profile review is not a background check",
    );
  });

  it("draws the Houston diagram, the three product frames, the five promises and the final band", () => {
    render(<LandingPage />);
    const map = screen.getByRole("img", { name: HOME.area.mapLabel });
    expect(map).toHaveAttribute("data-slot", "service-area-map");
    for (const place of ["Houston", "Pasadena", "Port of Houston", "Baytown", "La Porte", "Beltway 8", "Grand Parkway"]) {
      expect(map).toHaveTextContent(place);
    }
    expect(screen.getByRole("link", { name: "Check your yard's ZIP" })).toHaveAttribute("href", "/carriers#service-area");

    const frames = document.querySelectorAll("[data-slot=device-frame]");
    expect(frames).toHaveLength(3);
    expect([...frames].map((frame) => frame.querySelector("figcaption")?.textContent)).toEqual(HOME.proof.captions);
    expect(screen.getByRole("list", { name: "Sample results" })).toHaveTextContent("Sample Driver A");

    const promises = screen.getByRole("region", { name: "Plain promises" });
    expect(within(promises).getAllByRole("listitem").map((item) => item.textContent)).toEqual(HOME.promises.items);

    const band = screen.getByRole("region", { name: "Ready when you are." });
    expect(within(band).getByRole("link", { name: "Find drivers" })).toHaveAttribute("href", "/carriers");
    expect(within(band).getByRole("link", { name: "Sign up to drive, free" })).toHaveAttribute("href", "/login?role=driver");
  });

  it("never shows a phone number, a placeholder word, a dash or a banned word", () => {
    render(<LandingPage />);
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).not.toMatch(/869-2040|coming soon|placeholder|TODO|TBD|lorem/i);
    expect(text).not.toMatch(/[–—!]/);
    expect(text).not.toMatch(/\b(hire|vetted|dispatch|guarantee|seamless)\b/i);
  });
});

describe("HeroScene playback", () => {
  it("plays once, 300ms after it is in view, only when the page is marked for motion", () => {
    vi.useFakeTimers();
    document.documentElement.classList.add(MOTION_CLASS);
    const observers = stubIntersectionObserver();
    render(<HeroScene phoneHeader="FleetGrid" />);
    const scene = document.querySelector("[data-slot=hero]") as HTMLElement;
    expect(scene).not.toHaveClass(HERO_PLAYING_CLASS);
    // One observer for the phone card's trigger, one for the road underneath.
    expect(observers).toHaveLength(2);
    const trigger = observers.find((observer) => observer.observed.includes(scene))!;

    act(() => trigger.callback([{ isIntersecting: false }]));
    act(() => vi.advanceTimersByTime(1000));
    expect(scene).not.toHaveClass(HERO_PLAYING_CLASS);

    act(() => trigger.callback([{ isIntersecting: true }]));
    act(() => vi.advanceTimersByTime(299));
    expect(scene).not.toHaveClass(HERO_PLAYING_CLASS);
    act(() => vi.advanceTimersByTime(1));
    expect(scene).toHaveClass(HERO_PLAYING_CLASS);
    expect(trigger.observed).toEqual([]);
  });

  it("shows the exact Twilio sample first, then a fresh shift code in the offer and the reply each time round", () => {
    document.documentElement.classList.add(MOTION_CLASS);
    vi.stubGlobal("IntersectionObserver", undefined);
    const values = [0.5, 0.5, 0.25];
    let calls = 0;
    render(<HeroScene phoneHeader="FleetGrid" random={() => values[calls++ % values.length]} />);
    const scene = document.querySelector("[data-slot=hero]") as HTMLElement;
    const bubble = (n: number) => scene.querySelector(`[data-slot=hero-bubble][data-bubble='${n}']`)!.textContent;
    expect(bubble(1)).toBe(SMS_SAMPLE_OFFER);
    expect(bubble(2)).toBe(SMS_SAMPLE_REPLY);

    const round = (animationName: string) =>
      act(() => {
        scene
          .querySelector("[data-slot=hero-bubble][data-bubble='1']")!
          .dispatchEvent(Object.assign(new Event("animationiteration", { bubbles: true }), { animationName }));
      });
    // Another part's loop restarting means nothing.
    round("hero-badge");
    expect(bubble(2)).toBe(SMS_SAMPLE_REPLY);

    round("hero-bubble-1");
    // 0.5 gives 5500: the offer and the reply both carry it, and the words are unchanged.
    expect(bubble(2)).toBe("YES 5500");
    expect(bubble(1)).toBe(SMS_SAMPLE_OFFER.replace("4821", "5500"));
    expect(bubble(3)).toBe(SMS_SAMPLE_CONFIRMATION);
    // The next round draws 0.5 again (the same code), which is skipped for 0.25: 3250.
    round("hero-bubble-1");
    expect(bubble(2)).toBe("YES 3250");
  });

  it("stays on the final frame when the page is not marked for motion (reduced motion, no script)", () => {
    const observers = stubIntersectionObserver();
    render(<HeroScene phoneHeader="FleetGrid" />);
    expect(observers).toHaveLength(0);
    expect(document.querySelector("[data-slot=hero]")).not.toHaveClass(HERO_PLAYING_CLASS);
  });
});
