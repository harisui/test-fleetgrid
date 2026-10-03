// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  channelToLinear,
  contrastRatio,
  deltaE2000,
  deltaEHex,
  linearToChannel,
  parseHex,
  relativeLuminance,
  rgbToLab,
  simulateCvd,
  toHex,
} from "@/lib/color";

describe("parseHex / toHex", () => {
  it("parses 6-digit hex in any case", () => {
    expect(parseHex("#B84A00")).toEqual({ r: 184, g: 74, b: 0 });
    expect(parseHex(" #ffffff ")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("rejects anything else", () => {
    for (const bad of ["#fff", "b84a00", "#b84a0", "#gggggg", "rgb(0,0,0)"]) {
      expect(() => parseHex(bad)).toThrow(/Not a 6-digit hex color/);
    }
  });

  it("formats and clamps", () => {
    expect(toHex({ r: 184, g: 74, b: 0 })).toBe("#b84a00");
    expect(toHex({ r: 300, g: -5, b: 12.6 })).toBe("#ff000d");
  });
});

describe("sRGB transfer", () => {
  it("round-trips channels", () => {
    for (const channel of [0, 1, 10, 128, 200, 255]) {
      expect(linearToChannel(channelToLinear(channel))).toBeCloseTo(channel, 6);
    }
  });

  it("uses the linear segment near black", () => {
    expect(channelToLinear(2)).toBeCloseTo(2 / 255 / 12.92, 10);
    expect(linearToChannel(0.0001)).toBeCloseTo(0.0001 * 12.92 * 255, 10);
  });

  it("clamps linear input", () => {
    expect(linearToChannel(2)).toBeCloseTo(255, 6);
    expect(linearToChannel(-1)).toBe(0);
  });
});

describe("relative luminance and contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance(parseHex("#ffffff"))).toBeCloseTo(1, 6);
    expect(relativeLuminance(parseHex("#000000"))).toBe(0);
    expect(relativeLuminance(parseHex("#808080"))).toBeCloseTo(0.2159, 3);
  });

  it("computes known contrast ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#1a4480", "#ffffff")).toBeCloseTo(9.63, 1);
  });
});

describe("rgbToLab", () => {
  it("maps white, black and mid gray to the neutral axis", () => {
    const white = rgbToLab(parseHex("#ffffff"));
    expect(white.l).toBeCloseTo(100, 2);
    expect(white.a).toBeCloseTo(0, 1);
    expect(white.b).toBeCloseTo(0, 1);
    expect(rgbToLab(parseHex("#000000")).l).toBeCloseTo(0, 6);
    const gray = rgbToLab(parseHex("#808080"));
    expect(gray.l).toBeCloseTo(53.59, 1);
    expect(Math.abs(gray.a)).toBeLessThan(0.1);
  });

  it("gives red a positive a and yellow a positive b", () => {
    expect(rgbToLab(parseHex("#ff0000")).a).toBeGreaterThan(70);
    expect(rgbToLab(parseHex("#ffff00")).b).toBeGreaterThan(80);
  });
});

describe("deltaE2000", () => {
  // Reference pairs from Sharma, Wu and Dalal (2005), table 1.
  it.each([
    [[50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485], 2.0425],
    [[50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485], 2.8615],
    [[50.0, 2.8361, -74.02], [50.0, 0.0, -82.7485], 3.4412],
    [[50.0, -1.3802, -84.2814], [50.0, 0.0, -82.7485], 1.0],
    [[50.0, -1.1848, -84.8006], [50.0, 0.0, -82.7485], 1.0],
    [[50.0, 2.5, 0.0], [50.0, 0.0, -2.5], 4.3065],
    [[50.0, 2.5, 0.0], [73.0, 25.0, -18.0], 27.1492],
    [[50.0, 2.5, 0.0], [61.0, -5.0, 29.0], 22.8977],
    [[50.0, 2.5, 0.0], [56.0, -27.0, -3.0], 31.903],
    [[50.0, 2.5, 0.0], [58.0, 24.0, 15.0], 19.4535],
    [[50.0, 2.5, 0.0], [50.0, 3.1736, 0.5854], 1.0],
    [[50.0, 2.5, 0.0], [50.0, 3.2972, 0.0], 1.0],
    [[50.0, 2.5, 0.0], [50.0, 1.8634, 0.5757], 1.0],
    [[50.0, 2.5, 0.0], [50.0, 3.2592, 0.335], 1.0],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ])("%j vs %j is %f", (first, second, expected) => {
    const [l1, a1, b1] = first;
    const [l2, a2, b2] = second;
    expect(deltaE2000({ l: l1, a: a1, b: b1 }, { l: l2, a: a2, b: b2 })).toBeCloseTo(expected, 3);
  });

  it("is zero for identical colors and symmetric", () => {
    expect(deltaEHex("#b84a00", "#b84a00")).toBe(0);
    expect(deltaEHex("#b84a00", "#2b3036")).toBeCloseTo(deltaEHex("#2b3036", "#b84a00"), 10);
  });
});

describe("simulateCvd", () => {
  it("leaves neutrals alone", () => {
    for (const gray of ["#000000", "#808080", "#ffffff"]) {
      expect(simulateCvd(gray, "deuteranopia")).toBe(gray);
      expect(simulateCvd(gray, "protanopia")).toBe(gray);
    }
  });

  it("collapses red and green toward each other", () => {
    const red = simulateCvd("#ff0000", "deuteranopia");
    const green = simulateCvd("#00ff00", "deuteranopia");
    expect(deltaEHex(red, green)).toBeLessThan(deltaEHex("#ff0000", "#00ff00") / 2);
    expect(parseHex(red).g).toBeGreaterThan(100);
  });

  it("keeps blue distinct from red", () => {
    expect(
      deltaEHex(simulateCvd("#005ea2", "protanopia"), simulateCvd("#b42318", "protanopia")),
    ).toBeGreaterThan(30);
  });
});
