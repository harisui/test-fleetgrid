// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ZipLookupService } from "@/server/services/ZipLookupService";
import { FakeServiceAreaRepository } from "../../fakes/FakeServiceAreaRepository";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";

const HOUSTON = { zip: "77002", city: "Houston", state: "TX", lat: 29.7594, lng: -95.3594 };
const DALLAS = { zip: "75201", city: "Dallas", state: "TX", lat: 32.7904, lng: -96.8044 };

describe("ZipLookupService", () => {
  const provider = new FakeZipProvider([HOUSTON, DALLAS]);
  // Only the Houston point is inside a launch area.
  const areas = new FakeServiceAreaRepository(
    (lat, lng) => lat === HOUSTON.lat && lng === HOUSTON.lng,
  );
  const service = new ZipLookupService(provider, areas);

  it("finds a known ZIP in any forgiving form, with the launch-area answer and no coordinates", async () => {
    const expected = { zip: "77002", city: "Houston", state: "TX", inServiceArea: true };
    expect(await service.lookup("77002")).toEqual(expected);
    expect(await service.lookup("77002-1234")).toEqual(expected);
    expect(await service.lookup(" 770 02 ")).toEqual(expected);
    expect(areas.calls.at(-1)).toEqual({ lat: HOUSTON.lat, lng: HOUSTON.lng });
  });

  it("says when a ZIP is outside every launch area", async () => {
    expect(await service.lookup("75201")).toEqual({
      zip: "75201",
      city: "Dallas",
      state: "TX",
      inServiceArea: false,
    });
  });

  it("returns null for unknown or malformed input without touching the data or the areas", async () => {
    const before = provider.calls.length;
    const areaCalls = areas.calls.length;
    expect(await service.lookup("6060")).toBeNull();
    expect(await service.lookup("abcde")).toBeNull();
    expect(await service.lookup(60601)).toBeNull();
    expect(await service.lookup(null)).toBeNull();
    expect(await service.lookup(undefined)).toBeNull();
    expect(provider.calls.length).toBe(before);
    expect(await service.lookup("99999")).toBeNull();
    expect(provider.calls.at(-1)).toBe("99999");
    expect(areas.calls.length).toBe(areaCalls);
  });
});
