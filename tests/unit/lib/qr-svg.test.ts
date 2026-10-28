import { describe, expect, it, vi } from "vitest";
import { renderQrSvg } from "@/lib/qr/render";

vi.mock("server-only", () => ({}));

/**
 * The printable SVG must be well-formed XML, or a browser shows a broken image. The nested
 * code document carries each attribute once (the library's own width and height go), in
 * the jsdom environment, which has a DOM parser.
 */
describe("renderQrSvg as XML", () => {
  it("parses, with the code nested once at the right place and size", async () => {
    const svg = await renderQrSvg({
      url: "https://fleetgridus.com/q/loves-hwy-225",
      label: "Love's, Hwy 225",
      caption: "fleetgridus.com/q/loves-hwy-225",
    });
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(document.querySelector("parsererror")).toBeNull();
    const nested = document.querySelectorAll("svg svg");
    expect(nested).toHaveLength(1);
    expect(nested[0].getAttribute("x")).toBe("100");
    expect(nested[0].getAttribute("y")).toBe("80");
    expect(nested[0].getAttribute("width")).toBe("800");
    expect(nested[0].getAttribute("height")).toBe("800");
    expect(nested[0].getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(document.querySelectorAll("text")).toHaveLength(2);
    expect(document.querySelectorAll("text")[0].textContent).toBe("Love's, Hwy 225");
  });
});
