// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import {
  confirmUploadSchema,
  documentIdSchema,
  documentUploadSchema,
  FILE_SIZE_MESSAGE,
  FILE_TYPE_MESSAGE,
  validateUploadFile,
} from "@/lib/validation/document.schema";
import {
  CLEARINGHOUSE_MESSAGE,
  driverAvailabilitySchema,
  driverBasicsSchema,
  driverCardSchema,
  driverChecksSchema,
  driverLicensesSchema,
  EMPLOYMENT_MESSAGE,
  smsConsentSchema,
} from "@/lib/validation/driver.schema";
import {
  CDL_CLASS_MESSAGE,
  EQUIPMENT_MESSAGE,
  MEDICAL_CARD_MESSAGE,
  MVR_MESSAGE,
  TRANSMISSION_MESSAGE,
  TWIC_MESSAGE,
} from "@/lib/validation/onboarding.schema";
import {
  chooseRoleSchema,
  otpCodeSchema,
  phoneSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from "@/lib/validation/phone.schema";
import {
  DRIVER_ID,
  validAvailability,
  validBasics,
  validCard,
  validChecks,
  validLicenses,
} from "../../setup/factories";

/** Returns { field: firstMessage } for a failed parse. */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
  return errors;
}

describe("phone schemas", () => {
  it("phoneSchema outputs E.164", () => {
    expect(phoneSchema.parse("(555) 555-0100")).toBe("+15555550100");
    expect(phoneSchema.parse(" +1 555 555 0100 ")).toBe("+15555550100");
  });

  it.each([
    ["", "Enter your mobile number"],
    ["   ", "Enter your mobile number"],
    ["12345", "Enter a valid US mobile number"],
    ["+447911123456", "Enter a valid US mobile number"],
    ["not a phone", "Enter a valid US mobile number"],
  ])("phoneSchema rejects %j", (input, message) => {
    expect(errorsOf(phoneSchema, input)).toEqual({ form: message });
  });

  it("phoneSchema rejects non-strings", () => {
    expect(errorsOf(phoneSchema, undefined)).toEqual({ form: "Enter your mobile number" });
    expect(errorsOf(phoneSchema, 5555550100)).toEqual({ form: "Enter your mobile number" });
  });

  it("otpCodeSchema accepts exactly six digits", () => {
    expect(otpCodeSchema.parse("123456")).toBe("123456");
    expect(otpCodeSchema.parse(" 123456 ")).toBe("123456");
  });

  it.each(["", "12345", "1234567", "12345a", "12 456", "١٢٣٤٥٦"])(
    "otpCodeSchema rejects %j",
    (input) => {
      expect(errorsOf(otpCodeSchema, input)).toEqual({ form: "Enter the 6-digit code" });
    },
  );

  it("otpCodeSchema rejects a missing code", () => {
    expect(errorsOf(otpCodeSchema, undefined)).toEqual({ form: "Enter the code we texted you" });
  });

  it("requestOtpSchema and verifyOtpSchema validate their fields", () => {
    expect(requestOtpSchema.parse({ phone: "5555550100" })).toEqual({ phone: "+15555550100" });
    expect(verifyOtpSchema.parse({ phone: "5555550100", code: "123456" })).toEqual({
      phone: "+15555550100",
      code: "123456",
    });
    expect(errorsOf(verifyOtpSchema, { phone: "x", code: "1" })).toEqual({
      phone: "Enter a valid US mobile number",
      code: "Enter the 6-digit code",
    });
    expect(errorsOf(requestOtpSchema, {})).toEqual({ phone: "Enter your mobile number" });
  });

  it("chooseRoleSchema allows driver and carrier only", () => {
    expect(chooseRoleSchema.parse({ role: "driver" })).toEqual({ role: "driver" });
    expect(chooseRoleSchema.parse({ role: "carrier" })).toEqual({ role: "carrier" });
    for (const role of ["admin", "", undefined, "DRIVER"]) {
      expect(errorsOf(chooseRoleSchema, { role })).toEqual({ role: "Choose Driver or Carrier" });
    }
  });
});

describe("driverBasicsSchema (step 1)", () => {
  it("accepts valid input and trims text", () => {
    expect(driverBasicsSchema.parse(validBasics({ fullName: "  Pat Driver  " }))).toEqual({
      fullName: "Pat Driver",
      zip: "75201",
      serviceRadiusMiles: 50,
    });
  });

  it("ignores a typed city and state: they come from the dataset for the ZIP", () => {
    const parsed = driverBasicsSchema.parse(validBasics({ city: "Typed", state: "ZZ" }));
    expect(parsed).not.toHaveProperty("city");
    expect(parsed).not.toHaveProperty("state");
  });

  it("service radius defaults to 50 and accepts numeric strings from forms", () => {
    expect(
      driverBasicsSchema.parse(validBasics({ serviceRadiusMiles: undefined })).serviceRadiusMiles,
    ).toBe(50);
    expect(
      driverBasicsSchema.parse(validBasics({ serviceRadiusMiles: "125" })).serviceRadiusMiles,
    ).toBe(125);
    expect(
      driverBasicsSchema.parse(validBasics({ serviceRadiusMiles: 5 })).serviceRadiusMiles,
    ).toBe(5);
    expect(
      driverBasicsSchema.parse(validBasics({ serviceRadiusMiles: 500 })).serviceRadiusMiles,
    ).toBe(500);
  });

  it.each([
    [{ fullName: "" }, { fullName: "Enter your full name" }],
    [{ fullName: " P " }, { fullName: "Enter your full name" }],
    [{ fullName: undefined }, { fullName: "Enter your full name" }],
    [{ fullName: "x".repeat(101) }, { fullName: "Name must be 100 characters or fewer" }],
    [{ zip: "" }, { zip: "Enter a 5-digit ZIP code" }],
    [{ zip: undefined }, { zip: "Enter your ZIP code" }],
    [{ zip: "7520" }, { zip: "Enter a 5-digit ZIP code" }],
    [{ zip: "752011" }, { zip: "Enter a 5-digit ZIP code" }],
    [{ zip: "75201-1234" }, { zip: "Enter a 5-digit ZIP code" }],
    [{ zip: "7520a" }, { zip: "Enter a 5-digit ZIP code" }],
    [{ serviceRadiusMiles: 4 }, { serviceRadiusMiles: "Radius must be at least 5 miles" }],
    [{ serviceRadiusMiles: 501 }, { serviceRadiusMiles: "Radius must be 500 miles or less" }],
    [{ serviceRadiusMiles: 10.5 }, { serviceRadiusMiles: "Enter a whole number" }],
    [{ serviceRadiusMiles: "abc" }, { serviceRadiusMiles: "Enter your service radius" }],
  ])("rejects %j", (overrides, expected) => {
    expect(errorsOf(driverBasicsSchema, validBasics(overrides))).toEqual(expected);
  });

  it("a blank radius falls back to the default, like an untouched field", () => {
    for (const blank of ["", null]) {
      expect(
        driverBasicsSchema.parse(validBasics({ serviceRadiusMiles: blank })).serviceRadiusMiles,
      ).toBe(50);
    }
  });

  it("reports every invalid field of an empty form", () => {
    expect(Object.keys(errorsOf(driverBasicsSchema, {})).sort()).toEqual(["fullName", "zip"]);
  });
});

describe("driverLicensesSchema (CDL and licenses)", () => {
  it("accepts valid input", () => {
    expect(driverLicensesSchema.parse(validLicenses())).toEqual({
      employmentType: "w2",
      cdlClass: "A",
      endorsements: ["H", "T"],
      yearsExperience: 8,
      certifications: ["OSHA 10"],
    });
  });

  it("removes duplicates and applies the letter rules", () => {
    const parsed = driverLicensesSchema.parse(
      validLicenses({
        endorsements: ["H", "H", "X"],
        certifications: ["TWIC", " TWIC ", "OSHA 10"],
      }),
    );
    // The letter rules apply on the profile too: X brings H and N, in display order.
    expect(parsed.endorsements).toEqual(["X", "H", "N"]);
    expect(parsed.certifications).toEqual(["TWIC", "OSHA 10"]);
  });

  it("applies the S-needs-P rule on the profile", () => {
    const parsed = driverLicensesSchema.parse(validLicenses({ endorsements: ["S"] }));
    expect(parsed.endorsements).toEqual(["P", "S"]);
  });

  it("has no work type: every card is a CDL driver at launch", () => {
    const parsed = driverLicensesSchema.parse(validLicenses({ operatorTypes: ["mechanic"] }));
    expect(parsed).not.toHaveProperty("operatorTypes");
  });

  it("W-2 or 1099 is optional (profile page only); endorsements and certifications default to empty", () => {
    const parsed = driverLicensesSchema.parse(
      validLicenses({ employmentType: undefined, endorsements: undefined, certifications: undefined }),
    );
    expect(parsed.employmentType).toBeNull();
    expect(parsed.endorsements).toEqual([]);
    expect(parsed.certifications).toEqual([]);
    expect(driverLicensesSchema.parse(validLicenses({ employmentType: null })).employmentType).toBeNull();
  });

  it("accepts experience from 0 to 60, including form strings", () => {
    expect(driverLicensesSchema.parse(validLicenses({ yearsExperience: 0 })).yearsExperience).toBe(
      0,
    );
    expect(driverLicensesSchema.parse(validLicenses({ yearsExperience: 60 })).yearsExperience).toBe(
      60,
    );
    expect(
      driverLicensesSchema.parse(validLicenses({ yearsExperience: "12" })).yearsExperience,
    ).toBe(12);
  });

  it.each([
    [{ employmentType: "contractor" }, { employmentType: EMPLOYMENT_MESSAGE }],
    [{ cdlClass: undefined }, { cdlClass: CDL_CLASS_MESSAGE }],
    [{ cdlClass: "none" }, { cdlClass: CDL_CLASS_MESSAGE }],
    [{ cdlClass: "D" }, { cdlClass: CDL_CLASS_MESSAGE }],
    [{ endorsements: ["Z"] }, "endorsements.0"],
    [{ yearsExperience: -1 }, { yearsExperience: "Experience cannot be negative" }],
    [{ yearsExperience: 61 }, { yearsExperience: "Experience must be 60 years or less" }],
    [{ yearsExperience: 2.5 }, { yearsExperience: "Enter a whole number" }],
    [{ yearsExperience: undefined }, { yearsExperience: "Enter your years of experience" }],
    [{ yearsExperience: "many" }, { yearsExperience: "Enter your years of experience" }],
    [{ yearsExperience: "" }, { yearsExperience: "Enter your years of experience" }],
    [{ yearsExperience: null }, { yearsExperience: "Enter your years of experience" }],
    [{ certifications: [""] }, { "certifications.0": "Certifications cannot be empty" }],
    [
      { certifications: ["x".repeat(61)] },
      { "certifications.0": "Each certification must be 60 characters or fewer" },
    ],
    [
      { certifications: Array.from({ length: 21 }, (_, i) => `Cert ${i}`) },
      { certifications: "Add up to 20 certifications" },
    ],
  ])("rejects %j", (overrides, expected) => {
    const errors = errorsOf(driverLicensesSchema, validLicenses(overrides));
    if (typeof expected === "string") expect(Object.keys(errors)).toEqual([expected]);
    else expect(errors).toEqual(expected);
  });
});

describe("driverAvailabilitySchema (profile page only)", () => {
  it("accepts valid input and removes duplicates", () => {
    expect(
      driverAvailabilitySchema.parse(
        validAvailability({ availability: ["on_call", "on_call", "weekends"] }),
      ),
    ).toEqual({ availability: ["on_call", "weekends"], bio: "Reliable and on time." });
  });

  it("bio is optional, trimmed, and blank becomes null", () => {
    expect(driverAvailabilitySchema.parse(validAvailability({ bio: "" })).bio).toBeNull();
    expect(driverAvailabilitySchema.parse(validAvailability({ bio: undefined })).bio).toBeNull();
    expect(driverAvailabilitySchema.parse(validAvailability({ bio: "  hi  " })).bio).toBe("hi");
  });

  it("accepts a bio of exactly 500 characters", () => {
    const bio = "x".repeat(500);
    expect(driverAvailabilitySchema.parse(validAvailability({ bio })).bio).toBe(bio);
  });

  it("availability is optional: sign-up no longer asks it", () => {
    expect(driverAvailabilitySchema.parse(validAvailability({ availability: [] })).availability).toEqual(
      [],
    );
    expect(
      driverAvailabilitySchema.parse(validAvailability({ availability: undefined })).availability,
    ).toEqual([]);
  });

  it.each([
    [{ availability: ["nights"] }, "availability.0"],
    [{ bio: "x".repeat(501) }, { bio: "Bio must be 500 characters or fewer" }],
  ])("rejects %j", (overrides, expected) => {
    const errors = errorsOf(driverAvailabilitySchema, validAvailability(overrides));
    if (typeof expected === "string") expect(Object.keys(errors)).toEqual([expected]);
    else expect(errors).toEqual(expected);
  });
});

describe("smsConsentSchema (step 5)", () => {
  it("accepts only an explicit true", () => {
    expect(smsConsentSchema.parse({ consent: true })).toEqual({ consent: true });
  });

  it.each([false, undefined, null, "true", "on", 1])("rejects %j", (consent) => {
    expect(errorsOf(smsConsentSchema, { consent })).toEqual({
      consent: "You must agree to receive text messages to continue",
    });
  });
});

describe("driverChecksSchema (equipment and checks)", () => {
  it("accepts the answers", () => {
    expect(driverChecksSchema.parse(validChecks())).toEqual({
      drivingStyles: ["local_day_cab", "regional"],
      transmission: "manual_ok",
      equipmentTypes: ["dry_van", "flatbed"],
      twicActive: true,
      medicalCardActive: true,
      clearinghouseRegistered: true,
      mvrStatus: "clean",
    });
  });

  it("driving style and the Clearinghouse are optional (profile page only); the rest is required", () => {
    expect(
      driverChecksSchema.parse(
        validChecks({ drivingStyles: undefined, clearinghouseRegistered: undefined }),
      ),
    ).toMatchObject({ drivingStyles: [], clearinghouseRegistered: null });
    expect(
      errorsOf(driverChecksSchema, {
        drivingStyles: [],
        clearinghouseRegistered: null,
        twicActive: false,
        medicalCardActive: true,
      }),
    ).toEqual({
      transmission: TRANSMISSION_MESSAGE,
      equipmentTypes: EQUIPMENT_MESSAGE,
      mvrStatus: MVR_MESSAGE,
    });
  });

  it("removes duplicate driving styles and equipment", () => {
    const parsed = driverChecksSchema.parse(
      validChecks({ drivingStyles: ["otr", "otr"], equipmentTypes: ["reefer", "reefer"] }),
    );
    expect(parsed.drivingStyles).toEqual(["otr"]);
    expect(parsed.equipmentTypes).toEqual(["reefer"]);
  });

  it.each([
    [{ twicActive: undefined }, { twicActive: TWIC_MESSAGE }],
    [{ twicActive: "yes" }, { twicActive: TWIC_MESSAGE }],
    [{ twicActive: null }, { twicActive: TWIC_MESSAGE }],
    [{ medicalCardActive: 1 }, { medicalCardActive: MEDICAL_CARD_MESSAGE }],
    [{ clearinghouseRegistered: "true" }, { clearinghouseRegistered: CLEARINGHOUSE_MESSAGE }],
    [{ mvrStatus: "none" }, { mvrStatus: MVR_MESSAGE }],
    [{ mvrStatus: true }, { mvrStatus: MVR_MESSAGE }],
    [{ mvrStatus: null }, { mvrStatus: MVR_MESSAGE }],
    [{ transmission: "stick" }, { transmission: TRANSMISSION_MESSAGE }],
    [{ transmission: null }, { transmission: TRANSMISSION_MESSAGE }],
    [{ equipmentTypes: [] }, { equipmentTypes: EQUIPMENT_MESSAGE }],
    [{ drivingStyles: ["night"] }, "drivingStyles.0"],
    [{ equipmentTypes: ["tanker"] }, "equipmentTypes.0"],
  ])("rejects %j", (overrides, expected) => {
    const errors = errorsOf(driverChecksSchema, validChecks(overrides));
    if (typeof expected === "string") expect(Object.keys(errors)).toEqual([expected]);
    else expect(errors).toEqual(expected);
  });
});

describe("driverCardSchema (profile edit)", () => {
  it("accepts a full card", () => {
    expect(driverCardSchema.parse(validCard())).toEqual({
      fullName: "Pat Driver",
      zip: "75201",
      serviceRadiusMiles: 50,
      employmentType: "w2",
      cdlClass: "A",
      endorsements: ["H", "T"],
      yearsExperience: 8,
      certifications: ["OSHA 10"],
      drivingStyles: ["local_day_cab", "regional"],
      transmission: "manual_ok",
      equipmentTypes: ["dry_van", "flatbed"],
      twicActive: true,
      medicalCardActive: true,
      clearinghouseRegistered: true,
      mvrStatus: "clean",
      availability: ["full_time", "weekends"],
      bio: "Reliable and on time.",
    });
  });

  it("rejects No CDL: every card is a CDL driver at launch", () => {
    expect(errorsOf(driverCardSchema, validCard({ cdlClass: "none" }))).toEqual({
      cdlClass: CDL_CLASS_MESSAGE,
    });
  });

  it("requires the sign-up answers: transmission, equipment and the MVR", () => {
    expect(
      errorsOf(
        driverCardSchema,
        validCard({ transmission: null, equipmentTypes: [], mvrStatus: null }),
      ),
    ).toEqual({
      transmission: TRANSMISSION_MESSAGE,
      equipmentTypes: EQUIPMENT_MESSAGE,
      mvrStatus: MVR_MESSAGE,
    });
    expect(
      errorsOf(driverCardSchema, validCard({ transmission: undefined, mvrStatus: undefined })),
    ).toEqual({ transmission: TRANSMISSION_MESSAGE, mvrStatus: MVR_MESSAGE });
  });

  it("lets the profile-only answers stay empty, as a card straight out of sign-up has them", () => {
    const parsed = driverCardSchema.parse(
      validCard({
        employmentType: null,
        drivingStyles: [],
        clearinghouseRegistered: null,
        availability: [],
        certifications: [],
        bio: "",
      }),
    );
    expect(parsed).toMatchObject({
      employmentType: null,
      drivingStyles: [],
      clearinghouseRegistered: null,
      availability: [],
      certifications: [],
      bio: null,
      twicActive: true,
      medicalCardActive: true,
    });
  });

  it("validates fields from every section at once", () => {
    const errors = errorsOf(
      driverCardSchema,
      validCard({ zip: "1", cdlClass: "none", equipmentTypes: [] }),
    );
    expect(Object.keys(errors).sort()).toEqual(["cdlClass", "equipmentTypes", "zip"]);
  });
});

describe("document schemas", () => {
  const validUpload = (overrides: Record<string, unknown> = {}) => ({
    type: "cdl_front",
    fileName: "front.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 250_000,
    ...overrides,
  });

  it("accepts every allowed type and mime", () => {
    for (const type of ["cdl_front", "cdl_back", "medical_card", "certification", "other"]) {
      expect(documentUploadSchema.parse(validUpload({ type })).type).toBe(type);
    }
    for (const mimeType of ["image/jpeg", "image/png", "image/webp", "application/pdf"]) {
      expect(documentUploadSchema.parse(validUpload({ mimeType })).mimeType).toBe(mimeType);
    }
  });

  it("accepts a file of exactly 10 MB", () => {
    expect(documentUploadSchema.parse(validUpload({ sizeBytes: MAX_UPLOAD_BYTES })).sizeBytes).toBe(
      MAX_UPLOAD_BYTES,
    );
  });

  it.each([
    [{ type: "passport" }, { type: "Select a document type" }],
    [{ type: undefined }, { type: "Select a document type" }],
    [{ fileName: "" }, { fileName: "File name is required" }],
    [{ fileName: undefined }, { fileName: "File name is required" }],
    [{ fileName: "x".repeat(201) }, { fileName: "File name must be 200 characters or fewer" }],
    [{ mimeType: "image/gif" }, { mimeType: FILE_TYPE_MESSAGE }],
    [{ mimeType: "application/x-msdownload" }, { mimeType: FILE_TYPE_MESSAGE }],
    [{ mimeType: "" }, { mimeType: FILE_TYPE_MESSAGE }],
    [{ mimeType: undefined }, { mimeType: FILE_TYPE_MESSAGE }],
    [{ sizeBytes: 0 }, { sizeBytes: "File is empty" }],
    [{ sizeBytes: undefined }, { sizeBytes: "File is empty" }],
    [{ sizeBytes: MAX_UPLOAD_BYTES + 1 }, { sizeBytes: FILE_SIZE_MESSAGE }],
  ])("documentUploadSchema rejects %j", (overrides, expected) => {
    expect(errorsOf(documentUploadSchema, validUpload(overrides))).toEqual(expected);
  });

  it("confirmUploadSchema accepts a well-formed storage path", () => {
    const storagePath = `${DRIVER_ID}/c0000000-0000-4000-8000-000000000001.pdf`;
    expect(
      confirmUploadSchema.parse({ type: "other", fileName: " scan.pdf ", storagePath }),
    ).toEqual({ type: "other", fileName: "scan.pdf", storagePath });
  });

  it.each([
    `${DRIVER_ID}/../other/file.jpg`,
    `${DRIVER_ID}/file.jpg`,
    `${DRIVER_ID}/c0000000-0000-4000-8000-000000000001.exe`,
    `${DRIVER_ID}/nested/c0000000-0000-4000-8000-000000000001.jpg`,
    "c0000000-0000-4000-8000-000000000001.jpg",
    "",
    undefined,
  ])("confirmUploadSchema rejects storage path %j", (storagePath) => {
    expect(
      errorsOf(confirmUploadSchema, { type: "other", fileName: "a.jpg", storagePath }),
    ).toEqual({ storagePath: "Upload did not finish. Please try again." });
  });

  it("confirmUploadSchema validates type and file name", () => {
    const storagePath = `${DRIVER_ID}/c0000000-0000-4000-8000-000000000001.pdf`;
    expect(errorsOf(confirmUploadSchema, { type: "x", fileName: "", storagePath })).toEqual({
      type: "Select a document type",
      fileName: "File name is required",
    });
    expect(errorsOf(confirmUploadSchema, { storagePath })).toEqual({
      type: "Select a document type",
      fileName: "File name is required",
    });
    expect(
      errorsOf(confirmUploadSchema, { type: "other", fileName: "x".repeat(201), storagePath }),
    ).toEqual({ fileName: "File name must be 200 characters or fewer" });
  });

  it("documentIdSchema requires a uuid", () => {
    const documentId = "d0000000-0000-4000-8000-000000000001";
    expect(documentIdSchema.parse({ documentId })).toEqual({ documentId });
    expect(errorsOf(documentIdSchema, { documentId: "1" })).toEqual({
      documentId: "Invalid document",
    });
    expect(errorsOf(documentIdSchema, {})).toEqual({ documentId: "Invalid document" });
  });

  it("validateUploadFile gives a message for bad files and null for good ones", () => {
    expect(validateUploadFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateUploadFile({ type: "application/pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(validateUploadFile({ type: "image/gif", size: 1000 })).toBe(FILE_TYPE_MESSAGE);
    expect(validateUploadFile({ type: "", size: 1000 })).toBe(FILE_TYPE_MESSAGE);
    expect(validateUploadFile({ type: "image/png", size: 0 })).toBe("File is empty");
    expect(validateUploadFile({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 })).toBe(
      FILE_SIZE_MESSAGE,
    );
  });
});
