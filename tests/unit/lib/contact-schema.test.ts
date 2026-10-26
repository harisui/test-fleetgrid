// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  CONTACT_MESSAGES,
  contactFieldsSchema,
  contactSubmissionSchema,
} from "@/lib/validation/contact.schema";

function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return errors;
}

const valid = {
  name: "  Pat Owner ",
  email: " Pat.Owner@Example.COM ",
  role: "carrier",
  company: "  ",
  message: "We have a yard in Pasadena and three open shifts next week.",
};

describe("contactFieldsSchema", () => {
  it("trims, lowercases the email and drops an empty company", () => {
    expect(contactFieldsSchema.parse(valid)).toEqual({
      name: "Pat Owner",
      email: "pat.owner@example.com",
      role: "carrier",
      company: undefined,
      message: "We have a yard in Pasadena and three open shifts next week.",
    });
    expect(contactFieldsSchema.parse({ ...valid, company: " Bayou Freight " }).company).toBe(
      "Bayou Freight",
    );
  });

  it.each([
    [{ name: "" }, "name", CONTACT_MESSAGES.name],
    [{ name: "P" }, "name", CONTACT_MESSAGES.name],
    [{ name: "x".repeat(81) }, "name", CONTACT_MESSAGES.nameLong],
    [{ email: "pat" }, "email", CONTACT_MESSAGES.email],
    [{ email: "" }, "email", CONTACT_MESSAGES.email],
    [{ role: "admin" }, "role", CONTACT_MESSAGES.role],
    [{ role: undefined }, "role", CONTACT_MESSAGES.role],
    [{ company: "x".repeat(121) }, "company", CONTACT_MESSAGES.companyLong],
    [{ message: "Too short" }, "message", CONTACT_MESSAGES.messageShort],
    [{ message: "x".repeat(2001) }, "message", CONTACT_MESSAGES.messageLong],
  ])("rejects %j with a plain message", (override, field, message) => {
    expect(errorsOf(contactFieldsSchema, { ...valid, ...override })).toEqual({ [field]: message });
  });

  it("never asks for a phone number", () => {
    expect(Object.keys(contactFieldsSchema.shape)).toEqual([
      "name",
      "email",
      "role",
      "company",
      "message",
    ]);
  });
});

describe("contactSubmissionSchema", () => {
  it("adds the honeypot (empty by default) and requires the token", () => {
    expect(contactSubmissionSchema.parse({ ...valid, token: "1.abc" })).toMatchObject({
      company_website: "",
      token: "1.abc",
    });
    expect(errorsOf(contactSubmissionSchema, { ...valid })).toEqual({
      token: CONTACT_MESSAGES.token,
    });
    expect(errorsOf(contactSubmissionSchema, { ...valid, token: "" })).toEqual({
      token: CONTACT_MESSAGES.token,
    });
  });
});
