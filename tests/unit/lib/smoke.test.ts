import { describe, expect, it } from "vitest";

describe("unit test infrastructure", () => {
  it("runs in jsdom by default", () => {
    expect(typeof window).toBe("object");
    expect(document.createElement("div")).toBeInstanceOf(HTMLElement);
  });

  it("has jest-dom matchers", () => {
    const element = document.createElement("button");
    element.textContent = "Go";
    document.body.appendChild(element);
    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent("Go");
    element.remove();
  });
});
