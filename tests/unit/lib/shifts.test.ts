// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SMS_SAMPLE_CONFIRMATION, SMS_SAMPLE_FILLED, SMS_SAMPLE_OFFER } from "@/content/sms-samples";
import { readInbound } from "@/lib/shifts/inbound";
import { displayStatus, isBookable, isReminderWindow, quietHoursSendAt, sendAfterFor } from "@/lib/shifts/schedule";
import { BROADCAST_CAP, shuffleAndCap } from "@/lib/shifts/shuffle";
import {
  APPROVED_TEXT,
  bookedText,
  cancelledText,
  CLOSED_TEXT,
  FILLED_TEXT,
  formatShiftWhen,
  FORMAT_HELP_TEXT,
  offerText,
} from "@/lib/shifts/texts";
import { shiftPostSchema } from "@/lib/validation/shift.schema";
import { isValidTwilioSignature, twilioSignature } from "@/server/twilio/signature";
import { smsSegments } from "@/lib/sms/segments";

/** The sample's shift: Pasadena TX, Tuesday October 14 at 6:00 AM Houston time (CDT). */
const SAMPLE = { cdlClass: "A" as const, city: "Pasadena", state: "TX", startsAt: "2025-10-14T11:00:00.000Z" };

/** A seeded generator, so the fairness checks are the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("the shift texts", () => {
  it("fill the approved templates word for word", () => {
    expect(offerText(SAMPLE, "4821")).toBe(SMS_SAMPLE_OFFER);
    expect(bookedText(SAMPLE)).toBe(SMS_SAMPLE_CONFIRMATION);
    expect(FILLED_TEXT).toBe(SMS_SAMPLE_FILLED);
  });

  describe("the booked text stays one segment", () => {
    const end = ". See details in your FleetGrid account: fleetgridus.com/driver. Reply HELP for help.";
    // The longest date and time there is, for the 10 service-area cities that ran over.
    const LONGEST = "2026-09-30T17:00:00.000Z"; // Wed Sep 30 12:00 PM Houston
    const LONG_CITIES = ["Missouri City", "North Houston", "Plantersville", "South Houston", "West Columbia", "East Bernard", "Lake Jackson", "Mont Belvieu", "Port Bolivar", "Prairie View"];

    for (const city of LONG_CITIES) {
      it(`${city}: the class goes, every other word stays`, () => {
        const text = bookedText({ cdlClass: "A", city, state: "TX", startsAt: LONGEST });
        expect(text).toBe(`FleetGrid: Your shift is booked. ${city} TX, Wed Sep 30 12:00 PM${end}`);
        expect(smsSegments(text)).toMatchObject({ segments: 1, encoding: "GSM-7" });
      });
    }

    it("a shorter place keeps the class, as approved", () => {
      expect(bookedText({ cdlClass: "A", city: "Pasadena", state: "TX", startsAt: LONGEST })).toBe(`FleetGrid: Your shift is booked. CDL-A, Pasadena TX, Wed Sep 30 12:00 PM${end}`);
    });

    it("the class goes only when it must: exactly 160 keeps it", () => {
      const fits = bookedText({ cdlClass: "A", city: "League City", state: "TX", startsAt: LONGEST });
      expect(fits).toContain("CDL-A, ");
      expect(fits).toHaveLength(160);
    });

    it("longer still, the date shortens too, and a time with minutes keeps them", () => {
      const city = "Saint Francis Heights";
      expect(bookedText({ cdlClass: "A", city, state: "TX", startsAt: "2026-10-14T11:00:00.000Z" })).toBe(`FleetGrid: Your shift is booked. ${city} TX, Oct 14 6AM${end}`);
      expect(bookedText({ cdlClass: "A", city, state: "TX", startsAt: "2026-10-14T11:30:00.000Z" })).toBe(`FleetGrid: Your shift is booked. ${city} TX, Oct 14 6:30AM${end}`);
      expect(smsSegments(bookedText({ cdlClass: "A", city, state: "TX", startsAt: "2026-10-14T11:30:00.000Z" })).segments).toBe(1);
    });

    it("the alert and the cancellation need no fallback in these cities", () => {
      for (const city of LONG_CITIES) {
        const fields = { cdlClass: "A" as const, city, state: "TX", startsAt: LONGEST };
        expect(smsSegments(offerText(fields, "4821")).segments).toBe(1);
        expect(smsSegments(cancelledText(fields)).segments).toBe(1);
      }
    });
  });

  it("change only the place, the time, the class and the code", () => {
    const other = { cdlClass: "B" as const, city: "Houston", state: "TX", startsAt: "2026-12-01T20:30:00.000Z" };
    expect(offerText(other, "1234")).toBe(
      "FleetGrid: New shift on FleetGrid for CDL-B drivers. Houston TX, Tue Dec 1 2:30 PM. Reply YES 1234 to book it. Reply STOP to opt out.",
    );
    expect(formatShiftWhen("2026-07-04T05:05:00.000Z")).toBe("Sat Jul 4 12:05 AM");
  });

  it("stay within one or two text segments and carry the brand and a way out", () => {
    for (const text of [
      offerText(SAMPLE, "4821"),
      bookedText(SAMPLE),
      FILLED_TEXT,
      cancelledText(SAMPLE),
      APPROVED_TEXT,
      FORMAT_HELP_TEXT,
      CLOSED_TEXT,
    ]) {
      expect(text.startsWith("FleetGrid: ")).toBe(true);
      expect(text).toMatch(/Reply (STOP to opt out|HELP for help)\.$/);
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).not.toMatch(/claim|first to reply|connect|leads|earn|opportunit/i);
    }
  });

  it("the cancellation notice names the time and the place", () => {
    expect(cancelledText(SAMPLE)).toBe(
      "FleetGrid: Your booked shift on Tue Oct 14 6:00 AM in Pasadena TX was cancelled by the company that posted it. Reply HELP for help.",
    );
  });
});

describe("quiet hours", () => {
  const houston = (local: string) => new Date(`${local}-05:00`); // CDT
  const hours = (n: number) => n * 60 * 60 * 1000;

  it("send at once during the day", () => {
    expect(sendAfterFor(houston("2026-10-20T14:00:00"), houston("2026-10-22T06:00:00"))).toBeNull();
    expect(sendAfterFor(houston("2026-10-20T20:59:00"), houston("2026-10-22T06:00:00"))).toBeNull();
    expect(sendAfterFor(houston("2026-10-20T07:00:00"), houston("2026-10-22T06:00:00"))).toBeNull();
  });

  it("hold a night post until 7 AM, the same night or the next morning", () => {
    expect(sendAfterFor(houston("2026-10-20T21:00:00"), houston("2026-10-22T06:00:00"))).toEqual(houston("2026-10-21T07:00:00"));
    expect(sendAfterFor(houston("2026-10-20T23:30:00"), houston("2026-10-22T06:00:00"))).toEqual(houston("2026-10-21T07:00:00"));
    expect(sendAfterFor(houston("2026-10-21T03:15:00"), houston("2026-10-22T06:00:00"))).toEqual(houston("2026-10-21T07:00:00"));
  });

  it("send a night post at once when the shift starts within 12 hours", () => {
    const posted = houston("2026-10-20T22:00:00");
    expect(sendAfterFor(posted, new Date(posted.getTime() + hours(11.9)))).toBeNull();
    expect(sendAfterFor(posted, new Date(posted.getTime() + hours(12)))).not.toBeNull();
  });

  it("use 7 AM Central in winter too", () => {
    expect(sendAfterFor(new Date("2026-12-10T23:00:00-06:00"), new Date("2026-12-12T06:00:00-06:00"))).toEqual(
      new Date("2026-12-11T07:00:00-06:00"),
    );
  });

  it("hold any text at night until 7 AM, the approval text included", () => {
    expect(quietHoursSendAt(houston("2026-10-20T15:00:00"))).toBeNull();
    expect(quietHoursSendAt(houston("2026-10-20T22:30:00"))).toEqual(houston("2026-10-21T07:00:00"));
    expect(quietHoursSendAt(houston("2026-10-21T06:59:00"))).toEqual(houston("2026-10-21T07:00:00"));
  });

  it("the reminder goes only between 10 AM and 7 PM Houston time", () => {
    expect(isReminderWindow(houston("2026-10-20T09:59:00"))).toBe(false);
    expect(isReminderWindow(houston("2026-10-20T10:00:00"))).toBe(true);
    expect(isReminderWindow(houston("2026-10-20T18:59:00"))).toBe(true);
    expect(isReminderWindow(houston("2026-10-20T19:00:00"))).toBe(false);
    expect(isReminderWindow(new Date("2026-12-10T16:00:00Z"))).toBe(true); // the daily cron, winter
    expect(isReminderWindow(new Date("2026-07-10T16:00:00Z"))).toBe(true); // and summer
  });

  it("an open shift past its start is expired, a released one until its end", () => {
    const shift = { status: "open" as const, startsAt: "2026-10-20T11:00:00Z", endsAt: "2026-10-20T19:00:00Z", releasedAt: null };
    expect(displayStatus(shift, new Date("2026-10-20T10:00:00Z"))).toBe("open");
    expect(displayStatus(shift, new Date("2026-10-20T11:00:00Z"))).toBe("expired");
    const released = { ...shift, releasedAt: "2026-10-20T11:30:00Z" };
    expect(isBookable(released, new Date("2026-10-20T12:00:00Z"))).toBe(true);
    expect(isBookable(released, new Date("2026-10-20T19:00:00Z"))).toBe(false);
    expect(displayStatus({ ...shift, status: "booked" }, new Date("2026-10-21T00:00:00Z"))).toBe("booked");
  });
});

describe("reading replies", () => {
  it("YES with a code, in the ways people type it", () => {
    for (const body of ["YES 4821", "yes 4821", " Yes,4821 ", "YES4821", "Y 4821", "yes #4821.", "YES: 4821!"]) {
      expect(readInbound(body, false), body).toEqual({ type: "yes", code: "4821" });
    }
    expect(readInbound("YES", false)).toEqual({ type: "yes", code: null });
    expect(readInbound("yes!", false)).toEqual({ type: "yes", code: null });
  });

  it("Twilio's opt-out, opt-in and help keywords are never read as a booking", () => {
    for (const word of ["STOP", "stop", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]) {
      expect(readInbound(word, false).type, word).toBe("opt_out");
    }
    for (const word of ["START", "unstop"]) expect(readInbound(word, true).type, word).toBe("opt_in");
    for (const word of ["HELP", "info"]) expect(readInbound(word, false).type, word).toBe("help");
  });

  it("a bare YES is Twilio's opt-in keyword only for a number that opted out", () => {
    expect(readInbound("YES", true)).toEqual({ type: "opt_in", keyword: "YES" });
    expect(readInbound("YES 4821", true)).toEqual({ type: "yes", code: "4821" });
  });

  it("Twilio's own reading wins", () => {
    expect(readInbound("Stop please", false, "STOP").type).toBe("opt_out");
    expect(readInbound("anything", true, "START").type).toBe("opt_in");
    expect(readInbound("?", false, "HELP").type).toBe("help");
  });

  it("anything else is other", () => {
    for (const body of ["thanks", "YES 48", "NO", "4821", "yes please 4821"]) {
      expect(readInbound(body, false).type, body).toBe("other");
    }
  });
});

describe("the broadcast order", () => {
  const drivers = Array.from({ length: 300 }, (_, index) => `driver-${index}`);

  it("keeps everyone once and caps at 200", () => {
    const order = shuffleAndCap(drivers, seeded(1));
    expect(order).toHaveLength(BROADCAST_CAP);
    expect(new Set(order).size).toBe(BROADCAST_CAP);
    expect(shuffleAndCap(drivers.slice(0, 12), seeded(2)).sort()).toEqual(drivers.slice(0, 12).sort());
  });

  it("differs from one broadcast to the next", () => {
    const random = seeded(7);
    const first = shuffleAndCap(drivers, random);
    const second = shuffleAndCap(drivers, random);
    expect(first).not.toEqual(second);
    expect(first[0] === second[0] && first[1] === second[1]).toBe(false);
  });

  it("gives every driver a fair share of the first 200 over many broadcasts", () => {
    const random = seeded(42);
    const counts = new Map<string, number>();
    const firstPlace = new Map<string, number>();
    const rounds = 3000;
    for (let round = 0; round < rounds; round += 1) {
      const order = shuffleAndCap(drivers, random);
      for (const id of order) counts.set(id, (counts.get(id) ?? 0) + 1);
      firstPlace.set(order[0], (firstPlace.get(order[0]) ?? 0) + 1);
    }
    // Each driver should be in the first 200 two times in three: 2000 of 3000.
    const expected = (rounds * BROADCAST_CAP) / drivers.length;
    for (const id of drivers) {
      const share = counts.get(id) ?? 0;
      expect(Math.abs(share - expected) / expected, id).toBeLessThan(0.08);
    }
    // Nobody is first far more often than chance (10 times in 3000 on average).
    expect(Math.max(...firstPlace.values())).toBeLessThan(30);
  });
});

describe("Twilio's request signature", () => {
  // A signed fixture: Twilio's algorithm written out by hand (URL, then each parameter name
  // and value in name order, HMAC-SHA1 with the auth token, base64).
  const token = "12345";
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+12349013030",
    Digits: "1234",
    From: "+12349013030",
    To: "+18005551212",
  };

  it("signs the URL and the sorted parameters", () => {
    const expected = createHmac("sha1", token)
      .update(
        `${url}CallSidCA1234567890ABCDECaller+12349013030Digits1234From+12349013030To+18005551212`,
      )
      .digest("base64");
    expect(twilioSignature(token, url, { To: params.To, From: params.From, Digits: params.Digits, Caller: params.Caller, CallSid: params.CallSid })).toBe(expected);
    expect(isValidTwilioSignature(token, url, params, expected)).toBe(true);
  });

  it("refuses another URL, another parameter, another token or no signature", () => {
    const good = twilioSignature(token, "https://fleetgridus.com/api/twilio/inbound", params);
    expect(isValidTwilioSignature(token, "https://www.fleetgridus.com/api/twilio/inbound", params, good)).toBe(false);
    expect(isValidTwilioSignature(token, "https://fleetgridus.com/api/twilio/inbound", { ...params, Digits: "9" }, good)).toBe(false);
    expect(isValidTwilioSignature("other", "https://fleetgridus.com/api/twilio/inbound", params, good)).toBe(false);
    expect(isValidTwilioSignature(token, "https://fleetgridus.com/api/twilio/inbound", params, null)).toBe(false);
  });
});

describe("the shift form", () => {
  const valid = {
    zip: "77506",
    date: "2026-11-20",
    startTime: "06:00",
    endTime: "14:00",
    cdlClass: "A",
    endorsements: ["T"],
    minYears: "2",
    equipmentTypes: "container_drayage",
    twicRequired: "on",
    medicalRequired: "",
    manualRequired: false,
    payText: " ",
    workDescription: "Port moves between Barbours Cut and the yard.",
    onsiteContactName: "Lee Yard",
    onsiteContactPhone: "(713) 555-0100",
  };

  it("reads Houston times, the checks and the on-site number", () => {
    const parsed = shiftPostSchema.parse(valid);
    expect(parsed.startsAt.toISOString()).toBe("2026-11-20T12:00:00.000Z");
    expect(parsed.endsAt.toISOString()).toBe("2026-11-20T20:00:00.000Z");
    expect(parsed).toMatchObject({
      minYears: 2,
      equipmentTypes: ["container_drayage"],
      twicRequired: true,
      medicalRequired: false,
      payText: null,
      onsiteContactPhone: "+17135550100",
    });
  });

  it("an end before the start runs past midnight", () => {
    const parsed = shiftPostSchema.parse({ ...valid, startTime: "22:00", endTime: "06:00" });
    expect(parsed.endsAt.getTime() - parsed.startsAt.getTime()).toBe(8 * 60 * 60 * 1000);
  });

  it("requires the on-site contact and the work", () => {
    const result = shiftPostSchema.safeParse({ ...valid, onsiteContactPhone: "555", onsiteContactName: "", workDescription: "short" });
    expect(result.success).toBe(false);
    const fields = result.error?.issues.map((issue) => issue.path.join("."));
    expect(fields).toEqual(expect.arrayContaining(["onsiteContactPhone", "onsiteContactName", "workDescription"]));
  });
});
