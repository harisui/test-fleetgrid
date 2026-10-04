// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { US_STATE_CODES } from "@/lib/constants";

vi.mock("server-only", () => ({}));

const { FileZipProvider, ZIP_DATA_PATH } = await import("@/server/providers/ZipProvider");

describe("bundled ZIP dataset", () => {
  const lines = readFileSync(resolve(process.cwd(), ZIP_DATA_PATH), "utf8")
    .split("\n")
    .filter(Boolean);

  it("covers the country: tens of thousands of ZIPs, each with a city, a state we accept and a location", () => {
    expect(lines.length).toBeGreaterThan(30_000);
    const states = new Set<string>(US_STATE_CODES);
    for (const line of lines) {
      const [zip, city, state, lat, lng, extra] = line.split("\t");
      expect(zip).toMatch(/^\d{5}$/);
      expect(city.length).toBeGreaterThan(0);
      expect(states.has(state), line).toBe(true);
      // Decimal degrees inside the US and its islands, four decimals (about 10 m).
      expect(lat, line).toMatch(/^-?\d{1,2}\.\d{4}$/);
      expect(lng, line).toMatch(/^-?\d{1,3}\.\d{4}$/);
      expect(Number(lat)).toBeGreaterThan(-15);
      expect(Number(lat)).toBeLessThan(72);
      expect(Number(lng)).toBeGreaterThan(-180);
      expect(Number(lng)).toBeLessThan(180);
      expect(extra).toBeUndefined();
    }
  });

  it("has no duplicate ZIPs and is sorted", () => {
    const zips = lines.map((line) => line.slice(0, 5));
    expect(new Set(zips).size).toBe(zips.length);
    expect([...zips].sort()).toEqual(zips);
  });

  it("knows a few well-known places, with their coordinates", () => {
    const provider = new FileZipProvider();
    const chicago = provider.find("60601");
    expect(chicago).toMatchObject({ zip: "60601", city: "Chicago", state: "IL" });
    expect(chicago?.lat).toBeCloseTo(41.9, 0);
    expect(chicago?.lng).toBeCloseTo(-87.6, 0);
    const dallas = provider.find("75201");
    expect(dallas).toMatchObject({ zip: "75201", city: "Dallas", state: "TX" });
    expect(dallas?.lat).toBeCloseTo(32.8, 0);
    expect(dallas?.lng).toBeCloseTo(-96.8, 0);
    expect(provider.find("90210")).toMatchObject({
      zip: "90210",
      city: "Beverly Hills",
      state: "CA",
    });
    expect(provider.find("00000")).toBeNull();
  });
});

describe("FileZipProvider", () => {
  it("reads the file once and parses every line, numbers included", () => {
    const path = join(tmpdir(), `zips-${Date.now()}.tsv`);
    writeFileSync(
      path,
      "10001\tNew York\tNY\t40.7484\t-73.9967\n60601\tChicago\tIL\t41.8858\t-87.6181\n",
    );
    const provider = new FileZipProvider(path);
    expect(provider.find("10001")).toEqual({
      zip: "10001",
      city: "New York",
      state: "NY",
      lat: 40.7484,
      lng: -73.9967,
    });
    writeFileSync(path, "");
    // Already loaded: the second read never happens.
    expect(provider.find("60601")).toEqual({
      zip: "60601",
      city: "Chicago",
      state: "IL",
      lat: 41.8858,
      lng: -87.6181,
    });
    expect(provider.find("99999")).toBeNull();
  });
});
