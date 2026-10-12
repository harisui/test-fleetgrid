// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { SEARCH_RADIUS_DEFAULT_MILES } from "@/lib/constants";
import {
  acceptTermsSchema,
  BILLING_EMAIL_MESSAGE,
  carrierDetailsSchema,
  COMPANY_NAME_MESSAGE,
  CONTACT_NAME_MESSAGE,
  driverIdSchema,
  driverSearchSchema,
  TERMS_MESSAGE,
} from "@/lib/validation/carrier.schema";
import { ZIP_MESSAGE } from "@/lib/validation/onboarding.schema";
import { DRIVER_ID, validCarrierDetails } from "../../setup/factories";

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

describe("carrierDetailsSchema", () => {
  it("accepts the form and normalizes it: trimmed names, lowercase email, blank numbers as null", () => {
    expect(
      carrierDetailsSchema.parse(
        validCarrierDetails({
          companyName: "  Bayou Freight LLC ",
          contactName: " Maria Lopez ",
          billingEmail: " Billing@BayouFreight.Example ",
          usdot: " 1234567 ",
          mc: "",
          zip: "77002-1234",
        }),
      ),
    ).toEqual({
      companyName: "Bayou Freight LLC",
      contactName: "Maria Lopez",
      billingEmail: "billing@bayoufreight.example",
      usdot: "1234567",
      mc: null,
      zip: "77002",
    });
  });

  it("treats missing federal numbers as none", () => {
    const parsed = carrierDetailsSchema.parse(
      validCarrierDetails({ usdot: undefined, mc: undefined }),
    );
    expect(parsed.usdot).toBeNull();
    expect(parsed.mc).toBeNull();
  });

  it.each([
    [{ companyName: "" }, "companyName", COMPANY_NAME_MESSAGE],
    [{ companyName: "X" }, "companyName", COMPANY_NAME_MESSAGE],
    [{ companyName: "x".repeat(121) }, "companyName", "120 characters or fewer"],
    [{ contactName: " " }, "contactName", CONTACT_NAME_MESSAGE],
    [{ billingEmail: "not-an-email" }, "billingEmail", BILLING_EMAIL_MESSAGE],
    [{ billingEmail: "" }, "billingEmail", BILLING_EMAIL_MESSAGE],
    [{ usdot: "12A" }, "usdot", "USDOT number is digits only"],
    [{ mc: "123456789" }, "mc", "MC number is digits only, up to 8"],
    [{ zip: "7700" }, "zip", ZIP_MESSAGE],
    [{ zip: "" }, "zip", ZIP_MESSAGE],
  ])("rejects %j", (input, field, message) => {
    expect(errorsOf(carrierDetailsSchema, validCarrierDetails(input))[field]).toContain(message);
  });

  it("asks for everything on an empty form", () => {
    expect(Object.keys(errorsOf(carrierDetailsSchema, {})).sort()).toEqual([
      "billingEmail",
      "companyName",
      "contactName",
      "zip",
    ]);
  });
});

describe("acceptTermsSchema", () => {
  it("accepts only a real true", () => {
    expect(acceptTermsSchema.parse({ accepted: true })).toEqual({ accepted: true });
    for (const accepted of [false, "true", 1, undefined, null]) {
      expect(errorsOf(acceptTermsSchema, { accepted })).toEqual({ accepted: TERMS_MESSAGE });
    }
  });
});

describe("driverSearchSchema", () => {
  it("fills the defaults from an empty query", () => {
    expect(driverSearchSchema.parse({})).toEqual({
      radiusMiles: SEARCH_RADIUS_DEFAULT_MILES,
      cdlClass: undefined,
      endorsements: [],
      minYears: undefined,
      twicActive: undefined,
      medicalCardActive: undefined,
      manualOnly: undefined,
      equipmentTypes: [],
      mvrMax: undefined,
      page: 1,
    });
  });

  it("reads the URL's strings: numbers, flags, one value or a list", () => {
    expect(
      driverSearchSchema.parse({
        radiusMiles: "100",
        cdlClass: "B",
        endorsements: "H",
        minYears: "5",
        twicActive: "true",
        medicalCardActive: "false",
        manualOnly: "true",
        equipmentTypes: ["dry_van", "reefer", "dry_van"],
        mvrMax: "minor_1_2",
        page: "3",
      }),
    ).toEqual({
      radiusMiles: 100,
      cdlClass: "B",
      endorsements: ["H"],
      minYears: 5,
      twicActive: true,
      medicalCardActive: false,
      manualOnly: true,
      equipmentTypes: ["dry_van", "reefer"],
      mvrMax: "minor_1_2",
      page: 3,
    });
  });

  it("treats blanks and 'any' as no filter", () => {
    const parsed = driverSearchSchema.parse({
      cdlClass: "",
      minYears: "",
      twicActive: "",
      medicalCardActive: "any",
      mvrMax: "",
      endorsements: "",
    });
    expect(parsed.cdlClass).toBeUndefined();
    expect(parsed.minYears).toBeUndefined();
    expect(parsed.twicActive).toBeUndefined();
    expect(parsed.medicalCardActive).toBeUndefined();
    expect(parsed.mvrMax).toBeUndefined();
    expect(parsed.endorsements).toEqual([]);
  });

  it.each([
    [{ radiusMiles: "4" }, "radiusMiles"],
    [{ radiusMiles: "251" }, "radiusMiles"],
    [{ radiusMiles: "12.5" }, "radiusMiles"],
    [{ cdlClass: "C" }, "cdlClass"],
    [{ endorsements: ["P"] }, "endorsements.0"],
    [{ minYears: "-1" }, "minYears"],
    [{ minYears: "61" }, "minYears"],
    [{ equipmentTypes: ["yard_mule"] }, "equipmentTypes.0"],
    [{ mvrMax: "dirty" }, "mvrMax"],
    [{ page: "0" }, "page"],
  ])("rejects %j", (input, field) => {
    expect(Object.keys(errorsOf(driverSearchSchema, input))).toContain(field);
  });
});

describe("driverIdSchema", () => {
  it("takes a uuid and nothing else", () => {
    expect(driverIdSchema.parse({ driverId: DRIVER_ID })).toEqual({ driverId: DRIVER_ID });
    expect(errorsOf(driverIdSchema, { driverId: "123" })).toEqual({ driverId: "Driver not found" });
  });
});
