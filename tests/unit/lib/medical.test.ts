import { describe, expect, it } from "vitest";
import { EXPIRY_TEXTS_APPROVED, expiryNoticeText } from "@/content/sms-samples";
import { MEDICAL_DATE_PROMPT, medicalCardExpired, medicalSummary, needsMedicalDate } from "@/lib/drivers/medical";
import { SHIFT_READY_ITEM_LABELS, shiftReadyMissing } from "@/lib/drivers/tiers";
import { smsSegments } from "@/lib/sms/segments";
import { MEDICAL_DATE_MESSAGE, MEDICAL_PAST_MESSAGE, credentialsScreenSchema } from "@/lib/validation/onboarding.schema";
import { buildDriver } from "../../setup/factories";

const TODAY = "2026-11-16";
const ALL_PAPERS = ["cdl_front", "cdl_back", "medical_card"] as const;

/** The medical card date and the text before a card expires (0041). */
describe("medical card date", () => {
  it("a passed date is expired; today and later are not; no date is unknown, never expired", () => {
    expect(medicalCardExpired({ medicalCardExpiresOn: "2026-11-15" }, TODAY)).toBe(true);
    expect(medicalCardExpired({ medicalCardExpiresOn: TODAY }, TODAY)).toBe(false);
    expect(medicalCardExpired({ medicalCardExpiresOn: "2027-01-01" }, TODAY)).toBe(false);
    expect(medicalCardExpired({ medicalCardExpiresOn: null }, TODAY)).toBe(false);
  });

  it("an expired card keeps the driver from shift offers, like the database rule", () => {
    const driver = buildDriver({ medicalCardExpiresOn: "2026-11-01" });
    expect(shiftReadyMissing(driver, ALL_PAPERS, TODAY)).toEqual(["medical_card_expired"]);
    expect(shiftReadyMissing(buildDriver({ medicalCardExpiresOn: null }), ALL_PAPERS, TODAY)).toEqual([]);
    expect(SHIFT_READY_ITEM_LABELS.medical_card_expired).toBe("Medical card expired");
  });

  it("reads to carriers and admins with its date, and asks a yes with no date for one", () => {
    expect(medicalSummary({ medicalCardActive: null, medicalCardExpiresOn: null }, TODAY)).toBe("Not answered");
    expect(medicalSummary({ medicalCardActive: false, medicalCardExpiresOn: null }, TODAY)).toBe("medical card not current");
    expect(medicalSummary({ medicalCardActive: true, medicalCardExpiresOn: null }, TODAY)).toBe("medical card current");
    expect(medicalSummary({ medicalCardActive: true, medicalCardExpiresOn: "2026-11-01" }, TODAY)).toBe("medical card expired");
    expect(medicalSummary({ medicalCardActive: true, medicalCardExpiresOn: "2027-03-09" }, TODAY)).toBe("medical card to Mar 9, 2027");
    expect(needsMedicalDate({ medicalCardActive: true, medicalCardExpiresOn: null })).toBe(true);
    expect(needsMedicalDate({ medicalCardActive: true, medicalCardExpiresOn: "2027-03-09" })).toBe(false);
    expect(needsMedicalDate({ medicalCardActive: false, medicalCardExpiresOn: null })).toBe(false);
    expect(MEDICAL_DATE_PROMPT).toBe("Add your medical card expiry date to your profile.");
  });

  it("a yes needs a date that has not passed; a no drops it", () => {
    const parse = (input: object) => credentialsScreenSchema.safeParse({ twicActive: false, ...input });
    expect(parse({ medicalCardActive: true }).error?.issues[0]?.message).toBe(MEDICAL_DATE_MESSAGE);
    expect(parse({ medicalCardActive: true, medicalCardExpiresOn: "2020-01-01" }).error?.issues[0]?.message).toBe(MEDICAL_PAST_MESSAGE);
    expect(parse({ medicalCardActive: true, medicalCardExpiresOn: "2099-01-01" }).data).toMatchObject({ medicalCardExpiresOn: "2099-01-01" });
    expect(parse({ medicalCardActive: false, medicalCardExpiresOn: "2099-01-01" }).data).toMatchObject({ medicalCardExpiresOn: null });
  });
});

describe("the text before a card expires", () => {
  it("waits for Annie's approval of the wording", () => {
    expect(EXPIRY_TEXTS_APPROVED).toBe(false);
  });

  it.each([
    ["Dec 14", null],
    [null, "Dec 14"],
    ["Dec 14", "Dec 20"],
    ["Sep 30", "Sep 30"],
  ])("medical %s, TWIC %s: one GSM-7 segment with straight apostrophes and STOP", (medical, twic) => {
    const text = expiryNoticeText(medical, twic);
    expect(smsSegments(text)).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(text).toMatch(/^FleetGrid: /);
    expect(text).toMatch(/Reply STOP to opt out\.$/);
  });
});
