// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  digitsOnly,
  formatE164ForDisplay,
  formatUsPhoneInput,
  isValidUsPhone,
  maskPhone,
  normalizeUsPhone,
} from "@/lib/phone";

describe("normalizeUsPhone", () => {
  it.each([
    ["5555550100", "+15555550100"],
    ["(555) 555-0100", "+15555550100"],
    ["555-555-0100", "+15555550100"],
    ["555.555.0100", "+15555550100"],
    ["555 555 0100", "+15555550100"],
    ["  (555) 555-0100  ", "+15555550100"],
    ["15555550100", "+15555550100"],
    ["1 (555) 555-0100", "+15555550100"],
    ["+15555550100", "+15555550100"],
    ["+1 555 555 0100", "+15555550100"],
    ["+1 (214) 867-5309", "+12148675309"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace"],
    ["555555010", "9 digits"],
    ["55555501000", "11 digits not starting with 1"],
    ["155555501000", "12 digits"],
    ["555-0100", "7 digits"],
    ["abc5555550100", "letters"],
    ["555555010O", "letter O instead of zero"],
    ["0555550100", "area code starting with 0"],
    ["1555550100", "area code starting with 1 (10 digits)"],
    ["5550550100", "exchange starting with 0"],
    ["5551550100", "exchange starting with 1"],
    ["+5555550100", "plus without country code"],
    ["5555550100 ext 5", "extension"],
  ])("rejects %s (%s)", (input) => {
    expect(normalizeUsPhone(input)).toBeNull();
    expect(isValidUsPhone(input)).toBe(false);
  });

  it.each([
    ["+447911123456", "United Kingdom"],
    ["+52 55 1234 5678", "Mexico"],
    ["+923001234567", "Pakistan"],
    ["+33 1 23 45 67 89", "France"],
    ["0044 7911 123456", "international prefix"],
    ["+25555550100", "wrong country code with 11 digits"],
  ])("rejects international number %s (%s)", (input) => {
    expect(normalizeUsPhone(input)).toBeNull();
  });

  it("isValidUsPhone is true for a valid number", () => {
    expect(isValidUsPhone("(555) 555-0100")).toBe(true);
  });
});

describe("formatUsPhoneInput", () => {
  it.each([
    ["", ""],
    ["5", "(5"],
    ["555", "(555"],
    ["5555", "(555) 5"],
    ["555555", "(555) 555"],
    ["5555550", "(555) 555-0"],
    ["5555550100", "(555) 555-0100"],
    ["55555501009999", "(555) 555-0100"],
    ["(555) 555-01", "(555) 555-01"],
    ["15555550100", "(555) 555-0100"],
    ["+1 555 555 0100", "(555) 555-0100"],
    ["abc", ""],
  ])("formats %j as %j", (input, expected) => {
    expect(formatUsPhoneInput(input)).toBe(expected);
  });

  it("keeps a leading 1 while the number is still short", () => {
    // "1" could be the start of an area code typo; it is only dropped once 11 digits are present.
    expect(formatUsPhoneInput("1555")).toBe("(155) 5");
  });
});

describe("display helpers", () => {
  it("digitsOnly strips everything else", () => {
    expect(digitsOnly("+1 (555) 555-0100")).toBe("15555550100");
  });

  it("formatE164ForDisplay formats US numbers and leaves others alone", () => {
    expect(formatE164ForDisplay("+15555550100")).toBe("(555) 555-0100");
    expect(formatE164ForDisplay("+447911123456")).toBe("+447911123456");
    expect(formatE164ForDisplay("")).toBe("");
  });

  it("maskPhone shows only the last four digits", () => {
    expect(maskPhone("+15555550100")).toBe("(***) ***-0100");
    expect(maskPhone("not a phone")).toBe("not a phone");
  });
});
