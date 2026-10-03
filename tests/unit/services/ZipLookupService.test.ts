// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ZipLookupService } from "@/server/services/ZipLookupService";
import { FakeZipProvider } from "../../fakes/FakeZipProvider";

const CHICAGO = { zip: "60601", city: "Chicago", state: "IL" };

describe("ZipLookupService", () => {
  const provider = new FakeZipProvider([CHICAGO]);
  const service = new ZipLookupService(provider);

  it("finds a known ZIP in any forgiving form", () => {
    expect(service.lookup("60601")).toEqual(CHICAGO);
    expect(service.lookup("60601-1234")).toEqual(CHICAGO);
    expect(service.lookup(" 606 01 ")).toEqual(CHICAGO);
  });

  it("returns null for unknown or malformed input without touching the data", () => {
    const before = provider.calls.length;
    expect(service.lookup("6060")).toBeNull();
    expect(service.lookup("abcde")).toBeNull();
    expect(service.lookup(60601)).toBeNull();
    expect(service.lookup(null)).toBeNull();
    expect(service.lookup(undefined)).toBeNull();
    expect(provider.calls.length).toBe(before);
    expect(service.lookup("99999")).toBeNull();
    expect(provider.calls.at(-1)).toBe("99999");
  });
});
