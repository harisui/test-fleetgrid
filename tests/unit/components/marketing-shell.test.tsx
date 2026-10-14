import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/AppShell";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { HeaderShadow, SCROLLED_ATTRIBUTE } from "@/components/marketing/HeaderShadow";
import { LaunchStrip } from "@/components/marketing/LaunchStrip";
import { MobileMenu } from "@/components/marketing/MobileMenu";
import { Reveal, Stagger } from "@/components/marketing/Reveal";
import { Logo } from "@/components/shared/Logo";
import { FOOTER, LAUNCH_STRIP, NAV_LINKS } from "@/content/marketing";
import { resetEnvCache } from "@/lib/env";
import {
  LAUNCH_STRIP_DISMISSED,
  LAUNCH_STRIP_DISMISSED_CLASS,
  LAUNCH_STRIP_STORAGE_KEY,
  MOTION_CLASS,
  SITE_INIT_SCRIPT,
} from "@/lib/motion";
import { resetRevealObserver, REVEALED_ATTRIBUTE } from "@/hooks/useReveal";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/** A controllable IntersectionObserver: tests fire the callback themselves. */
function stubIntersectionObserver() {
  const observers: { callback: IOCallback; observed: Element[]; options?: IntersectionObserverInit }[] =
    [];
  class FakeObserver {
    observed: Element[] = [];
    constructor(
      public callback: IOCallback,
      public options?: IntersectionObserverInit,
    ) {
      observers.push(this);
    }
    observe(element: Element) {
      this.observed.push(element);
    }
    unobserve(element: Element) {
      this.observed = this.observed.filter((candidate) => candidate !== element);
    }
    disconnect() {
      this.observed = [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return observers;
}

beforeEach(() => {
  pathname.current = "/";
  document.documentElement.className = "";
  localStorage.clear();
  resetEnvCache();
  resetRevealObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LaunchStrip", () => {
  it("shows the launch line in capitals and a 48px dismiss button", () => {
    render(<LaunchStrip />);
    const strip = screen.getByRole("region", { name: "Launch area" });
    expect(strip).toHaveAttribute("data-slot", "launch-strip");
    expect(strip).toHaveTextContent(LAUNCH_STRIP.text);
    expect(within(strip).getByText(LAUNCH_STRIP.text)).toHaveClass("uppercase");
    expect(within(strip).getByRole("button", { name: "Dismiss" })).toHaveClass("size-target");
  });

  it("dismissing hides it through the html class and remembers it in localStorage", async () => {
    render(<LaunchStrip />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(document.documentElement).toHaveClass(LAUNCH_STRIP_DISMISSED_CLASS);
    expect(localStorage.getItem(LAUNCH_STRIP_STORAGE_KEY)).toBe(LAUNCH_STRIP_DISMISSED);
  });

  it("the inline script hides a dismissed strip before paint and marks motion, except under reduced motion", () => {
    localStorage.setItem(LAUNCH_STRIP_STORAGE_KEY, LAUNCH_STRIP_DISMISSED);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    new Function(SITE_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass(LAUNCH_STRIP_DISMISSED_CLASS);
    expect(document.documentElement).toHaveClass(MOTION_CLASS);

    document.documentElement.className = "";
    localStorage.clear();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    new Function(SITE_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass(MOTION_CLASS);
    expect(document.documentElement).not.toHaveClass(LAUNCH_STRIP_DISMISSED_CLASS);
  });
});

describe("marketing Header", () => {
  it("has the wordmark home link, the four section links, Log in and Find drivers", () => {
    render(<Header variant="marketing" />);
    const banner = screen.getByRole("banner");
    expect(banner).toHaveAttribute("data-slot", "site-header");
    expect(within(banner).getByRole("link", { name: "FleetGrid" })).toHaveAttribute("href", "/");
    expect(within(banner).getByRole("img", { name: "FleetGrid" })).toHaveAttribute(
      "data-surface",
      "page",
    );
    const nav = within(banner).getByRole("navigation", { name: "Main" });
    for (const link of NAV_LINKS) {
      expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
    }
    expect(within(banner).getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    const cta = within(banner).getByRole("link", { name: "Find drivers" });
    expect(cta).toHaveAttribute("href", "/carriers");
    expect(cta).toHaveAttribute("data-variant", "primary");
    expect(within(banner).getByRole("button", { name: "Toggle dark mode" })).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "Menu" })).toHaveClass("md:hidden");
  });

  it("the app header is unchanged: graphite, no site links", () => {
    render(<Header />);
    expect(screen.getByRole("banner")).not.toHaveAttribute("data-slot", "site-header");
    expect(screen.queryByRole("link", { name: "Find drivers" })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "FleetGrid" })).toHaveAttribute("data-surface", "panel");
  });
});

describe("MobileMenu", () => {
  it("opens a sheet with the same links at 56px, closes on Escape and returns focus", async () => {
    const user = userEvent.setup();
    render(<MobileMenu />);
    const button = screen.getByRole("button", { name: "Menu" });
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    expect(dialog).toHaveAttribute("data-slot", "mobile-menu");
    const nav = within(dialog).getByRole("navigation", { name: "Main mobile" });
    for (const link of NAV_LINKS) {
      expect(within(nav).getByRole("link", { name: link.label })).toHaveClass("h-target-lg");
    }
    expect(within(nav).getByRole("link", { name: "Log in" })).toHaveClass("h-target-lg");
    expect(within(dialog).getByRole("link", { name: "Find drivers" })).toHaveAttribute(
      "href",
      "/carriers",
    );
    // Focus is inside the sheet while it is open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("closes when the route changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<MobileMenu />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    pathname.current = "/drivers";
    rerender(<MobileMenu />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("Footer", () => {
  it("has the four columns, the legal line and the texting line without a number by default", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("bg-sign-panel", "border-t-4", "border-sign-panel-border");
    expect(within(footer).getByText(FOOTER.description)).toBeInTheDocument();
    expect(within(footer).getByText("Now launching in the Houston area.")).toBeInTheDocument();
    for (const column of FOOTER.columns) {
      const nav = within(footer).getByRole("navigation", { name: column.title });
      for (const link of column.links) {
        expect(within(nav).getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
      }
    }
    expect(
      within(within(footer).getByRole("navigation", { name: "Company" })).getByRole("link", {
        name: "Contact",
      }),
    ).toHaveAttribute("href", "/contact");
    const legal = within(footer).getByRole("navigation", { name: "Legal" });
    expect(within(legal).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/terms",
      "/privacy",
      "/sms-terms",
    ]);
    expect(footer.querySelector("[data-slot=footer-legal-line]")).toHaveTextContent(
      `© ${new Date().getFullYear()} FleetGrid LLC. FleetGrid is a directory and messaging service. FleetGrid is not an employer, staffing agency or freight broker.`,
    );
    expect(footer.querySelector("[data-slot=footer-sms-line]")).toHaveTextContent(
      "Shift texts go to drivers who opt in. Reply STOP to opt out, HELP for help. Message and data rates may apply.",
    );
    expect(footer.textContent).not.toMatch(/869-2040/);
    expect(footer.querySelector("[data-slot=footer-phone]")).toBeNull();
  });

  it("names the texting sender only with NEXT_PUBLIC_SHOW_SMS_NUMBER, and the phone for calls only with NEXT_PUBLIC_SHOW_PHONE", () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_SMS_NUMBER", "true");
    resetEnvCache();
    const { unmount } = render(<Footer />);
    expect(document.querySelector("[data-slot=footer-sms-line]")).toHaveTextContent(
      "Shift texts are sent from (888) 869-2040 to drivers who opt in.",
    );
    expect(document.querySelector("[data-slot=footer-phone]")).toBeNull();
    unmount();

    vi.stubEnv("NEXT_PUBLIC_SHOW_SMS_NUMBER", "false");
    vi.stubEnv("NEXT_PUBLIC_SHOW_PHONE", "true");
    resetEnvCache();
    render(<Footer />);
    expect(screen.getByRole("link", { name: "(888) 869-2040" })).toHaveAttribute(
      "href",
      "tel:+18888692040",
    );
    expect(document.querySelector("[data-slot=footer-sms-line]")).not.toHaveTextContent(
      "869-2040",
    );
  });

  it("every footer link is at least 48px tall", () => {
    render(<Footer />);
    for (const link of within(screen.getByRole("contentinfo")).getAllByRole("link")) {
      expect(link).toHaveClass("min-h-target");
    }
  });
});

describe("AppShell marketing variant", () => {
  it("adds the strip, the scroll sentinel and the site header around the page", () => {
    render(
      <AppShell variant="marketing">
        <p>Page</p>
      </AppShell>,
    );
    expect(screen.getByRole("region", { name: "Launch area" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=scroll-sentinel]")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveAttribute("data-slot", "site-header");
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
  });

  it("the app variant has no strip and no sentinel", () => {
    render(
      <AppShell>
        <p>Page</p>
      </AppShell>,
    );
    expect(screen.queryByRole("region", { name: "Launch area" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-slot=scroll-sentinel]")).toBeNull();
  });
});

describe("HeaderShadow", () => {
  it("marks the header scrolled once the sentinel leaves the viewport, and unmarks it when it returns", () => {
    const observers = stubIntersectionObserver();
    render(
      <div>
        <HeaderShadow />
        <header data-slot="site-header" />
      </div>,
    );
    const header = document.querySelector("[data-slot=site-header]")!;
    expect(observers).toHaveLength(1);
    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(header).toHaveAttribute(SCROLLED_ATTRIBUTE);
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(header).not.toHaveAttribute(SCROLLED_ATTRIBUTE);
  });
});

describe("Reveal and Stagger", () => {
  it("is visible in the HTML, reveals once in view and never again hides", () => {
    const observers = stubIntersectionObserver();
    render(
      <Reveal as="section" aria-label="Block">
        <p>Text</p>
      </Reveal>,
    );
    const block = screen.getByRole("region", { name: "Block" });
    expect(block).toHaveAttribute("data-reveal");
    expect(block).not.toHaveAttribute(REVEALED_ATTRIBUTE);
    expect(observers).toHaveLength(1);
    expect(observers[0].options).toEqual({ threshold: 0.15, rootMargin: "0px 0px -10% 0px" });

    act(() => observers[0].callback([{ isIntersecting: false, target: block }]));
    expect(block).not.toHaveAttribute(REVEALED_ATTRIBUTE);
    act(() => observers[0].callback([{ isIntersecting: true, target: block }]));
    expect(block).toHaveAttribute(REVEALED_ATTRIBUTE);
    // Observed once: revealed elements are dropped from the observer.
    expect(observers[0].observed).toEqual([]);
  });

  it("shares one observer across every Reveal", () => {
    const observers = stubIntersectionObserver();
    render(
      <>
        <Reveal>
          <p>One</p>
        </Reveal>
        <Reveal>
          <p>Two</p>
        </Reveal>
      </>,
    );
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toHaveLength(2);
  });

  it("reveals at once when the browser has no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(
      <Reveal>
        <p>Text</p>
      </Reveal>,
    );
    expect(document.querySelector("[data-reveal]")).toHaveAttribute(REVEALED_ATTRIBUTE);
  });

  it("Stagger numbers its children, capped at five steps", () => {
    render(
      <ul>
        <Stagger>
          {Array.from({ length: 7 }, (_, index) => (
            <li key={index}>{index}</li>
          ))}
        </Stagger>
      </ul>,
    );
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.style.getPropertyValue("--i"))).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "5",
    ]);
  });
});

describe("Logo surfaces", () => {
  it("paints the page variant with the primary and foreground tokens", () => {
    render(<Logo surface="page" />);
    const svg = screen.getByRole("img", { name: "FleetGrid" });
    expect(svg.querySelector("rect")).toHaveClass("fill-progress-fill");
    expect(svg.querySelectorAll("path")[0]).toHaveClass("fill-foreground");
  });
});
