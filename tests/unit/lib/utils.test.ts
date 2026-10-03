// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a token type size next to a text color", () => {
    expect(cn("text-body text-foreground")).toBe("text-body text-foreground");
    expect(cn("text-button font-bold text-primary-foreground")).toBe(
      "text-button font-bold text-primary-foreground",
    );
    expect(cn("text-helper leading-helper text-muted-foreground text-destructive")).toBe(
      "text-helper leading-helper text-destructive",
    );
  });

  it("lets a later token size override an earlier one", () => {
    expect(cn("text-body text-h1")).toBe("text-h1");
    expect(cn("leading-body leading-h1")).toBe("leading-h1");
    expect(cn("rounded-card rounded-field")).toBe("rounded-field");
    expect(cn("shadow-1 shadow-2")).toBe("shadow-2");
    expect(cn("h-target h-target-lg")).toBe("h-target-lg");
    expect(cn("size-target size-target-lg")).toBe("size-target-lg");
  });

  it("keeps different sides and merges conditionals like clsx", () => {
    expect(cn("rounded-card rounded-t-card")).toBe("rounded-card rounded-t-card");
    expect(cn("p-4", { "p-2": true, hidden: false }, ["gap-2"])).toBe("p-2 gap-2");
    expect(cn(undefined, null, "")).toBe("");
  });
});
