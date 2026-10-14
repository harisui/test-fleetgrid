// @vitest-environment node
import { describe, expect, it } from "vitest";
import { milesBetween, milesBetweenRounded } from "@/lib/geo";
import { PLACES } from "../../setup/factories";

describe("milesBetween", () => {
  it("agrees with the database's miles_between() on the launch-area distances", () => {
    const { houston, pasadena, dallas } = PLACES;
    expect(milesBetweenRounded(houston.lat, houston.lng, pasadena.lat, pasadena.lng)).toBe(10.4);
    expect(Math.round(milesBetween(houston.lat, houston.lng, dallas.lat, dallas.lng))).toBe(226);
  });

  it("is zero for the same point and symmetric", () => {
    const { houston, dallas } = PLACES;
    expect(milesBetween(houston.lat, houston.lng, houston.lat, houston.lng)).toBe(0);
    expect(milesBetween(houston.lat, houston.lng, dallas.lat, dallas.lng)).toBeCloseTo(
      milesBetween(dallas.lat, dallas.lng, houston.lat, houston.lng),
      9,
    );
  });

  it("rounds to a tenth of a mile", () => {
    expect(milesBetweenRounded(0, 0, 0, 0.01)).toBe(0.7);
  });
});
