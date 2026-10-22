// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cron/heartbeat/route";

const env = vi.hoisted(() => ({ CRON_SECRET: undefined as string | undefined }));
const zipLookupService = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/server/container", () => ({ buildContainer: () => ({ zipLookupService }) }));

const request = (authorization?: string) =>
  new Request("http://localhost:3000/api/cron/heartbeat", {
    headers: authorization ? { authorization } : {},
  });

describe("GET /api/cron/heartbeat", () => {
  beforeEach(() => {
    env.CRON_SECRET = undefined;
    zipLookupService.lookup.mockReset();
  });

  it("refuses every call until CRON_SECRET is set, and a wrong token after", async () => {
    expect((await GET(request("Bearer anything"))).status).toBe(503);
    env.CRON_SECRET = "s3cret";
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    expect(zipLookupService.lookup).not.toHaveBeenCalled();
  });

  it("touches the database through the launch-area check for a fixed ZIP", async () => {
    env.CRON_SECRET = "s3cret";
    zipLookupService.lookup.mockResolvedValue({ city: "Houston", state: "TX", inServiceArea: true });
    const response = await GET(request("Bearer s3cret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, database: "reachable", inServiceArea: true });
    expect(zipLookupService.lookup).toHaveBeenCalledWith("77002");
  });

  it("tries once more after a first failure (a cold server's first call), and fails loudly after a second", async () => {
    vi.useFakeTimers();
    try {
      env.CRON_SECRET = "s3cret";
      zipLookupService.lookup
        .mockRejectedValueOnce(new Error("fetch failed"))
        .mockResolvedValueOnce({ city: "Houston", state: "TX", inServiceArea: true });
      const pending = GET(request("Bearer s3cret"));
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).status).toBe(200);
      expect(zipLookupService.lookup).toHaveBeenCalledTimes(2);

      zipLookupService.lookup.mockReset().mockRejectedValue(new Error("connection refused"));
      const failing = GET(request("Bearer s3cret")).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(await failing).toMatchObject({ message: "connection refused" });
      expect(zipLookupService.lookup).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
