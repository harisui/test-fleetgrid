// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as remindersCron } from "@/app/api/cron/reminders/route";
import { GET as shiftsCron } from "@/app/api/cron/shifts/route";
import { POST as inbound } from "@/app/api/twilio/inbound/route";
import { POST as status } from "@/app/api/twilio/status/route";
import { twilioSignature } from "@/server/twilio/signature";

const env = vi.hoisted(() => ({ TWILIO_AUTH_TOKEN: undefined as string | undefined, CRON_SECRET: "s3cret" }));
const services = vi.hoisted(() => ({
  inboundService: { handle: vi.fn(), handleStatus: vi.fn() },
  broadcastService: { dispatchDue: vi.fn() },
  shifts: { expire: vi.fn() },
  notificationService: { sendDueApprovalTexts: vi.fn(), sendDueReminders: vi.fn(), sendDueWelcomeTexts: vi.fn() },
  noticeService: { dispatchDue: vi.fn() },
  docReminderService: { dispatchDue: vi.fn() },
}));

vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));
vi.mock("@/server/container", () => ({ buildTextingServices: () => services }));

const TOKEN = "test-auth-token";
const REPLY = { MessageSid: "SM0123456789", From: "+15555553001", To: "+18888692040", Body: "YES 4821", AccountSid: "AC1" };

/** A request as Twilio sends it: form-encoded, signed for `signedUrl`. */
function signed(path: string, params: Record<string, string>, signedUrl: string, token = TOKEN): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": twilioSignature(token, signedUrl, params),
    },
    body: new URLSearchParams(params),
  });
}

describe("POST /api/twilio/inbound", () => {
  beforeEach(() => {
    env.TWILIO_AUTH_TOKEN = TOKEN;
    services.inboundService.handle.mockReset().mockResolvedValue({});
  });

  it("handles a reply signed for the exact public URL and answers with empty TwiML", async () => {
    const response = await inbound(signed("/api/twilio/inbound", REPLY, "https://fleetgridus.com/api/twilio/inbound"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/xml");
    expect(await response.text()).toContain("<Response></Response>");
    expect(services.inboundService.handle).toHaveBeenCalledWith({
      sid: "SM0123456789",
      from: "+15555553001",
      to: "+18888692040",
      body: "YES 4821",
      optOutType: null,
    });
  });

  it("passes Twilio's OptOutType on", async () => {
    const params = { ...REPLY, Body: "STOP", OptOutType: "STOP" };
    await inbound(signed("/api/twilio/inbound", params, "https://fleetgridus.com/api/twilio/inbound"));
    expect(services.inboundService.handle).toHaveBeenCalledWith(expect.objectContaining({ optOutType: "STOP" }));
  });

  it("refuses a signature made for www, a preview or the local address", async () => {
    for (const url of [
      "https://www.fleetgridus.com/api/twilio/inbound",
      "https://fleetgrid-git-main-preview.vercel.app/api/twilio/inbound",
      "http://localhost:3000/api/twilio/inbound",
    ]) {
      expect((await inbound(signed("/api/twilio/inbound", REPLY, url))).status, url).toBe(403);
    }
    expect(services.inboundService.handle).not.toHaveBeenCalled();
  });

  it("refuses a changed body, another token, no signature, and everything until the token is set", async () => {
    const good = signed("/api/twilio/inbound", REPLY, "https://fleetgridus.com/api/twilio/inbound");
    const tampered = new Request(good.url, {
      method: "POST",
      headers: good.headers,
      body: new URLSearchParams({ ...REPLY, Body: "YES 9999" }),
    });
    expect((await inbound(tampered)).status).toBe(403);
    expect((await inbound(signed("/api/twilio/inbound", REPLY, "https://fleetgridus.com/api/twilio/inbound", "other"))).status).toBe(403);
    const unsigned = new Request("http://localhost:3000/api/twilio/inbound", { method: "POST", body: new URLSearchParams(REPLY) });
    expect((await inbound(unsigned)).status).toBe(403);
    env.TWILIO_AUTH_TOKEN = undefined;
    expect((await inbound(signed("/api/twilio/inbound", REPLY, "https://fleetgridus.com/api/twilio/inbound"))).status).toBe(503);
    expect(services.inboundService.handle).not.toHaveBeenCalled();
  });
});

describe("POST /api/twilio/status", () => {
  beforeEach(() => {
    env.TWILIO_AUTH_TOKEN = TOKEN;
    services.inboundService.handleStatus.mockReset();
  });

  it("records a signed delivery report", async () => {
    const params = { MessageSid: "SM1", MessageStatus: "undelivered", ErrorCode: "30005" };
    const response = await status(signed("/api/twilio/status", params, "https://fleetgridus.com/api/twilio/status"));
    expect(response.status).toBe(204);
    expect(services.inboundService.handleStatus).toHaveBeenCalledWith({ sid: "SM1", status: "undelivered", errorCode: "30005" });
  });

  it("refuses one signed for the inbound URL", async () => {
    const params = { MessageSid: "SM1", MessageStatus: "delivered" };
    expect((await status(signed("/api/twilio/status", params, "https://fleetgridus.com/api/twilio/inbound"))).status).toBe(403);
  });
});

describe("GET /api/cron/shifts", () => {
  it("needs the cron token, then expires and sends what is due, the held approval, welcome and documents texts too", async () => {
    services.shifts.expire.mockResolvedValue(2);
    services.broadcastService.dispatchDue.mockResolvedValue(1);
    services.notificationService.sendDueApprovalTexts.mockResolvedValue(3);
    services.noticeService.dispatchDue.mockResolvedValue(5);
    services.notificationService.sendDueWelcomeTexts.mockResolvedValue(6);
    services.docReminderService.dispatchDue.mockResolvedValue(7);
    expect((await shiftsCron(new Request("http://localhost/api/cron/shifts"))).status).toBe(401);
    const response = await shiftsCron(
      new Request("http://localhost/api/cron/shifts", { headers: { authorization: "Bearer s3cret" } }),
    );
    expect(await response.json()).toEqual({ ok: true, expired: 2, dispatched: 1, approvals: 3, notices: 5, welcomes: 6, docReminders: 7 });
  });
});

describe("GET /api/cron/reminders", () => {
  it("needs the cron token, then sends the due reminders", async () => {
    services.notificationService.sendDueReminders.mockResolvedValue(4);
    expect((await remindersCron(new Request("http://localhost/api/cron/reminders"))).status).toBe(401);
    const response = await remindersCron(
      new Request("http://localhost/api/cron/reminders", { headers: { authorization: "Bearer s3cret" } }),
    );
    expect(await response.json()).toEqual({ ok: true, reminders: 4 });
  });
});
