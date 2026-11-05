// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SMS_TWIC_DATE } from "@/content/sms-samples";
import { needsTwicDate, twicIssue, twicSummary, twicValid } from "@/lib/drivers/twic";
import { smsSegments } from "@/lib/sms/segments";
import { TWIC_DATE_MESSAGE, TWIC_PAST_MESSAGE, credentialsScreenSchema } from "@/lib/validation/onboarding.schema";

const yes = (twicExpiresOn: string | null) => ({ twicActive: true, twicExpiresOn });

describe("TWIC", () => {
  it("counts only with a date not passed on the day that matters", () => {
    expect(twicValid(yes("2026-11-20"), "2026-11-20")).toBe(true);
    expect(twicValid(yes("2026-11-20"), "2026-11-21")).toBe(false);
    expect(twicValid(yes(null), "2026-11-20")).toBe(false);
    expect(twicValid({ twicActive: false, twicExpiresOn: "2099-01-01" }, "2026-11-20")).toBe(false);
  });

  it("reads as what it is", () => {
    expect(twicSummary(yes("2027-03-05"), "2026-11-20")).toBe("TWIC to Mar 5, 2027");
    expect(twicSummary(yes("2026-11-01"), "2026-11-20")).toBe("TWIC expired");
    expect(twicSummary(yes(null), "2026-11-20")).toBe("TWIC, no expiry date");
    expect(twicSummary({ twicActive: false, twicExpiresOn: null })).toBe("No TWIC");
    expect(twicSummary({ twicActive: null, twicExpiresOn: null })).toBe("Not answered");
    expect(needsTwicDate(yes(null))).toBe(true);
    expect(needsTwicDate(yes("2027-01-01"))).toBe(false);
  });

  it("a flag lasts 90 days, and two in 90 days read Needs review", () => {
    const now = new Date("2026-11-20T12:00:00.000Z");
    const days = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
    expect(twicIssue({ twicIssueAt: null, twicIssuePriorAt: null }, now)).toBeNull();
    expect(twicIssue({ twicIssueAt: days(1), twicIssuePriorAt: null }, now)).toBe("issue");
    expect(twicIssue({ twicIssueAt: days(1), twicIssuePriorAt: days(89) }, now)).toBe("needs_review");
    expect(twicIssue({ twicIssueAt: days(1), twicIssuePriorAt: days(91) }, now)).toBe("issue");
    expect(twicIssue({ twicIssueAt: days(91), twicIssuePriorAt: days(92) }, now)).toBeNull();
  });

  it("a yes needs a date that has not passed; a no drops it", () => {
    const parse = (input: object) => credentialsScreenSchema.safeParse({ medicalCardActive: true, ...input });
    expect(parse({ twicActive: true }).error?.issues[0]?.message).toBe(TWIC_DATE_MESSAGE);
    expect(parse({ twicActive: true, twicExpiresOn: "" }).error?.issues[0]?.message).toBe(TWIC_DATE_MESSAGE);
    expect(parse({ twicActive: true, twicExpiresOn: "2020-01-01" }).error?.issues[0]?.message).toBe(TWIC_PAST_MESSAGE);
    expect(parse({ twicActive: true, twicExpiresOn: "2099-01-01" }).data).toMatchObject({ twicExpiresOn: "2099-01-01" });
    expect(parse({ twicActive: false, twicExpiresOn: "2099-01-01" }).data).toMatchObject({ twicExpiresOn: null });
  });

  it("the date text is word for word, GSM-7 and under 160", () => {
    expect(SMS_TWIC_DATE).toBe("FleetGrid: To get port shifts, please add your TWIC expiry date at fleetgridus.com/driver. Reply STOP to opt out.");
    expect(smsSegments(SMS_TWIC_DATE)).toMatchObject({ encoding: "GSM-7" });
    expect(smsSegments(SMS_TWIC_DATE).characters).toBeLessThan(160);
  });
});
