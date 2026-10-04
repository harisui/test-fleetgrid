// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Copy the app must never show, because the build does not do what it would promise:
 * shifts are matched by state (Milestone 3), not by distance, and approval has no promised
 * turnaround.
 */
const FORBIDDEN = [
  /miles away/i,
  /filtered by distance/i,
  /within your (radius|distance)/i,
  /can now find you/i,
  /business day/i,
  /within \d+ (hours|days)/i,
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("onboarding copy", () => {
  const files = filesUnder("src/components/driver").filter((file) => /\.tsx?$/.test(file));

  it("promises nothing the build does not do", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("keeps the CDL class descriptions in one place, the onboarding options", () => {
    const sources = filesUnder("src").filter((file) => /\.tsx?$/.test(file));
    const owners = sources.filter((file) =>
      readFileSync(file, "utf8").includes("Passenger vans (16+) and small hazmat vehicles"),
    );
    expect(owners.map((file) => file.replace(/\\/g, "/"))).toEqual([
      "src/lib/onboarding/options.ts",
    ]);
  });

  it("explains the distance answer as information for carriers", () => {
    const source = readFileSync("src/components/driver/screens/DistanceScreen.tsx", "utf8");
    expect(source).toContain("Tells carriers how far you&apos;re willing to go for work.");
  });
});
