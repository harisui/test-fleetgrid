import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollingArrow } from "@/components/shared/ScrollingArrow";

/** jsdom has no layout, so the page size and scroll position are stubbed. */
function stubPage({
  height,
  viewport,
  scrolled = 0,
}: {
  height: number;
  viewport: number;
  scrolled?: number;
}) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: height,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: viewport,
  });
  Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: scrolled });
}

const arrow = () => screen.queryByRole("button", { name: "Scroll down for more" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScrollingArrow", () => {
  it("shows while the page runs past the viewport, as a graphite tile with a dipping chevron", () => {
    stubPage({ height: 2000, viewport: 800 });
    render(<ScrollingArrow />);
    const button = arrow();
    expect(button).toHaveAttribute("data-slot", "scrolling-arrow");
    expect(button).toHaveClass(
      "fixed",
      "bg-sign-panel",
      "text-sign-panel-foreground",
      "rounded-button",
    );
    expect(button!.querySelector("svg")).toHaveClass("animate-nudge");
    expect(button!.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("stays hidden when the page fits", () => {
    stubPage({ height: 700, viewport: 800 });
    render(<ScrollingArrow />);
    expect(arrow()).not.toBeInTheDocument();
  });

  it("disappears once the bottom is in view and comes back when the page grows", () => {
    stubPage({ height: 2000, viewport: 800 });
    render(<ScrollingArrow />);
    expect(arrow()).toBeInTheDocument();

    stubPage({ height: 2000, viewport: 800, scrolled: 1190 });
    act(() => {
      fireEvent.scroll(window);
    });
    expect(arrow()).not.toBeInTheDocument();

    stubPage({ height: 3000, viewport: 800, scrolled: 1190 });
    act(() => {
      fireEvent(window, new Event("resize"));
    });
    expect(arrow()).toBeInTheDocument();
  });

  it("scrolls on by most of a screen when tapped", async () => {
    stubPage({ height: 2000, viewport: 800 });
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    render(<ScrollingArrow label="More questions below" />);
    await userEvent.click(screen.getByRole("button", { name: "More questions below" }));
    expect(scrollBy).toHaveBeenCalledWith({ top: 480, behavior: "smooth" });
  });
});
