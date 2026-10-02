import { describe, expect, it } from "vitest";
import { build, buildPhone, nextSequence, TEST_PHONES } from "../../setup/factories";

describe("test factories", () => {
  it("nextSequence increases", () => {
    const first = nextSequence();
    expect(nextSequence()).toBe(first + 1);
  });

  it("buildPhone returns unique fake E.164 numbers", () => {
    const a = buildPhone();
    const b = buildPhone();
    expect(a).toMatch(/^\+1555555\d{4}$/);
    expect(a).not.toBe(b);
  });

  it("build merges overrides over defaults", () => {
    expect(build({ a: 1, b: "x" }, { b: "y" })).toEqual({ a: 1, b: "y" });
    expect(build({ a: 1 })).toEqual({ a: 1 });
  });

  it("test phones stay in the reserved fake range", () => {
    const all = [TEST_PHONES.driver, TEST_PHONES.carrier, TEST_PHONES.admin, ...TEST_PHONES.extra];
    for (const phone of all) expect(phone).toMatch(/^\+1555555\d{4}$/);
    expect(new Set(all).size).toBe(all.length);
  });
});
