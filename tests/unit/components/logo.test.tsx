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

  it("paints with the sign-panel tokens only: orange trailer, white cab and wheels, graphite name", () => {
    const { container } = render(<Logo />);
    expect(container.querySelector("rect")).toHaveClass("fill-sign-panel-border");
    expect(container.querySelectorAll("path")[0]).toHaveClass("fill-sign-panel-foreground");
    expect(container.querySelectorAll("path")[1]).toHaveClass("fill-sign-panel");
    expect(container.querySelectorAll("circle")).toHaveLength(LOGO.wheels.cx.length * 2);
    expect(container.innerHTML).not.toMatch(/fill="#|style=/);
  });

  it("is the link home in the app header", () => {
    render(<Header />);
    const home = screen.getByRole("link", { name: "FleetGrid" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("[data-slot=logo]")).toBeInTheDocument();
  });
});
