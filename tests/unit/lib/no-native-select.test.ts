// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every dropdown is the theme's SelectInput (user request of 2026-11-01), never the browser's own. */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("dropdowns", () => {
  it("no page or component outside the ui kit renders a native <select>", () => {
    const offenders = [...files("src/app"), ...files("src/components")]
      .filter((path) => !path.replaceAll("\\", "/").includes("src/components/ui/"))
      .filter((path) => /<select[\s>]/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
