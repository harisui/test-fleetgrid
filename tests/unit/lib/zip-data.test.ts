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

  it("covers the country: tens of thousands of ZIPs, each with a city and a state we accept", () => {
    expect(lines.length).toBeGreaterThan(30_000);
    const states = new Set<string>(US_STATE_CODES);
    for (const line of lines) {
      const [zip, city, state, extra] = line.split("\t");
      expect(zip).toMatch(/^\d{5}$/);
      expect(city.length).toBeGreaterThan(0);
      expect(states.has(state), line).toBe(true);
      expect(extra).toBeUndefined();
    }
  });

  it("has no duplicate ZIPs and is sorted", () => {
    const zips = lines.map((line) => line.slice(0, 5));
    expect(new Set(zips).size).toBe(zips.length);
    expect([...zips].sort()).toEqual(zips);
  });

  it("knows a few well-known places", () => {
    const provider = new FileZipProvider();
    expect(provider.find("60601")).toEqual({ zip: "60601", city: "Chicago", state: "IL" });
    expect(provider.find("75201")).toEqual({ zip: "75201", city: "Dallas", state: "TX" });
    expect(provider.find("90210")).toEqual({ zip: "90210", city: "Beverly Hills", state: "CA" });
    expect(provider.find("00000")).toBeNull();
  });
});

describe("FileZipProvider", () => {
  it("reads the file once and parses every line", () => {
    const path = join(tmpdir(), `zips-${Date.now()}.tsv`);
    writeFileSync(path, "10001\tNew York\tNY\n60601\tChicago\tIL\n");
    const provider = new FileZipProvider(path);
    expect(provider.find("10001")).toEqual({ zip: "10001", city: "New York", state: "NY" });
    writeFileSync(path, "");
    // Already loaded: the second read never happens.
    expect(provider.find("60601")).toEqual({ zip: "60601", city: "Chicago", state: "IL" });
    expect(provider.find("99999")).toBeNull();
  });
});
