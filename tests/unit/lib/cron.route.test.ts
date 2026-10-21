// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/reconcile-subscriptions/route";

const env = vi.hoisted(() => ({ CRON_SECRET: undefined as string | undefined }));
const subscriptionService = vi.hoisted(() => ({ reconcileAll: vi.fn() }));

vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/server/container", () => ({ buildContainer: () => ({ subscriptionService }) }));

const request = (authorization?: string) =>
  new Request("http://localhost:3000/api/cron/reconcile-subscriptions", {
    headers: authorization ? { authorization } : {},
  });

describe("GET /api/cron/reconcile-subscriptions", () => {
  beforeEach(() => {
    env.CRON_SECRET = undefined;
    subscriptionService.reconcileAll.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("refuses every call until CRON_SECRET is set", async () => {
    const response = await GET(request("Bearer anything"));
    expect(response.status).toBe(503);
    expect(subscriptionService.reconcileAll).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong bearer token", async () => {
    env.CRON_SECRET = "s3cret";
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect((await GET(request("s3cret"))).status).toBe(401);
    expect(subscriptionService.reconcileAll).not.toHaveBeenCalled();
  });

  it("reconciles with the right token and reports the counts", async () => {
    env.CRON_SECRET = "s3cret";
    subscriptionService.reconcileAll.mockResolvedValue({ carriers: 3, checked: 2, changed: 1, failed: 0 });
    const response = await GET(request("Bearer s3cret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      carriers: 3,
      checked: 2,
      changed: 1,
      failed: 0,
    });
  });
});
