import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "@/components/layout/Header";
import { Logo } from "@/components/shared/Logo";
import { LOGO } from "@/components/shared/logo-geometry";

describe("Logo", () => {
  it("is one image named FleetGrid, drawn from the outlined wordmark with no text node", () => {
    const { container } = render(<Logo />);
    const svg = screen.getByRole("img", { name: "FleetGrid" });
    expect(svg).toHaveAttribute("data-slot", "logo");
    expect(svg).toHaveAttribute("viewBox", `0 0 ${LOGO.width} ${LOGO.height}`);
    expect(container.querySelector("text")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("keeps its proportions at any height", () => {
    render(<Logo height={40} />);
    const svg = screen.getByRole("img", { name: "FleetGrid" });
    expect(svg).toHaveAttribute("height", "40");
    expect(svg).toHaveAttribute("width", String(Math.round((LOGO.width * 40) / LOGO.height)));
  });

  it("on the navy panel paints the navy parts white and keeps the orange, from tokens only", () => {
    const { container } = render(<Logo />);
    const paths = [...container.querySelectorAll("path")];
    expect(paths).toHaveLength(4);
    expect(paths.map((path) => path.getAttribute("class"))).toEqual([
      "fill-sign-panel-foreground",
      "fill-sign-panel-border",
      "fill-sign-panel-foreground",
      "fill-sign-panel-border",
    ]);
    expect(container.innerHTML).not.toMatch(/fill="#|style=/);
  });

  it("on the page paints navy and orange with the logo tokens", () => {
    const { container } = render(<Logo surface="page" />);
    const classes = [...container.querySelectorAll("path")].map((path) => path.getAttribute("class"));
    expect(classes).toEqual(["fill-logo-ink", "fill-logo-accent", "fill-logo-ink", "fill-logo-accent"]);
  });

  it("is the link home in the app header", () => {
    render(<Header />);
    const home = screen.getByRole("link", { name: "FleetGrid" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("[data-slot=logo]")).toBeInTheDocument();
  });
});
