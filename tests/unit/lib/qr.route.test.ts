// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/q/[slug]/route";

const scanService = vi.hoisted(() => ({ resolveScan: vi.fn() }));
vi.mock("@/server/container", () => ({ buildScanService: () => scanService }));

const request = (slug: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://fleetgridus.com/q/${slug}`, { headers });

describe("GET /q/[slug]", () => {
  beforeEach(() => {
    scanService.resolveScan.mockReset();
  });

  it("logs the scan with the address and browser, and redirects with the tags", async () => {
    scanService.resolveScan.mockResolvedValue({
      to: "/?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=loves-hwy-225",
      tagged: true,
    });
    const response = await GET(request("loves-hwy-225", { "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0" }), {
      params: Promise.resolve({ slug: "loves-hwy-225" }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://fleetgridus.com/?utm_source=flyer&utm_medium=qr&utm_campaign=pasadena-225&utm_content=loves-hwy-225",
    );
    expect(scanService.resolveScan).toHaveBeenCalledWith({ slug: "loves-hwy-225", ip: "203.0.113.9", userAgent: "Mozilla/5.0" });
  });

  it("sends an unknown code home, untagged", async () => {
    scanService.resolveScan.mockResolvedValue({ to: "/", tagged: false });
    const response = await GET(request("nothing"), { params: Promise.resolve({ slug: "nothing" }) });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://fleetgridus.com/");
  });

  it("still sends the visitor home when logging fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    scanService.resolveScan.mockRejectedValue(new Error("database down"));
    const response = await GET(request("loves-hwy-225"), { params: Promise.resolve({ slug: "loves-hwy-225" }) });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://fleetgridus.com/");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
